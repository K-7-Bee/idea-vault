import type { NextRequest } from "next/server";
import { accessToken } from "@/lib/drive/connection";
import { denied, json, routeOwner, sameOrigin } from "@/lib/drive/route-helpers";

// Google Picker runs in the browser and needs a short-lived drive.file access token. This is the
// only place a token reaches the browser; the refresh token never does. The page keeps it in
// memory for the picker only.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  const access = await accessToken(session.supabase, session.owner.id, Date.now());
  if (!access.ok) return json({ error: access.reason }, access.reason === "unavailable" ? 503 : 409);
  return json({ token: access.token, expiresAt: access.expiresAt });
}
