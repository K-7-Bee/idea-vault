import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Server only. Seals short secrets (Drive tokens, OAuth state) with AES-256-GCM under DRIVE_TOKEN_KEY.
// Format: v<version>.<iv>.<tag>.<ciphertext>, all base64url. The context string (for example
// "refresh:<user id>") is authenticated, so a sealed value copied to another row or purpose fails.

export const KEY_VERSION = 1;

export class DriveKeyError extends Error {}

export function readKey(raw = process.env.DRIVE_TOKEN_KEY): Buffer {
  const key = raw ? Buffer.from(raw.trim(), "base64") : Buffer.alloc(0);
  if (key.length !== 32) throw new DriveKeyError("DRIVE_TOKEN_KEY must be 32 bytes, base64 encoded.");
  return key;
}

export function seal(plain: string, context: string, key: Buffer = readKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [`v${KEY_VERSION}`, iv, cipher.getAuthTag(), body]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

// Returns null for anything that does not open under this key and context: tampering, another
// key, another version, another row or a malformed value. Never throws for bad input.
export function open(sealed: string | null | undefined, context: string, key: Buffer = readKey()): string | null {
  if (typeof sealed !== "string") return null;
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== `v${KEY_VERSION}`) return null;
  try {
    const [iv, tag, body] = parts.slice(1).map((p) => Buffer.from(p, "base64url"));
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
