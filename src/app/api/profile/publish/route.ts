import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { denied, json, routeOwner, sameOrigin } from "@/lib/drive/route-helpers";
import { DRAFT_COLUMNS, asDraft, publishProblems } from "@/lib/profile";
import { PROFILE_TAG } from "@/lib/profile-public";

// Publishes the owner's saved profile draft (Phase 4B). The owner confirmed exactly this draft
// version in the editor; if it changed since, nothing is published. publish_profile writes the
// history entry and the public copy in one transaction.
//
// Then the homepage cache is marked stale. "max" means a failed rebuild keeps the last good page
// ({ expire: 0 } served the build-time page instead; see tests/browser/profile.spec.ts). The tag is
// applied once this response is sent, so the editor, not this route, then requests the homepage
// until it shows publishedAt: its first request takes the previous page and starts the rebuild.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  const body = await request.json().catch(() => null) as { draftVersion?: unknown } | null;
  if (!body || !Number.isSafeInteger(body.draftVersion)) return json({ error: "invalid" }, 400);
  const { supabase, owner } = session;

  const draft = await supabase.from("profile_drafts").select(DRAFT_COLUMNS).eq("user_id", owner.id).maybeSingle().then((r) => r, () => null);
  if (!draft || draft.error) return json({ error: "unavailable", message: "Couldn't load the profile. Nothing changed on your public site. Try again." }, 503);
  if (!draft.data || draft.data.version !== body.draftVersion) {
    return json({ error: "changed", message: "The profile changed since you checked it. Review it again before publishing." }, 409);
  }
  const problems = publishProblems(asDraft(draft.data as never).content);
  if (problems.length) return json({ error: "not_ready", message: problems[0], problems }, 409);

  const published = await supabase.rpc("publish_profile", { p_draft_version: body.draftVersion }).then((r) => r, () => null);
  if (!published || published.error || typeof published.data !== "number") {
    const code = published?.error?.code;
    if (code === "40001") return json({ error: "changed", message: "The profile changed since you checked it. Review it again before publishing." }, 409);
    if (code === "23514") return json({ error: "not_ready", message: published!.error!.message }, 409);
    if (code === "42501") return json({ error: "not_site_owner", message: "This account isn't recorded as the site owner, so it can't publish the profile." }, 403);
    return json({ error: "failed", message: "Couldn't publish. Nothing changed on your public site. Try again." }, 502);
  }

  revalidateTag(PROFILE_TAG, "max");
  const row = await supabase.from("profile_published").select("published_at").limit(1).then((r) => r, () => null);
  const publishedAt = row && !row.error && Array.isArray(row.data) ? (row.data[0] as { published_at?: string } | undefined)?.published_at : undefined;
  return json({ ok: true, version: published.data, publishedAt: publishedAt ?? null });
}
