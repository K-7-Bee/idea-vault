import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "attachments";
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
// Phase 3B: files stored in the owner's Google Drive (decision V-008b).
export const DRIVE_MAX_BYTES = 1024 * 1024 * 1024;
// Drive files up to this size play inside the Vault; larger ones open in Google Drive.
export const DRIVE_PREVIEW_MAX_BYTES = 50 * 1024 * 1024;

// How many ideas load at a time.
export const PAGE_SIZE = 100;

// Stored stage values since migration 005 (was raw/exploring/building/done). New ideas start at
// "exploring" via the database default.
export const STATUSES = ["exploring", "analyzing", "building", "completed"] as const;

// Asks the database for an idea plus the files attached to it.
export const IDEA_COLUMNS =
  "id, title, content, status, tags, created_at, files:idea_files(id, path, name, mime_type, size, provider, drive_file_id)";

// The detail page also reads the original capture, edit time and archive state (migration 004).
export const IDEA_DETAIL_COLUMNS =
  "id, title, content, original_content, status, tags, created_at, updated_at, archived_at, files:idea_files(id, path, name, mime_type, size, provider, drive_file_id)";

export type FileRow = {
  id: string;
  path: string;
  name: string;
  mime_type: string | null;
  size: number;
  // Missing on rows read before migration 009 and in older device records: treated as Supabase.
  provider?: "supabase" | "drive";
  drive_file_id?: string | null;
};
export type FileItem = FileRow & { url: string | null };

export type RawIdea = {
  id: string;
  title?: string | null;
  content: string;
  status: string;
  tags: string[];
  created_at: string;
  files: FileRow[];
};
export type Idea = Omit<RawIdea, "files"> & { files: FileItem[] };

export const isDriveFile = (row: Pick<FileRow, "provider">) => row.provider === "drive";

// Types a browser renders without running script. Drive files of other types are offered as a
// download from the Vault's own origin instead of being shown inline.
export const INLINE_MIME = /^(image\/(png|jpeg|gif|webp|avif|bmp)|audio\/[a-z0-9.+-]+|video\/(mp4|webm|ogg|quicktime))$/;

// Whether an attachment can be shown in place (image, audio). Large Drive files open in Drive.
export function canPreview<T extends Pick<FileItem, "url" | "provider" | "size" | "mime_type">>(file: T): file is T & { url: string } {
  if (!file.url) return false;
  if (!isDriveFile(file)) return true;
  return file.size <= DRIVE_PREVIEW_MAX_BYTES && !!file.mime_type && INLINE_MIME.test(file.mime_type.toLowerCase());
}

// Drive files are read through the Vault's owner-checked route; large ones open in Google Drive.
export function driveFileUrl(row: Pick<FileRow, "id" | "size">) {
  return row.size > DRIVE_PREVIEW_MAX_BYTES ? `/api/drive/file/${row.id}?open=drive` : `/api/drive/file/${row.id}`;
}

// Files are private, so each Supabase file gets a temporary link (valid for an hour).
export async function signFiles(
  supabase: SupabaseClient,
  rows: FileRow[],
): Promise<FileItem[]> {
  if (rows.length === 0) return [];
  const urls = new Map<string, string>();
  for (const row of rows) if (isDriveFile(row)) urls.set(row.path, driveFileUrl(row));
  const stored = rows.filter((row) => !isDriveFile(row));
  if (stored.length === 0) return rows.map((r) => ({ ...r, url: urls.get(r.path) ?? null }));
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(stored.map((r) => r.path), 3600);
    if (!error) {
      for (const d of data ?? []) {
        if (!d.error && d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
      }
    }
  } catch {
    // A failed link request must not hide saved ideas or their file metadata.
  }
  return rows.map((r) => ({ ...r, url: urls.get(r.path) ?? null }));
}

export async function withFileUrls(
  supabase: SupabaseClient,
  ideas: RawIdea[],
): Promise<Idea[]> {
  const signed = await signFiles(
    supabase,
    ideas.flatMap((i) => i.files),
  );
  const byId = new Map(signed.map((f) => [f.id, f]));
  return ideas.map((i) => ({ ...i, files: i.files.map((f) => byId.get(f.id)!) }));
}

// Storage paths can't contain spaces or odd characters.
export function safeFileName(name: string) {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120);
}

export function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
