import { NextResponse, type NextRequest } from "next/server";
import { driveConfigured, saveConnection } from "@/lib/drive/connection";
import { STATE_COOKIE, accountAllowed, checkCallback, scopeIsExact, type CallbackResult } from "@/lib/drive/flow";
import { aboutUser, exchangeCode, googleConfig, revoke } from "@/lib/drive/google";
import { callbackUri, routeOwner, settingsUrl, siteUrl } from "@/lib/drive/route-helpers";

// Google sends the owner back here. Every check passes before anything is stored; on any failure
// the new grant is revoked and nothing is saved.
export async function GET(request: NextRequest) {
  const finish = (result: CallbackResult) => {
    const response = NextResponse.redirect(settingsUrl(request, result), 303);
    response.headers.set("Cache-Control", "no-store");
    // Single use: the state cookie is removed whatever happens.
    response.cookies.set(STATE_COOKIE, "", { path: "/api/drive", maxAge: 0 });
    return response;
  };

  const session = await routeOwner();
  if (!session) {
    const response = NextResponse.redirect(siteUrl(request, "/login"), 303);
    response.cookies.set(STATE_COOKIE, "", { path: "/api/drive", maxAge: 0 });
    return response;
  }
  const config = googleConfig();
  if (!config || !driveConfigured()) return finish("not_configured");

  const params = request.nextUrl.searchParams;
  const check = checkCallback(request.cookies.get(STATE_COOKIE)?.value, params.get("state"), session.owner.id, Date.now());
  if (!check.ok) return finish(check.reason);
  if (params.get("error")) return finish("denied");
  const code = params.get("code");
  if (!code) return finish("google");

  let tokens;
  try {
    tokens = await exchangeCode(config, code, check.verifier, callbackUri(request));
  } catch {
    return finish("google");
  }
  const grant = tokens.refresh_token ?? tokens.access_token;
  const refuse = async (result: CallbackResult) => { await revoke(grant); return finish(result); };

  if (!scopeIsExact(tokens.scope)) return refuse("scope");
  if (!tokens.refresh_token) return refuse("no_refresh");

  let user;
  try {
    user = (await aboutUser(tokens.access_token)).user;
  } catch {
    return refuse("google");
  }
  if (!user?.permissionId || !accountAllowed(user.emailAddress)) return refuse("account");

  const saved = await saveConnection(session.supabase, session.owner.id, {
    accountId: user.permissionId,
    email: user.emailAddress!,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresIn: tokens.expires_in,
    now: Date.now(),
  });
  if (!saved) return refuse("storage");
  return finish("connected");
}
