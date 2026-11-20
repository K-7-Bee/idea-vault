import type { SupabaseClient } from "@supabase/supabase-js";
import { KEY_VERSION, open, readKey, seal } from "./crypto";
import { DRIVE_SCOPE } from "./flow";
import { GoogleError, googleConfig, refreshAccess, type GoogleConfig } from "./google";

// Server only. Loads and stores the owner's single Drive connection through the owner's own
// Supabase session (row level security), and hands out a fresh access token when needed.

const TABLE = "drive_connections";
const COLUMNS = "user_id, google_account_id, google_email, scope, refresh_token_enc, access_token_enc, access_token_expires_at, key_version, folder_id, folder_name, connected_at";
// Refresh a little early so a token never expires halfway through a request.
const EARLY_MS = 60_000;

export type ConnectionRow = {
  user_id: string;
  google_account_id: string;
  google_email: string;
  scope: string;
  refresh_token_enc: string;
  access_token_enc: string | null;
  access_token_expires_at: string | null;
  key_version: number;
  folder_id: string | null;
  folder_name: string | null;
  connected_at: string;
};

export type DriveStatus =
  | { state: "not_configured" }
  | { state: "unavailable" }
  | { state: "not_connected" }
  | { state: "connected" | "reconnect"; account: string; folder: { id: string; name: string } | null; connectedAt: string };

const refreshContext = (userId: string) => `refresh:${userId}`;
const accessContext = (userId: string) => `access:${userId}`;

export function driveConfigured(env: Record<string, string | undefined> = process.env): boolean {
  if (!googleConfig(env)) return false;
  try { readKey(env.DRIVE_TOKEN_KEY); return true; } catch { return false; }
}

// undefined: the read failed. null: no connection.
export async function loadConnection(supabase: SupabaseClient, userId: string): Promise<ConnectionRow | null | undefined> {
  const result = await supabase.from(TABLE).select(COLUMNS).eq("user_id", userId).limit(1).then((r) => r, () => null);
  if (!result || result.error || !Array.isArray(result.data)) return undefined;
  return (result.data[0] as ConnectionRow | undefined) ?? null;
}

export async function saveConnection(supabase: SupabaseClient, userId: string, input: {
  accountId: string; email: string; refreshToken: string; accessToken: string; expiresIn: number; now: number;
}): Promise<boolean> {
  const key = readKey();
  const row = {
    user_id: userId,
    google_account_id: input.accountId,
    google_email: input.email.trim().toLowerCase(),
    scope: DRIVE_SCOPE,
    refresh_token_enc: seal(input.refreshToken, refreshContext(userId), key),
    access_token_enc: seal(input.accessToken, accessContext(userId), key),
    access_token_expires_at: new Date(input.now + input.expiresIn * 1000).toISOString(),
    key_version: KEY_VERSION,
  };
  const result = await supabase.from(TABLE).upsert(row, { onConflict: "user_id" }).then((r) => r, () => null);
  return !!result && !result.error;
}

export async function deleteConnection(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const result = await supabase.from(TABLE).delete().eq("user_id", userId).then((r) => r, () => null);
  return !!result && !result.error;
}

export async function saveFolder(supabase: SupabaseClient, userId: string, folder: { id: string; name: string }): Promise<boolean> {
  const result = await supabase.from(TABLE).update({ folder_id: folder.id, folder_name: folder.name.slice(0, 500) })
    .eq("user_id", userId).select("user_id").then((r) => r, () => null);
  return !!result && !result.error && Array.isArray(result.data) && result.data.length === 1;
}

// The stored refresh token, for revocation on disconnect.
export function storedRefreshToken(row: ConnectionRow): string | null {
  try { return open(row.refresh_token_enc, refreshContext(row.user_id)); } catch { return null; }
}

export type AccessResult =
  | { ok: true; token: string; expiresAt: number; row: ConnectionRow }
  | { ok: false; reason: "not_configured" | "not_connected" | "reconnect" | "unavailable" };

export async function accessToken(supabase: SupabaseClient, userId: string, now: number, config: GoogleConfig | null = googleConfig()): Promise<AccessResult> {
  if (!config || !driveConfigured()) return { ok: false, reason: "not_configured" };
  const row = await loadConnection(supabase, userId);
  if (row === undefined) return { ok: false, reason: "unavailable" };
  if (row === null) return { ok: false, reason: "not_connected" };
  const key = readKey();

  const expiresAt = row.access_token_expires_at ? Date.parse(row.access_token_expires_at) : 0;
  if (expiresAt - EARLY_MS > now) {
    const current = open(row.access_token_enc, accessContext(userId), key);
    if (current) return { ok: true, token: current, expiresAt, row };
  }

  // A key change or damaged value cannot be repaired here; the owner reconnects.
  const refresh = open(row.refresh_token_enc, refreshContext(userId), key);
  if (!refresh) return { ok: false, reason: "reconnect" };
  let fresh;
  try {
    fresh = await refreshAccess(config, refresh);
  } catch (error) {
    // invalid_grant: revoked, expired (7 days in Testing mode) or the password changed.
    if (error instanceof GoogleError && (error.code === "invalid_grant" || error.status === 401)) return { ok: false, reason: "reconnect" };
    return { ok: false, reason: "unavailable" };
  }
  const nextExpiry = now + fresh.expires_in * 1000;
  // Saving the new access token is an optimisation; a failed save only means refreshing again.
  await supabase.from(TABLE).update({
    access_token_enc: seal(fresh.access_token, accessContext(userId), key),
    access_token_expires_at: new Date(nextExpiry).toISOString(),
  }).eq("user_id", userId).then((r) => r, () => null);
  return { ok: true, token: fresh.access_token, expiresAt: nextExpiry, row };
}

// The Settings page's current, verified status (may refresh the token with Google).
export function currentDriveStatus(supabase: SupabaseClient, userId: string): Promise<DriveStatus> {
  return driveStatus(supabase, userId, Date.now(), true);
}

// What the Settings page shows. Checks the token only when asked to, because that may call Google.
export async function driveStatus(supabase: SupabaseClient, userId: string, now: number, verify: boolean): Promise<DriveStatus> {
  if (!driveConfigured()) return { state: "not_configured" };
  const row = await loadConnection(supabase, userId);
  if (row === undefined) return { state: "unavailable" };
  if (row === null) return { state: "not_connected" };
  const describe = (state: "connected" | "reconnect"): DriveStatus => ({
    state,
    account: row.google_email,
    folder: row.folder_id && row.folder_name ? { id: row.folder_id, name: row.folder_name } : null,
    connectedAt: row.connected_at,
  });
  if (!open(row.refresh_token_enc, refreshContext(userId))) return describe("reconnect");
  if (!verify) return describe("connected");
  const access = await accessToken(supabase, userId, now);
  if (access.ok) return describe("connected");
  if (access.reason === "reconnect") return describe("reconnect");
  if (access.reason === "not_connected") return { state: "not_connected" };
  return access.reason === "not_configured" ? { state: "not_configured" } : { state: "unavailable" };
}
