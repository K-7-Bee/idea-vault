import type { NextRequest } from "next/server";
import { denied, json, routeOwner, sameOrigin } from "@/lib/drive/route-helpers";
import { removeUnusedPublicFiles } from "@/lib/public-files";

// Removes public copies of library files that the published profile no longer uses (Phase 4C).
// Called by the profile editor after the homepage shows a new version, and when the Portfolio or
// Files page opens. Never touches the private library.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  const result = await removeUnusedPublicFiles(session.supabase, session.owner.id);
  return result ? json({ ok: true, ...result }) : json({ error: "unavailable" }, 503);
}
