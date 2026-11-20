import type { NextRequest } from "next/server";
import { deleteConnection, loadConnection, storedRefreshToken } from "@/lib/drive/connection";
import { revoke } from "@/lib/drive/google";
import { denied, json, routeOwner, sameOrigin } from "@/lib/drive/route-helpers";

// Revokes the grant at Google, then forgets it. The row is removed even if Google can't be
// reached, and the page then tells the owner to remove access in their Google account.
// Files already in Drive are never touched.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  const row = await loadConnection(session.supabase, session.owner.id);
  if (row === undefined) return json({ error: "unavailable" }, 503);
  if (row === null) return json({ ok: true, revoked: true });

  const token = storedRefreshToken(row);
  const revoked = token ? await revoke(token) : false;
  const removed = await deleteConnection(session.supabase, session.owner.id);
  if (!removed) return json({ error: "storage", revoked }, 503);
  return json({ ok: true, revoked });
}
