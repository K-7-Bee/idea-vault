import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LIBRARY_BUCKET, LIBRARY_COLUMNS, LIBRARY_MAX, LIBRARY_TYPES, PUBLIC_BUCKET, sniffFile, type LibraryFile } from "./library";
import { PUBLIC_NAME } from "./profile";

// Server only. Public copies of files the published profile uses (Phase 4C), and the image
// clean-up shared with showcase images (Phase 4A).

// Visitors' browsers and the storage CDN may keep a copy this long after it is removed.
export const PUBLIC_CACHE_SECONDS = "60";
// Public images never exceed this after re-encoding.
export const PUBLIC_IMAGE_OUT_MAX = 5 * 1024 * 1024;
// Unreferenced copies younger than this may belong to a publish still in progress elsewhere.
const GRACE_MS = 5 * 60_000;
const MAX_EDGE = 2400;

export class PublicFileError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

// Re-encodes an image for the public site: turned upright by its orientation tag, at most 2400 px
// on the long edge, in the same format, with every metadata block (EXIF including GPS, XMP, IPTC,
// ICC profile, PNG text chunks) left out. sharp only writes metadata when asked to, and it isn't.
// Throws PublicFileError if the bytes can't be decoded.
export async function cleanImage(bytes: Uint8Array, type: "image/jpeg" | "image/png" | "image/webp"): Promise<Uint8Array> {
  let out: Buffer;
  try {
    const image = sharp(bytes, { failOn: "error", limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true });
    out = await (type === "image/png" ? image.png({ compressionLevel: 9 })
      : type === "image/webp" ? image.webp({ quality: 85 })
      : image.jpeg({ quality: 85, mozjpeg: true })).toBuffer();
  } catch {
    throw new PublicFileError("The image couldn't be read. Try saving it again as a JPEG or PNG.", 415);
  }
  if (out.length > PUBLIC_IMAGE_OUT_MAX) throw new PublicFileError("The image is still larger than 5 MB after resizing. Choose a smaller one.", 413);
  return new Uint8Array(out);
}

async function publicCopyExists(supabase: SupabaseClient, name: string): Promise<boolean> {
  const listed = await supabase.storage.from(PUBLIC_BUCKET).list("", { limit: 10, search: name });
  if (listed.error) throw new PublicFileError("Couldn't check the public files. Try again.", 502);
  return (listed.data ?? []).some((o) => o.name === name);
}

// Makes sure a library file has a public copy and returns its name. An existing copy is reused, so
// publishing again never stores the same file twice. The bytes are checked again here: a PDF must
// really be a PDF, and an image is re-encoded without metadata.
export async function ensurePublicCopy(supabase: SupabaseClient, ownerId: string, file: LibraryFile, label: string): Promise<string> {
  if (file.public_path && PUBLIC_NAME.test(file.public_path) && await publicCopyExists(supabase, file.public_path)) return file.public_path;

  const downloaded = await supabase.storage.from(LIBRARY_BUCKET).download(file.path).then((r) => r, () => null);
  if (!downloaded || downloaded.error || !downloaded.data) throw new PublicFileError(`Couldn't read the ${label} from your library. Try again.`, 502);
  const original = new Uint8Array(await downloaded.data.arrayBuffer());
  if (original.length > LIBRARY_MAX) throw new PublicFileError(`The ${label} is larger than 10 MB.`, 413);
  const type = sniffFile(original);
  if (!type || type !== file.mime_type) throw new PublicFileError(`The ${label} isn't the kind of file it claims to be. Upload it again.`, 415);

  const bytes = type === "application/pdf" ? original : await cleanImage(original, type);
  const name = `${crypto.randomUUID()}.${LIBRARY_TYPES[type].ext}`;
  const stored = await supabase.storage.from(PUBLIC_BUCKET).upload(name, bytes, { contentType: type, upsert: false, cacheControl: PUBLIC_CACHE_SECONDS });
  if (stored.error) throw new PublicFileError(`Couldn't store the public copy of the ${label}. Try again.`, 502);
  const saved = await supabase.from("library_files").update({ public_path: name }).eq("id", file.id).eq("user_id", ownerId).select("id");
  if (saved.error || !saved.data?.length) {
    await supabase.storage.from(PUBLIC_BUCKET).remove([name]).catch(() => null);
    throw new PublicFileError(`Couldn't record the public copy of the ${label}. Try again.`, 502);
  }
  return name;
}

export async function loadLibraryFiles(supabase: SupabaseClient, ownerId: string, ids: string[]): Promise<LibraryFile[] | null> {
  if (!ids.length) return [];
  const result = await supabase.from("library_files").select(LIBRARY_COLUMNS).eq("user_id", ownerId).in("id", ids).then((r) => r, () => null);
  return result && !result.error && Array.isArray(result.data) ? result.data as LibraryFile[] : null;
}

// Removes public copies the published profile no longer uses, and forgets them in the library so
// the files can be deleted. Copies younger than a few minutes are left for a publish in progress.
export async function removeUnusedPublicFiles(supabase: SupabaseClient, ownerId: string, now = Date.now()): Promise<{ removed: number } | null> {
  try {
    const [listed, live, linked] = await Promise.all([
      supabase.storage.from(PUBLIC_BUCKET).list("", { limit: 1000, sortBy: { column: "created_at", order: "asc" } }),
      supabase.from("profile_published").select("content").limit(1),
      supabase.from("library_files").select("id, public_path").eq("user_id", ownerId).not("public_path", "is", null),
    ]);
    if (listed.error || live.error || linked.error || !Array.isArray(listed.data) || !Array.isArray(live.data) || !Array.isArray(linked.data)) return null;
    const content = (live.data[0] as { content?: { resume?: { file?: unknown }; photo?: { file?: unknown } } } | undefined)?.content;
    const used = new Set([content?.resume?.file, content?.photo?.file].filter((v): v is string => typeof v === "string" && v !== ""));
    const present = new Set(listed.data.map((o) => o.name));
    const stale = listed.data
      .filter((o) => o.name && PUBLIC_NAME.test(o.name) && !used.has(o.name))
      .filter((o) => { const made = Date.parse(o.created_at ?? ""); return Number.isFinite(made) && now - made > GRACE_MS; })
      .map((o) => o.name);
    if (stale.length) {
      const removed = await supabase.storage.from(PUBLIC_BUCKET).remove(stale);
      if (removed.error) return null;
    }
    // Library entries whose copy is gone (just removed, or removed earlier) are private again.
    const gone = new Set(stale);
    const forget = (linked.data as { id: string; public_path: string }[])
      .filter((r) => !used.has(r.public_path) && (gone.has(r.public_path) || !present.has(r.public_path)))
      .map((r) => r.id);
    if (forget.length) {
      const cleared = await supabase.from("library_files").update({ public_path: null }).eq("user_id", ownerId).in("id", forget);
      if (cleared.error) return null;
    }
    return { removed: stale.length };
  } catch {
    return null;
  }
}
