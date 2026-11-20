import { DRIVE_SCOPE } from "./flow";

// Server only. Minimal Google OAuth and Drive calls over fetch (no SDK). Nothing here logs, and
// errors carry only Google's short error code, never a token or Google's response body.

const REAL = {
  auth: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  revoke: "https://oauth2.googleapis.com/revoke",
  drive: "https://www.googleapis.com/drive/v3",
};

// The browser acceptance build points at a local synthetic Google; ignored everywhere else.
function endpoints() {
  const test = process.env.VAULT_E2E === "1" ? process.env.DRIVE_GOOGLE_TEST_BASE : undefined;
  if (!test) return REAL;
  return { auth: `${test}/auth`, token: `${test}/token`, revoke: `${test}/revoke`, drive: `${test}/drive/v3` };
}

export class GoogleError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(`Google request failed (${status} ${code})`);
  }
}

export type GoogleConfig = { clientId: string; clientSecret: string };

export function googleConfig(env: Record<string, string | undefined> = process.env): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim(), clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function authorizationUrl(config: GoogleConfig, redirectUri: string, state: string, challenge: string): string {
  const url = new URL(endpoints().auth);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: DRIVE_SCOPE,
    access_type: "offline",
    // Always ask, so Google always returns a refresh token for this connection.
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string };

async function call(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) });
}

async function failure(response: Response): Promise<GoogleError> {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  const raw = typeof body?.error === "string" ? body.error
    : typeof (body?.error as { status?: unknown })?.status === "string" ? (body!.error as { status: string }).status : "error";
  return new GoogleError(raw.replace(/[^A-Za-z0-9_]/g, "").slice(0, 60) || "error", response.status);
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const response = await call(endpoints().token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  if (!response.ok) throw await failure(response);
  const data = await response.json() as Partial<TokenResponse>;
  if (typeof data.access_token !== "string" || typeof data.expires_in !== "number") throw new GoogleError("bad_token_response", 502);
  return data as TokenResponse;
}

export function exchangeCode(config: GoogleConfig, code: string, verifier: string, redirectUri: string) {
  return tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri,
    client_id: config.clientId, client_secret: config.clientSecret });
}

export function refreshAccess(config: GoogleConfig, refreshToken: string) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken,
    client_id: config.clientId, client_secret: config.clientSecret });
}

// Revoking the refresh token also ends every access token issued from it.
export async function revoke(token: string): Promise<boolean> {
  try {
    const response = await call(endpoints().revoke, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
    // 400 invalid_token means it is already revoked or expired, which is the goal.
    return response.ok || response.status === 400;
  } catch {
    return false;
  }
}

async function drive<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await call(`${endpoints().drive}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw await failure(response);
  return (response.status === 204 ? null : await response.json()) as T;
}

export function aboutUser(accessToken: string) {
  return drive<{ user?: { permissionId?: string; emailAddress?: string } }>(
    accessToken, "/about?fields=user(permissionId,emailAddress)");
}

export type DriveFile = { id: string; name: string; mimeType: string; trashed?: boolean; capabilities?: { canAddChildren?: boolean } };

export function getFile(accessToken: string, id: string) {
  return drive<DriveFile>(accessToken,
    `/files/${encodeURIComponent(id)}?fields=id,name,mimeType,trashed,capabilities/canAddChildren&supportsAllDrives=true`);
}

// Metadata-only create: an empty file. Used to prove the app may write into a picked folder.
export function createEmptyFile(accessToken: string, folderId: string, name: string) {
  return drive<{ id: string }>(accessToken, "/files?fields=id&supportsAllDrives=true", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parents: [folderId], mimeType: "text/plain" }),
  });
}

export function deleteFile(accessToken: string, id: string) {
  return drive<null>(accessToken, `/files/${encodeURIComponent(id)}?supportsAllDrives=true`, { method: "DELETE" });
}
