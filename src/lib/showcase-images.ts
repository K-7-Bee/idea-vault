import type { SupabaseClient } from "@supabase/supabase-js";
import { fileMedia } from "./drive/google";
import { PUBLIC_IMAGE_MAX, PUBLIC_IMAGE_TYPES, sniffImage } from "./showcase";

// Server only. Public copies of showcase images in the "showcase" bucket (migration 013), stored as
// <owner id>/<random uuid>.<ext>. The Drive original is only read, never shared or changed.

const BUCKET = "showcase";
// Visitors' browsers and the storage CDN may keep a copy this long after it is removed.
const PUBLIC_CACHE_SECONDS = "60";
// Unreferenced files younger than this may belong to a publish still in progress elsewhere.
const ORPHAN_GRACE_MS = 5 * 60_000;

export class CopyError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

// Reads at most `max` bytes; anything longer is refused rather than truncated.
async function readCapped(response: Response, max: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > max) return null;
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

// Copies one Drive image into the public bucket and returns its path. The bytes must really be a
// JPEG, PNG or WebP (checked from the bytes, not the name or Drive's label) and at most 5 MB.
export async function copyImage(supabase: SupabaseClient, ownerId: string, accessToken: string, driveFileId: string, label: string): Promise<string> {
  let response: Response;
  try {
    response = await fileMedia(accessToken, driveFileId, null);
  } catch {
    throw new CopyError(`Google Drive couldn't be reached for ${label}. Try again.`, 502);
  }
  if (response.status === 404) throw new CopyError(`${label} is no longer in Drive. Run Check files, then choose another image.`, 409);
  if (response.status === 401) throw new CopyError("Google Drive needs reconnecting. Open Settings and reconnect Drive.", 409);
  if (response.status !== 200) throw new CopyError(`Google Drive couldn't send ${label}. Try again.`, 502);
  const bytes = await readCapped(response, PUBLIC_IMAGE_MAX);
  if (!bytes) throw new CopyError(`${label} is larger than 5 MB.`, 413);
  const type = sniffImage(bytes);
  if (!type) throw new CopyError(`${label} isn't a JPEG, PNG or WebP image.`, 415);
  const path = `${ownerId}/${crypto.randomUUID()}.${PUBLIC_IMAGE_TYPES[type]}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: false, cacheControl: PUBLIC_CACHE_SECONDS });
  if (error) throw new CopyError(`Couldn't store the public copy of ${label}. Try again.`, 502);
  return path;
}

// Removes specific public copies. Only paths in the owner's own folder are ever touched.
export async function removeImages(supabase: SupabaseClient, ownerId: string, paths: string[]): Promise<boolean> {
  const own = paths.filter((p) => p.startsWith(`${ownerId}/`) && !p.includes(".."));
  if (!own.length) return true;
  try {
    const { error } = await supabase.storage.from(BUCKET).remove(own);
    return !error;
  } catch {
    return false;
  }
}

// Removes the owner's public copies that no published showcase uses any more, for example after a
// project was moved out of Completed in the editor (the database drops the snapshot itself, but
// it can't delete stored files). Files younger than a few minutes are left for a publish in progress.
export async function removeOrphans(supabase: SupabaseClient, ownerId: string, now = Date.now()): Promise<{ removed: number } | null> {
  try {
    const [listed, live] = await Promise.all([
      supabase.storage.from(BUCKET).list(ownerId, { limit: 1000, sortBy: { column: "created_at", order: "asc" } }),
      supabase.from("showcases").select("images").limit(1000),
    ]);
    if (listed.error || live.error || !Array.isArray(listed.data) || !Array.isArray(live.data)) return null;
    const used = new Set<string>();
    for (const row of live.data as { images: { path: string }[] | null }[]) for (const img of row.images ?? []) used.add(img.path);
    const stale = listed.data
      .filter((o) => o.name && !used.has(`${ownerId}/${o.name}`))
      .filter((o) => { const made = Date.parse(o.created_at ?? ""); return Number.isFinite(made) && now - made > ORPHAN_GRACE_MS; })
      .map((o) => `${ownerId}/${o.name}`);
    if (!stale.length) return { removed: 0 };
    return (await removeImages(supabase, ownerId, stale)) ? { removed: stale.length } : null;
  } catch {
    return null;
  }
}
