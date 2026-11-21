import type { SupabaseClient } from "@supabase/supabase-js";
import { LIBRARY_BUCKET, LIBRARY_COLUMNS, type LibraryFile } from "./library";

// Server only. The owner's library with short-lived private links for image thumbnails (Phase 4C).
export type LibraryItem = LibraryFile & { thumb: string | null };
export const LIBRARY_LIMIT = 200;
const THUMB_SECONDS = 30 * 60;

export async function loadLibrary(supabase: SupabaseClient, ownerId: string): Promise<LibraryItem[] | null> {
  const rows = await supabase.from("library_files").select(LIBRARY_COLUMNS).eq("user_id", ownerId)
    .order("created_at", { ascending: false }).limit(LIBRARY_LIMIT).then((r) => r, () => null);
  if (!rows || rows.error || !Array.isArray(rows.data)) return null;
  const files = rows.data as LibraryFile[];
  const images = files.filter((f) => f.kind === "image");
  const thumbs = new Map<string, string>();
  if (images.length) {
    const signed = await supabase.storage.from(LIBRARY_BUCKET).createSignedUrls(images.map((f) => f.path), THUMB_SECONDS).then((r) => r, () => null);
    // Thumbnails are a convenience; the list still works without them.
    for (const s of signed && !signed.error ? signed.data ?? [] : []) if (s.path && s.signedUrl) thumbs.set(s.path, s.signedUrl);
  }
  return files.map((f) => ({ ...f, thumb: thumbs.get(f.path) ?? null }));
}
