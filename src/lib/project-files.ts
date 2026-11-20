import { DRIVE_PREVIEW_MAX_BYTES, INLINE_MIME, formatSize } from "./ideas";

// Phase 3C: a file on a project, stored in the owner's Google Drive (uploaded, or linked in place).
export type ProjectFile = {
  id: string;
  project_id: string;
  entry_id: string | null;
  component_id: string | null;
  // 3D: a story character or structure item, and whether this is its main image.
  character_id?: string | null;
  unit_id?: string | null;
  is_main?: boolean;
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

// 3D: images on story characters and structure items.
export type ImageOwner = { kind: "character" | "unit"; id: string };

export const isImage = (file: ProjectFile) => !!file.mime_type && /^image\/(png|jpeg|webp|gif)$/i.test(file.mime_type);

// Small preview for cards and the gallery (owner-checked, served through the Vault).
export const thumbUrl = (file: ProjectFile) => `/api/drive/file/${file.id}?size=thumb`;

export function imageOwner(file: ProjectFile): ImageOwner | null {
  if (file.character_id) return { kind: "character", id: file.character_id };
  if (file.unit_id) return { kind: "unit", id: file.unit_id };
  return null;
}

// A record's images, main first: the one marked main, else the first image attached.
export function imagesFor(files: ProjectFile[], owner: ImageOwner): ProjectFile[] {
  const mine = files.filter((f) => isImage(f) && (owner.kind === "character" ? f.character_id : f.unit_id) === owner.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const main = mine.find((f) => f.is_main) ?? mine[0];
  return main ? [main, ...mine.filter((f) => f !== main)] : [];
}
