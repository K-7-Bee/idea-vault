import type { SupabaseClient } from "@supabase/supabase-js";
import type { Outcome } from "./workspace";

// Phase 4C: the owner's private files library (library_files and the private "library" bucket,
// migration 015). Files go from the browser straight to the bucket, so large PDFs don't pass
// through a Vercel function; the server checks the real bytes again before anything is published.
// Shared by the Files page, the profile editor's picker, the preview and the publish route.

export const LIBRARY_BUCKET = "library";
export const PUBLIC_BUCKET = "profile-files";
export const LIBRARY_MAX = 10 * 1024 * 1024;
export const LIBRARY_TYPES = {
  "application/pdf": { ext: "pdf", kind: "pdf" },
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/png": { ext: "png", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
} as const;
export type LibraryType = keyof typeof LIBRARY_TYPES;
export type LibraryKind = "pdf" | "image";

export type LibraryFile = {
  id: string;
  path: string;
  kind: LibraryKind;
  mime_type: LibraryType;
  bytes: number;
  sha256: string;
  name: string;
  public_path: string | null;
  created_at: string;
};
export const LIBRARY_COLUMNS = "id, path, kind, mime_type, bytes, sha256, name, public_path, created_at";

// The real type, from the first bytes; names and browser labels are not trusted.
export function sniffFile(bytes: Uint8Array): LibraryType | null {
  const at = (i: number, ...values: number[]) => values.every((v, k) => bytes[i + k] === v);
  if (bytes.length >= 5 && at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (bytes.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (bytes.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (bytes.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// A display name: the file's own name without folders or control characters, at most 200 characters.
export function displayName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "Untitled file";
}

// What an upload would be refused for, before any bytes leave the browser. Null when acceptable.
export function uploadProblem(bytes: Uint8Array, accept?: LibraryKind): string | null {
  if (bytes.length === 0) return "That file is empty.";
  if (bytes.length > LIBRARY_MAX) return "Files must be 10 MB or smaller.";
  const type = sniffFile(bytes);
  if (!type) return "Only PDF, JPEG, PNG or WebP files can go in the library.";
  if (accept && LIBRARY_TYPES[type].kind !== accept) return accept === "pdf" ? "Choose a PDF file." : "Choose a JPEG, PNG or WebP image.";
  return null;
}

const FAILED = { ok: false, reason: "failed", message: "Couldn't upload the file. Check your connection and try again." } as const;

// Uploads a file into the private library, or returns the existing entry when the same bytes are
// already there (matched by SHA-256), so nothing is stored twice.
export async function uploadToLibrary(client: SupabaseClient, ownerId: string, name: string, bytes: Uint8Array, accept?: LibraryKind):
  Promise<Outcome<{ file: LibraryFile; existing: boolean }>> {
  const problem = uploadProblem(bytes, accept);
  if (problem) return { ok: false, reason: "invalid", message: problem };
  const type = sniffFile(bytes)!;
  try {
    const sha256 = await sha256Hex(bytes);
    const found = await client.from("library_files").select(LIBRARY_COLUMNS).eq("user_id", ownerId).eq("sha256", sha256).limit(1);
    if (found.error) return FAILED;
    if (found.data?.length) return { ok: true, value: { file: found.data[0] as LibraryFile, existing: true } };

    const path = `${ownerId}/${crypto.randomUUID()}.${LIBRARY_TYPES[type].ext}`;
    const stored = await client.storage.from(LIBRARY_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
    if (stored.error) return FAILED;
    const row = { id: crypto.randomUUID(), user_id: ownerId, path, kind: LIBRARY_TYPES[type].kind, mime_type: type, bytes: bytes.length, sha256, name: displayName(name) };
    const inserted = await client.from("library_files").insert(row).select(LIBRARY_COLUMNS);
    if (inserted.error || !inserted.data?.length) {
      await client.storage.from(LIBRARY_BUCKET).remove([path]).catch(() => null);
      if (inserted.error?.code === "23505") {
        // Uploaded at the same moment elsewhere: use that entry.
        const again = await client.from("library_files").select(LIBRARY_COLUMNS).eq("user_id", ownerId).eq("sha256", sha256).limit(1);
        if (!again.error && again.data?.length) return { ok: true, value: { file: again.data[0] as LibraryFile, existing: true } };
      }
      return FAILED;
    }
    return { ok: true, value: { file: inserted.data[0] as LibraryFile, existing: false } };
  } catch {
    return FAILED;
  }
}

// Deletes a library entry and its stored file. The database refuses while the profile draft uses
// the file or while it is on the public site (migration 015).
export async function deleteLibraryFile(client: SupabaseClient, ownerId: string, file: LibraryFile): Promise<Outcome<LibraryFile>> {
  try {
    const removed = await client.from("library_files").delete().eq("id", file.id).eq("user_id", ownerId).select("id");
    if (removed.error) {
      if (removed.error.code === "23503") return { ok: false, reason: "invalid", message: removed.error.message };
      return { ok: false, reason: "failed", message: "Couldn't delete the file. Try again." };
    }
    if (!removed.data?.length) return { ok: false, reason: "conflict", message: "That file was already deleted. Reload to see the library." };
    // The entry is gone; a leftover stored file is private and harmless, so this is best-effort.
    await client.storage.from(LIBRARY_BUCKET).remove([file.path]).catch(() => null);
    return { ok: true, value: file };
  } catch {
    return { ok: false, reason: "failed", message: "Couldn't delete the file. Try again." };
  }
}
