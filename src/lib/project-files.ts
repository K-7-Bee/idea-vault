import { DRIVE_PREVIEW_MAX_BYTES, INLINE_MIME, formatSize } from "./ideas";

// Phase 3C: a file on a project, stored in the owner's Google Drive (uploaded, or linked in place).
export type ProjectFile = {
  id: string;
  project_id: string;
  entry_id: string | null;
  component_id: string | null;
  source: "upload" | "picked";
  drive_file_id: string;
  name: string;
  mime_type: string | null;
  size: number | null;
  md5: string | null;
  state: "ok" | "unavailable";
  state_reason: "trashed" | "missing" | "no_access" | null;
  checked_at: string | null;
  created_at: string;
};

export const UNAVAILABLE_TEXT: Record<NonNullable<ProjectFile["state_reason"]>, string> = {
  trashed: "In the Drive trash",
  missing: "Deleted from Drive",
  no_access: "The Vault no longer has access",
};

const googleNative = (mime: string | null) => !!mime && mime.startsWith("application/vnd.google-apps.");

// Small images and audio show in place; Google Docs and large files open in Google Drive.
export function projectFileView(file: ProjectFile): { href: string; preview: "image" | "audio" | null; opensInDrive: boolean } {
  const opensInDrive = file.size === null || googleNative(file.mime_type) || file.size > DRIVE_PREVIEW_MAX_BYTES;
  const href = opensInDrive ? `/api/drive/file/${file.id}?open=drive` : `/api/drive/file/${file.id}`;
  const safe = !opensInDrive && !!file.mime_type && INLINE_MIME.test(file.mime_type.toLowerCase());
  const preview = safe && file.mime_type!.startsWith("image/") ? "image" : safe && file.mime_type!.startsWith("audio/") ? "audio" : null;
  return { href, preview, opensInDrive };
}

export function projectFileMeta(file: ProjectFile): string {
  const parts = [file.source === "picked" ? "Linked from Drive" : "Uploaded"];
  if (googleNative(file.mime_type)) parts.push("Google file");
  else if (file.size !== null) parts.push(formatSize(file.size));
  return parts.join(" · ");
}
