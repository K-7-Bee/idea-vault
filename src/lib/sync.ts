import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET, IDEA_COLUMNS, MAX_FILE_BYTES, safeFileName, withFileUrls, type Idea, type RawIdea } from "./ideas";
import { DriveOffline, DriveUnavailable, uploadToDrive } from "./drive/upload";
import type { QueuedIdea } from "./outbox";
import { retainDeletedIdea } from "./recovery-operations";

// Thrown when there's simply no connection, so the idea should stay queued and retry later.
export class NetworkError extends Error {}
export class QueueOwnerError extends Error {}

function assertActive(active: () => boolean) {
  if (!active()) throw new QueueOwnerError("Sync paused. Your local work is preserved.");
}

async function verifyOwner(supabase: SupabaseClient, item: QueuedIdea, active: () => boolean) {
  assertActive(active);
  if (!item.owner_id) throw new QueueOwnerError("Local work is preserved and awaiting ownership review.");
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!active() || error || !data.user || data.user.id !== item.owner_id) throw new Error();
  } catch {
    throw new QueueOwnerError("Sync paused. Log in as this capture's owner to retry.");
  }
}

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

// Keep the deletion marker until recovery metadata is durable and the row is removed.
// Stored file bytes are retained; there is deliberately no automatic purge.
export async function deleteSavedIdea(supabase: SupabaseClient, item: QueuedIdea, active = () => true) {
  await verifyOwner(supabase, item, active);
  await retainDeletedIdea(supabase, item, async () => {
    await verifyOwner(supabase, item, active);
    assertActive(active);
  });
  await verifyOwner(supabase, item, active);
  assertActive(active);
}

// Phase 3B: when Drive uploads are on, each file goes to the owner's Drive folder first. If Drive
// can't take it, a file within the Vault storage limit is stored there instead (decision V-013);
// a larger one stays queued on this device, waiting for Drive.
export type DriveSync = { enabled: boolean; upload?: typeof uploadToDrive; onProgress?: (name: string, sent: number, total: number) => void };

// Sends one queued idea (and its files) to Supabase. Safe to run again after a failure:
// the idea and every file have fixed ids, so anything already sent is skipped, not duplicated.
export async function pushIdea(
  supabase: SupabaseClient,
  item: QueuedIdea,
  active = () => true,
  drive: DriveSync = { enabled: false },
): Promise<{ idea: Idea; failures: string[]; waiting: string[]; fellBack: string[] }> {
  await verifyOwner(supabase, item, active);
  assertActive(active);
  const added = await supabase.from("ideas").insert({
    user_id: item.owner_id,
    id: item.id,
    content: item.content,
    tags: item.tags,
    created_at: item.created_at,
  });
  check(added.error, true);

  const failures: string[] = [];
  const waiting: string[] = [];
  const fellBack: string[] = [];
  if (item.files.length) {
    for (const { id, file } of item.files) {
      if (drive.enabled) {
        await verifyOwner(supabase, item, active);
        assertActive(active);
        try {
          await (drive.upload ?? uploadToDrive)({ ownerId: item.owner_id!, ideaId: item.id, fileId: id, file }, {
            active, onProgress: (sent, total) => drive.onProgress?.(file.name, sent, total) });
          continue;
        } catch (e) {
          if (e instanceof DriveOffline) {
            if (!active()) throw new QueueOwnerError("Sync paused. Your local work is preserved.");
            throw new NetworkError(e.message);
          }
          if (!(e instanceof DriveUnavailable)) {
            failures.push(`${file.name}: ${e instanceof Error ? e.message : "could not save"}`);
            continue;
          }
          if (file.size > MAX_FILE_BYTES) {
            waiting.push(file.name);
            continue;
          }
          fellBack.push(file.name);
        }
      }
      const path = `${item.owner_id}/${item.id}/${id}-${safeFileName(file.name)}`;
      try {
        await verifyOwner(supabase, item, active);
        assertActive(active);
        const up = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type || undefined });
        check(up.error, true);
        await verifyOwner(supabase, item, active);
        assertActive(active);
        const rec = await supabase.from("idea_files").insert({
          user_id: item.owner_id,
          id,
          idea_id: item.id,
          path,
          name: file.name,
          mime_type: file.type || null,
          size: file.size,
        });
        check(rec.error, true);
      } catch (e) {
        if (e instanceof NetworkError || e instanceof QueueOwnerError) throw e;
        failures.push(`${file.name}: ${e instanceof Error ? e.message : "could not save"}`);
      }
    }
  }

  await verifyOwner(supabase, item, active);
  assertActive(active);
  const saved = await supabase.from("ideas").select(IDEA_COLUMNS).eq("id", item.id).single();
  check(saved.error);
  await verifyOwner(supabase, item, active);
  assertActive(active);
  const [idea] = await withFileUrls(supabase, [saved.data as unknown as RawIdea]);
  await verifyOwner(supabase, item, active);
  assertActive(active);
  return { idea, failures, waiting, fellBack };
}
