import type { FileRow } from "../ideas";

// Browser side of Phase 3B: sends one attachment straight to the owner's Google Drive with a
// resumable upload, then asks the Vault to verify and record it. The server creates the session
// (the refresh token never reaches the browser); the browser only holds the session URL.

// Google requires chunks in multiples of 256 KiB, except the last.
export const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_TRANSIENT_RETRIES = 6;

// Drive can't take the file right now; small files may fall back to Vault storage (V-013).
export class DriveUnavailable extends Error {
  constructor(readonly reason: string) {
    super(`Google Drive unavailable (${reason})`);
  }
}
// No connection (or the session locked): keep the file and try again later.
export class DriveOffline extends Error {}

// Server answers that mean "Drive isn't usable now" rather than "this file is bad".
const UNAVAILABLE = new Set(["disabled", "not_configured", "not_connected", "reconnect", "no_folder", "unavailable", "google", "quota"]);

type SessionRecord = { fileId: string; ownerId: string; ideaId: string; size: number; session?: string; driveFileId?: string };
export type SessionStore = {
  get(fileId: string): Promise<SessionRecord | undefined>;
  put(record: SessionRecord): Promise<unknown>;
  remove(fileId: string): Promise<unknown>;
};

// Separate on-device database: the capture outbox is never upgraded or rewritten for this.
function access<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("idea-vault-uploads", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("sessions", { keyPath: "fileId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction("sessions", mode);
    const request = action(tx.objectStore("sessions"));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  }));
}

export const deviceSessions: SessionStore = {
  get: (fileId) => access<SessionRecord | undefined>("readonly", (s) => s.get(fileId)),
  put: (record) => access("readwrite", (s) => s.put(record)),
  remove: (fileId) => access("readwrite", (s) => s.delete(fileId)),
};

export type UploadDeps = {
  fetch?: typeof fetch;
  sessions?: SessionStore;
  sleep?: (ms: number) => Promise<void>;
  active?: () => boolean;
  onProgress?: (sent: number, total: number) => void;
};

type ApiResult = { ok: boolean; status: number; body: Record<string, unknown> };

async function api(f: typeof fetch, path: string, body: unknown): Promise<ApiResult> {
  let response: Response;
  try {
    response = await f(path, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new DriveOffline("No connection to the Vault.");
  }
  const parsed = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, body: parsed };
}

// "bytes=0-1048575" → next byte to send (1048576). No header means nothing was stored.
export function nextOffset(range: string | null): number {
  const match = range?.match(/^bytes=0-(\d+)$/);
  return match ? Number(match[1]) + 1 : 0;
}

type SendResult = { done: true; driveFileId: string | null } | { expired: true };

async function sendBytes(f: typeof fetch, session: string, file: Blob, deps: Required<Pick<UploadDeps, "sleep" | "active">> & UploadDeps): Promise<SendResult> {
  const size = file.size;
  let transient = 0;

  async function put(body: Blob | null, range: string): Promise<Response> {
    if (!deps.active()) throw new DriveOffline("Upload paused.");
    try {
      return await f(session, { method: "PUT", headers: { "Content-Range": range }, body, cache: "no-store" });
    } catch {
      throw new DriveOffline("The connection to Google Drive dropped.");
    }
  }
  async function finish(response: Response): Promise<SendResult> {
    const body = await response.json().catch(() => ({})) as { id?: unknown };
    return { done: true, driveFileId: typeof body.id === "string" ? body.id : null };
  }
  async function backoff(status: number) {
    if (++transient > MAX_TRANSIENT_RETRIES) throw new Error(`Google Drive kept refusing the upload (${status}).`);
    await deps.sleep(Math.min(1000 * 2 ** (transient - 1), 32_000));
  }

  // Ask Google how much it already has (resumes after a reload or a dropped connection).
  let offset = -1;
  while (offset < 0) {
    const status = await put(null, `bytes */${size}`);
    if (status.status === 308) offset = nextOffset(status.headers.get("range"));
    else if (status.status === 200 || status.status === 201) return finish(status);
    else if (status.status === 404 || status.status === 410) return { expired: true };
    else if (status.status === 429 || status.status >= 500) await backoff(status.status);
    else throw new Error(`Google Drive rejected the upload (${status.status}).`);
  }

  while (offset < size) {
    const end = Math.min(offset + CHUNK_BYTES, size);
    const response = await put(file.slice(offset, end), `bytes ${offset}-${end - 1}/${size}`);
    if (response.status === 308) {
      offset = nextOffset(response.headers.get("range"));
      transient = 0;
      deps.onProgress?.(offset, size);
    } else if (response.status === 200 || response.status === 201) {
      deps.onProgress?.(size, size);
      return finish(response);
    } else if (response.status === 404 || response.status === 410) {
      return { expired: true };
    } else if (response.status === 429 || response.status >= 500) {
      await backoff(response.status);
      // Part of the chunk may have arrived; ask again before resending.
      const check = await put(null, `bytes */${size}`);
      if (check.status === 308) offset = nextOffset(check.headers.get("range"));
      else if (check.status === 200 || check.status === 201) return finish(check);
      else if (check.status === 404 || check.status === 410) return { expired: true };
    } else {
      throw new Error(`Google Drive rejected the upload (${response.status}).`);
    }
  }
  // Every byte confirmed without a final response: completion finds the file by its tag.
  return { done: true, driveFileId: null };
}

// An idea attachment (3B), or a project file optionally tied to a lab entry or component (3C).
export type UploadInput = { ownerId: string; fileId: string; file: File } & (
  | { ideaId: string; projectId?: undefined; entryId?: undefined; componentId?: undefined }
  | { projectId: string; entryId?: string | null; componentId?: string | null; ideaId?: undefined }
);

export async function uploadToDrive<T = FileRow>(input: UploadInput, deps: UploadDeps = {}): Promise<T> {
  const f = deps.fetch ?? fetch;
  const sessions = deps.sessions ?? deviceSessions;
  const run = { ...deps, sleep: deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))), active: deps.active ?? (() => true) };
  const { ownerId, fileId, file } = input;
  const target = input.ideaId !== undefined
    ? { ideaId: input.ideaId }
    : { projectId: input.projectId, entryId: input.entryId ?? null, componentId: input.componentId ?? null };
  const targetKey = input.ideaId ?? `project:${input.projectId}`;
  // Saved sessions keep the field name ideaId (3B records on devices); it holds the target key.
  const base = { fileId, ownerId, ideaId: targetKey, size: file.size };

  let saved = await sessions.get(fileId).catch(() => undefined);
  if (saved && (saved.ownerId !== ownerId || saved.ideaId !== targetKey || saved.size !== file.size)) saved = undefined;
  let driveFileId: string | null = saved?.driveFileId ?? null;
  let bytesDone = !!saved?.driveFileId;

  let session = saved?.session;
  for (let attempt = 0; !bytesDone; attempt++) {
    if (!session) {
      if (!run.active()) throw new DriveOffline("Upload paused.");
      const started = await api(f, "/api/drive/upload-session", { ...target, fileId, name: file.name, mimeType: file.type, size: file.size });
      const reason = typeof started.body.error === "string" ? started.body.error : "";
      if (!started.ok) {
        if (UNAVAILABLE.has(reason)) throw new DriveUnavailable(reason);
        throw new Error(reason === "no_idea" ? "The idea for this file isn't saved yet."
          : reason === "no_project" ? "This project, or the record the file is attached to, no longer exists."
          : `Drive upload couldn't start (${reason || started.status}).`);
      }
      if (started.body.done === true) {
        driveFileId = typeof started.body.driveFileId === "string" ? started.body.driveFileId : null;
        break;
      }
      if (typeof started.body.session !== "string") throw new Error("Drive upload couldn't start.");
      session = started.body.session;
      // Kept so a reload resumes instead of starting again; losing it only costs a restart.
      await sessions.put({ ...base, session }).catch(() => {});
    }
    const sent = await sendBytes(f, session, file, run);
    if ("expired" in sent) {
      if (attempt >= 1) throw new Error("The Drive upload session expired. It will start again.");
      session = undefined;
      await sessions.remove(fileId).catch(() => {});
      continue;
    }
    driveFileId = sent.driveFileId;
    bytesDone = true;
  }
  await sessions.put({ ...base, driveFileId: driveFileId ?? undefined }).catch(() => {});

  if (!run.active()) throw new DriveOffline("Upload paused.");
  const done = await api(f, "/api/drive/upload-complete", { ...target, fileId, size: file.size, driveFileId });
  const file_ = done.body.file as T | undefined;
  if (!done.ok || !file_) {
    // The bytes are in Drive: never fall back to a second copy. Keep the file and retry later.
    throw new Error(`The file reached Google Drive but couldn't be recorded yet (${String(done.body.error ?? done.status)}). It will retry.`);
  }
  await sessions.remove(fileId).catch(() => {});
  return file_;
}
