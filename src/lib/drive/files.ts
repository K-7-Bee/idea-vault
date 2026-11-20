import { DRIVE_MAX_BYTES, INLINE_MIME } from "../ideas";
import type { DriveFileMeta } from "./google";

// Pure Phase 3B decisions for Drive attachments. No network and no Next.js here.

// Kill switch (plan 3B): off unless explicitly enabled on the server.
export function driveUploadsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return ["1", "true", "on"].includes((env.DRIVE_UPLOADS_ENABLED ?? "").trim().toLowerCase());
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export type UploadRequest = { ideaId: string; fileId: string; name: string; mimeType: string; size: number };

export function parseUploadRequest(body: unknown): UploadRequest | null {
  const b = body as Record<string, unknown> | null;
  if (!b || !isUuid(b.ideaId) || !isUuid(b.fileId)) return null;
  const name = typeof b.name === "string" ? b.name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255) : "";
  const size = b.size;
  if (!name || typeof size !== "number" || !Number.isSafeInteger(size) || size < 0 || size > DRIVE_MAX_BYTES) return null;
  const rawType = typeof b.mimeType === "string" ? b.mimeType.trim().toLowerCase() : "";
  const mimeType = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(rawType) && rawType.length <= 120 ? rawType : "application/octet-stream";
  return { ideaId: b.ideaId, fileId: b.fileId, name, mimeType, size };
}

export type UploadCheck = { ok: true; size: number; md5: string | null } | { ok: false; reason: string };

// What Drive reports must match what the Vault asked for before a record is written.
export function checkUploaded(meta: DriveFileMeta, expected: { fileId: string; ideaId: string; folderId: string; size: number }): UploadCheck {
  if (meta.trashed) return { ok: false, reason: "trashed" };
  if (meta.appProperties?.vaultFileId !== expected.fileId || meta.appProperties?.vaultIdeaId !== expected.ideaId) {
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

// A single "bytes=a-b" or "bytes=a-" range, passed to Google as is; anything else is ignored.
export function safeRange(range: string | null): string | null {
  return range && /^bytes=\d{1,15}-(\d{1,15})?$/.test(range.trim()) ? range.trim() : null;
}
