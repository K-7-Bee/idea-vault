import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { open, seal } from "./crypto";

// Pure OAuth decisions for connecting Drive. No network and no Next.js here, so it is unit tested directly.

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const STATE_COOKIE = "vault_drive_oauth";
export const STATE_TTL_MS = 10 * 60 * 1000;
const STATE_CONTEXT = "oauth-state";

export type OAuthStart = { cookie: string; state: string; challenge: string };

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// One random state and PKCE verifier per attempt, sealed into a cookie bound to the Vault user.
export function startOAuth(userId: string, now: number, key?: Buffer): OAuthStart {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const cookie = seal(JSON.stringify({ state, verifier, uid: userId, exp: now + STATE_TTL_MS }), STATE_CONTEXT, key);
  return { cookie, state, challenge: pkceChallenge(verifier) };
}

export type CallbackCheck = { ok: true; verifier: string } | { ok: false; reason: "state" | "expired" | "user" };

export function checkCallback(cookie: string | undefined, state: string | null, userId: string, now: number, key?: Buffer): CallbackCheck {
  const raw = open(cookie, STATE_CONTEXT, key);
  if (!raw || !state) return { ok: false, reason: "state" };
  let saved: { state?: unknown; verifier?: unknown; uid?: unknown; exp?: unknown };
  try { saved = JSON.parse(raw); } catch { return { ok: false, reason: "state" }; }
  if (typeof saved.state !== "string" || typeof saved.verifier !== "string") return { ok: false, reason: "state" };
  const expected = Buffer.from(saved.state), given = Buffer.from(state);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "state" };
  if (typeof saved.exp !== "number" || saved.exp < now) return { ok: false, reason: "expired" };
  if (saved.uid !== userId) return { ok: false, reason: "user" };
  return { ok: true, verifier: saved.verifier };
}

// Google returns the granted scopes space separated. Exactly drive.file is accepted: a missing
// scope cannot work and any broader one was never approved (decision V-007a).
export function scopeIsExact(scope: unknown): boolean {
  if (typeof scope !== "string") return false;
  const granted = new Set(scope.split(/\s+/).filter(Boolean));
  return granted.size === 1 && granted.has(DRIVE_SCOPE);
}

export function allowedGoogleAccount(env: Record<string, string | undefined> = process.env): string | null {
  const value = (env.DRIVE_GOOGLE_ACCOUNT || env.ALLOWED_EMAIL || "").trim().toLowerCase();
  return value || null;
}

export function accountAllowed(email: unknown, env?: Record<string, string | undefined>): boolean {
  const allowed = allowedGoogleAccount(env);
  return !!allowed && typeof email === "string" && email.trim().toLowerCase() === allowed;
}

// Drive file and folder IDs are opaque URL-safe strings.
export function validDriveId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(id);
}

// Result codes shown on the Settings page after the callback. Never contains Google's raw text.
export const CALLBACK_RESULTS = ["connected", "denied", "state", "expired", "user", "scope", "account", "no_refresh", "google", "not_configured", "storage"] as const;
export type CallbackResult = (typeof CALLBACK_RESULTS)[number];
