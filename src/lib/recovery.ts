import type { FileRow, RawIdea } from "./ideas";
import type { QueuedIdea } from "./outbox";

export type RecoveryFile = FileRow & { created_at?: string; md5?: string | null };
export type RecoveryRecord = {
  id: string;
  owner_id: string;
  kind: "idea" | "file";
  saved_at: string;
  idea: Omit<RawIdea, "files"> & { files: RecoveryFile[] };
  queued?: QueuedIdea;
  prepared?: boolean;
};

// Separate database: no upgrade or rewrite of the existing capture outbox.
async function access<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("idea-vault-recovery", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", mode);
    const request = action(tx.objectStore("records"));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

export const saveRecovery = (record: RecoveryRecord) => access("readwrite", (store) => store.put(record));
export const getRecovery = (id: string) => access<RecoveryRecord | undefined>("readonly", (store) => store.get(id));
export async function listRecovery(ownerId: string) {
  const records = await access<RecoveryRecord[]>("readonly", (store) => store.getAll());
  return records.filter((record) => record.owner_id === ownerId).sort((a, b) => b.saved_at.localeCompare(a.saved_at));
}
