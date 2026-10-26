import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET, IDEA_COLUMNS, safeFileName, withFileUrls, type Idea, type RawIdea } from "./ideas";
import type { QueuedIdea } from "./outbox";

// Thrown when there's simply no connection, so the idea should stay queued and retry later.
export class NetworkError extends Error {}

export function looksOffline(message: string) {
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(message);
}

type Failure = { message: string; code?: string } | null;

function check(error: Failure, allowDuplicate = false) {
  if (!error) return;
  if (allowDuplicate && (error.code === "23505" || /already exists/i.test(error.message))) return;
  if (looksOffline(error.message) || !navigator.onLine) throw new NetworkError(error.message);
  throw new Error(error.message);
}

// Sends one queued idea (and its files) to Supabase. Safe to run again after a failure:
// the idea and every file have fixed ids, so anything already sent is skipped, not duplicated.
export async function pushIdea(
  supabase: SupabaseClient,
  item: QueuedIdea,
): Promise<{ idea: Idea; failures: string[] }> {
  const added = await supabase.from("ideas").insert({
    id: item.id,
    content: item.content,
    tags: item.tags,
    created_at: item.created_at,
  });
  check(added.error, true);

  const failures: string[] = [];
  if (item.files.length) {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) throw new Error("Log in again to finish syncing.");

    for (const { id, file } of item.files) {
      const path = `${userId}/${item.id}/${id}-${safeFileName(file.name)}`;
      try {
        const up = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type || undefined });
        check(up.error, true);
        const rec = await supabase.from("idea_files").insert({
          id,
          idea_id: item.id,
          path,
          name: file.name,
          mime_type: file.type || null,
          size: file.size,
        });
        check(rec.error, true);
      } catch (e) {
        if (e instanceof NetworkError) throw e;
        failures.push(`${file.name}: ${e instanceof Error ? e.message : "could not save"}`);
      }
    }
  }

  const saved = await supabase.from("ideas").select(IDEA_COLUMNS).eq("id", item.id).single();
  check(saved.error);
  const [idea] = await withFileUrls(supabase, [saved.data as unknown as RawIdea]);
  return { idea, failures };
}
