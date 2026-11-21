import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { denied, json, routeOwner, sameOrigin } from "@/lib/drive/route-helpers";
import { ENTRY_COLUMNS, LIBRARY_ID, asEntry, publishProblems } from "@/lib/journal";
import { JOURNAL_TAG } from "@/lib/journal-public";
import { PublicFileError, ensurePublicCopy, loadLibraryFiles } from "@/lib/public-files";

// Publishes one journal entry (Phase 4D): exactly the draft version the owner confirmed. Each image
// first gets a public copy without metadata (4C); publish_journal_entry then writes the snapshot
// with only the copies' names. The homepage's Journal link is refreshed by tag ("max": a failed
// rebuild keeps the last good page); the editor then requests the homepage until it shows `count`.
// The entry pages themselves read at request time and need no refresh.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  const body = await request.json().catch(() => null) as { entryId?: unknown; draftVersion?: unknown } | null;
  if (!body || typeof body.entryId !== "string" || !LIBRARY_ID.test(body.entryId) || !Number.isSafeInteger(body.draftVersion)) {
    return json({ error: "invalid" }, 400);
  }
  const { supabase, owner } = session;
  const changed = () => json({ error: "changed", message: "The entry changed since you checked it. Review it again before publishing." }, 409);

  const row = await supabase.from("journal_entries").select(ENTRY_COLUMNS).eq("id", body.entryId).eq("user_id", owner.id).maybeSingle().then((r) => r, () => null);
  if (!row || row.error) return json({ error: "unavailable", message: "Couldn't load the entry. Nothing changed on your public site. Try again." }, 503);
  if (!row.data) return changed();
  const entry = asEntry(row.data as Record<string, unknown>);
  if (entry.version !== body.draftVersion) return changed();

  const ids = entry.images.map((i) => i.file);
  const library = await loadLibraryFiles(supabase, owner.id, ids);
  if (!library) return json({ error: "unavailable", message: "Couldn't load your files library. Nothing changed on your public site. Try again." }, 503);
  const problems = publishProblems(entry, new Set(library.filter((f) => f.kind === "image").map((f) => f.id)));
  if (problems.length) return json({ error: "not_ready", message: problems[0], problems }, 409);
  for (const [k, img] of entry.images.entries()) {
    try {
      await ensurePublicCopy(supabase, owner.id, library.find((f) => f.id === img.file)!, `image ${k + 1}`);
    } catch (error) {
      const known = error instanceof PublicFileError;
      return json({ error: "file", message: `${known ? error.message : `Couldn't prepare image ${k + 1}.`} Nothing changed on your public site.` }, known && error.status < 500 ? 409 : 502);
    }
  }

  const published = await supabase.rpc("publish_journal_entry", { p_entry: entry.id, p_draft_version: entry.version }).then((r) => r, () => null);
  if (!published || published.error || typeof published.data !== "string") {
    const code = published?.error?.code;
    if (code === "40001") return changed();
    if (code === "23505") return json({ error: "address_taken", message: "Another published entry already uses this address. Choose a different one." }, 409);
    if (code === "23514" || code === "55000") return json({ error: "not_ready", message: published!.error!.message }, 409);
    if (code === "42501") return json({ error: "not_site_owner", message: "This account isn't recorded as the site owner, so it can't publish." }, 403);
    return json({ error: "failed", message: "Couldn't publish. Nothing changed on your public site. Try again." }, 502);
  }

  revalidateTag(JOURNAL_TAG, "max");
  const count = await supabase.rpc("journal_public").then((r) => (!r.error && Array.isArray(r.data) ? r.data.length : null), () => null);
  return json({ ok: true, publishedAt: published.data, count });
}
