import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "attachments";
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

// How many ideas load at a time.
export const PAGE_SIZE = 100;

export const STATUSES = ["raw", "exploring", "building", "done"] as const;

// Asks the database for an idea plus the files attached to it.
export const IDEA_COLUMNS =
  "id, content, status, tags, created_at, files:idea_files(id, path, name, mime_type, size)";

export type FileRow = {
  id: string;
  path: string;
  name: string;
  mime_type: string | null;
  size: number;
};
export type FileItem = FileRow & { url: string | null };

export type RawIdea = {
  id: string;
  content: string;
  status: string;
  tags: string[];
  created_at: string;
  files: FileRow[];
};
export type Idea = Omit<RawIdea, "files"> & { files: FileItem[] };

// Files are private, so each one gets a temporary link (valid for an hour).
export async function signFiles(
  supabase: SupabaseClient,
  rows: FileRow[],
): Promise<FileItem[]> {
  if (rows.length === 0) return [];
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      rows.map((r) => r.path),
      3600,
    );
  const urls = new Map<string, string>();
  for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
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
