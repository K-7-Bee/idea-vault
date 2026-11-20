import { DRIVE_MAX_BYTES, INLINE_MIME } from "../ideas";
import type { DriveFileMeta } from "./google";

// Pure Phase 3B decisions for Drive attachments. No network and no Next.js here.

// Kill switch (plan 3B): off unless explicitly enabled on the server.
export function driveUploadsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return ["1", "true", "on"].includes((env.DRIVE_UPLOADS_ENABLED ?? "").trim().toLowerCase());
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

// Where an upload belongs: an idea attachment (3B) or a project file (3C), optionally tied to one of
// the project's lab entries or components.
export type UploadTarget =
  | { kind: "idea"; ideaId: string }
  | { kind: "project"; projectId: string; entryId: string | null; componentId: string | null };

const optionalUuid = (value: unknown) => value === undefined || value === null || isUuid(value);

export function parseTarget(body: unknown): UploadTarget | null {
  const b = body as Record<string, unknown> | null;
  if (!b) return null;
  const idea = b.ideaId !== undefined, project = b.projectId !== undefined;
  if (idea === project) return null;
  if (idea) {
    if (!isUuid(b.ideaId) || b.entryId != null || b.componentId != null) return null;
    return { kind: "idea", ideaId: b.ideaId };
  }
  if (!isUuid(b.projectId) || !optionalUuid(b.entryId) || !optionalUuid(b.componentId)) return null;
  if (b.entryId && b.componentId) return null;
  return { kind: "project", projectId: b.projectId, entryId: (b.entryId as string | null) ?? null, componentId: (b.componentId as string | null) ?? null };
}

// The private Drive tags that tie an uploaded file to its Vault record.
export function targetTags(target: UploadTarget, fileId: string): Record<string, string> {
  return target.kind === "idea"
    ? { vaultFileId: fileId, vaultIdeaId: target.ideaId }
    : { vaultFileId: fileId, vaultProjectId: target.projectId };
}

export type UploadRequest = { target: UploadTarget; fileId: string; name: string; mimeType: string; size: number };

export function parseUploadRequest(body: unknown): UploadRequest | null {
  const b = body as Record<string, unknown> | null;
  const target = parseTarget(body);
  if (!b || !target || !isUuid(b.fileId)) return null;
  const name = typeof b.name === "string" ? b.name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255) : "";
  const size = b.size;
  if (!name || typeof size !== "number" || !Number.isSafeInteger(size) || size < 0 || size > DRIVE_MAX_BYTES) return null;
  const rawType = typeof b.mimeType === "string" ? b.mimeType.trim().toLowerCase() : "";
  const mimeType = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(rawType) && rawType.length <= 120 ? rawType : "application/octet-stream";
  return { target, fileId: b.fileId, name, mimeType, size };
}

export type UploadCheck = { ok: true; size: number; md5: string | null } | { ok: false; reason: string };

// What Drive reports must match what the Vault asked for before a record is written.
export function checkUploaded(meta: DriveFileMeta, expected: { tags: Record<string, string>; folderId: string; size: number }): UploadCheck {
  if (meta.trashed) return { ok: false, reason: "trashed" };
  const props = meta.appProperties ?? {};
  if (!Object.entries(expected.tags).every(([key, value]) => props[key] === value)) {
    return { ok: false, reason: "not_this_file" };
  }
  if (!meta.parents?.includes(expected.folderId)) return { ok: false, reason: "wrong_folder" };
  const size = Number(meta.size ?? (expected.size === 0 ? 0 : NaN));
  if (!Number.isSafeInteger(size) || size !== expected.size) return { ok: false, reason: "size_mismatch" };
  const md5 = typeof meta.md5Checksum === "string" && /^[0-9a-f]{32}$/.test(meta.md5Checksum) ? meta.md5Checksum : null;
  return { ok: true, size, md5 };
}

// Owner-uploaded files are served from this site's origin, so only types a browser renders without
// running script are shown inline. Everything else (HTML, SVG, PDF, unknown) downloads instead.
export function inlineSafe(mimeType: string | null | undefined): boolean {
  return !!mimeType && INLINE_MIME.test(mimeType.toLowerCase());
}

// Content-Disposition with a safe ASCII fallback and the UTF-8 name.
export function disposition(kind: "inline" | "attachment", name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_").slice(0, 150) || "file";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).slice(0, 600)}`;
}

// Google Docs, Sheets, Slides etc. have no bytes to stream; they always open in Drive.
export const isGoogleNative = (mimeType: string | null | undefined) => !!mimeType && mimeType.startsWith("application/vnd.google-apps.");

export type CheckState = { state: "ok"; name: string } | { state: "unavailable"; reason: "trashed" | "missing" | "no_access" };

// Classifies what Drive says about a linked file during "Check files". Records are never removed.
export function classifyCheck(result: { meta?: { name?: string; trashed?: boolean }; status?: number }): CheckState | null {
  if (result.meta) return result.meta.trashed ? { state: "unavailable", reason: "trashed" } : { state: "ok", name: String(result.meta.name ?? "").slice(0, 500) };
  if (result.status === 404) return { state: "unavailable", reason: "missing" };
  if (result.status === 403) return { state: "unavailable", reason: "no_access" };
  return null; // temporary problem: leave the stored state as it is
}

// Drive folder names from project titles: no control characters, bounded length.
export function folderName(title: string): string {
  return title.replace(/[\u0000-\u001f\u007f/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Project";
}

// A single "bytes=a-b" or "bytes=a-" range, passed to Google as is; anything else is ignored.
export function safeRange(range: string | null): string | null {
  return range && /^bytes=\d{1,15}-(\d{1,15})?$/.test(range.trim()) ? range.trim() : null;
}
