import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { denied, json, routeOwner, sameOrigin } from "@/lib/drive/route-helpers";
import { LIBRARY_ID } from "@/lib/journal";
import { JOURNAL_TAG } from "@/lib/journal-public";

// Takes one journal entry off the public site (Phase 4D). Its page is gone on the next request (the
// pages read at request time); the homepage's Journal link is refreshed by tag and confirmed by the
// editor. Public image copies are removed afterwards by /api/profile/cleanup.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  const body = await request.json().catch(() => null) as { entryId?: unknown } | null;
  if (!body || typeof body.entryId !== "string" || !LIBRARY_ID.test(body.entryId)) return json({ error: "invalid" }, 400);
  const { supabase } = session;

  const result = await supabase.rpc("unpublish_journal_entry", { p_entry: body.entryId }).then((r) => r, () => null);
  if (!result || result.error) {
    if (result?.error?.code === "42501") return json({ error: "not_site_owner", message: "This account isn't recorded as the site owner." }, 403);
    return json({ error: "failed", message: "Couldn't unpublish. The entry is still public. Try again." }, 502);
  }
  revalidateTag(JOURNAL_TAG, "max");
  const count = await supabase.rpc("journal_public").then((r) => (!r.error && Array.isArray(r.data) ? r.data.length : null), () => null);
  return json({ ok: true, removed: result.data === true, count });
}
