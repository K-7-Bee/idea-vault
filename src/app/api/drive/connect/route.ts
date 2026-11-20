import { NextResponse, type NextRequest } from "next/server";
import { driveConfigured } from "@/lib/drive/connection";
import { STATE_COOKIE, STATE_TTL_MS, startOAuth } from "@/lib/drive/flow";
import { authorizationUrl, googleConfig } from "@/lib/drive/google";
import { callbackUri, routeOwner, secureCookie, settingsUrl, siteUrl } from "@/lib/drive/route-helpers";

// Starts connecting Google Drive: a one-time state and PKCE verifier in an HttpOnly cookie, then Google.
export async function GET(request: NextRequest) {
  const session = await routeOwner();
  if (!session) return NextResponse.redirect(siteUrl(request, "/login"), 303);
  const config = googleConfig();
  if (!config || !driveConfigured()) return NextResponse.redirect(settingsUrl(request, "not_configured"), 303);

  const start = startOAuth(session.owner.id, Date.now());
  const response = NextResponse.redirect(authorizationUrl(config, callbackUri(request), start.state, start.challenge), 303);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(STATE_COOKIE, start.cookie, {
    httpOnly: true,
    secure: secureCookie(request),
    sameSite: "lax",
    path: "/api/drive",
    maxAge: STATE_TTL_MS / 1000,
  });
  return response;
}
