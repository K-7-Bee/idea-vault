import type { NextRequest } from "next/server";
import { denied, json, routeOwner, sameOrigin } from "@/lib/drive/route-helpers";
import { removeOrphans } from "@/lib/showcase-images";

// Removes public image copies no published showcase uses any more (Phase 4A). Called after a
// project leaves the public site through the editor (stage, archive, showcase status) and when the
// Portfolio page opens. Never touches Drive or private files.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  const result = await removeOrphans(session.supabase, session.owner.id);
  return result ? json({ ok: true, ...result }) : json({ error: "unavailable" }, 503);
}
