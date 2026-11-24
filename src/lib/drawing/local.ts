// Phase 7: an unsaved drawing kept on this device (IndexedDB) until the Vault confirms the save, so
// a reload, a crash or going offline loses nothing. One entry per drawing; cleared after a save.
import type { DrawingData } from "./format";

export type LocalDraft = { id: string; data: DrawingData; title: string; baseVersion: number; savedAt: string };

const DB = "vault-drawings";
const STORE = "drafts";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = op(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const putDraft = (draft: LocalDraft) => run<IDBValidKey>("readwrite", (s) => s.put(draft));
export const getDraft = (id: string) => run<LocalDraft | undefined>("readonly", (s) => s.get(id));
export const removeDraft = (id: string) => run<undefined>("readwrite", (s) => s.delete(id));
