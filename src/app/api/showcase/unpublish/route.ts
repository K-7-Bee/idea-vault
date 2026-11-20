import type { NextRequest } from "next/server";
import { isUuid } from "@/lib/drive/files";
import { denied, json, routeOwner, sameOrigin } from "@/lib/drive/route-helpers";
import { removeImages } from "@/lib/showcase-images";

// Takes a project off the public site (Phase 4A): the snapshot is deleted and the project goes back
// to "Ready to showcase". Its public image copies are then removed. The private draft is kept.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  const body = await request.json().catch(() => null) as { projectId?: unknown } | null;
  if (!body || !isUuid(body.projectId)) return json({ error: "invalid" }, 400);
  const { supabase, owner } = session;

  const live = await supabase.from("showcases").select("images").eq("project_id", body.projectId).maybeSingle().then((r) => r, () => null);
  if (!live || live.error) return json({ error: "unavailable", message: "Couldn't reach the database. Nothing changed. Try again." }, 503);
  const result = await supabase.rpc("unpublish_showcase", { p_project: body.projectId }).then((r) => r, () => null);
  if (!result || result.error || typeof result.data !== "number") {
    if (result?.error?.code === "P0002") return json({ error: "no_project", message: "This project doesn't exist." }, 404);
    return json({ error: "failed", message: "Couldn't unpublish. Try again." }, 502);
  }
  const paths = ((live.data as { images?: { path: string }[] } | null)?.images ?? []).map((i) => i.path);
  const cleaned = await removeImages(supabase, owner.id, paths);
  return json({ ok: true, version: result.data, cleaned });
}
