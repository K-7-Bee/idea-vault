// A small on-device queue (IndexedDB) for ideas that haven't reached Supabase yet.
// IndexedDB can hold photos and voice notes, which localStorage can't.

export type QueuedFile = { id: string; file: File };
export type QueuedIdea = {
  id: string;
  content: string;
  tags: string[];
  created_at: string;
  files: QueuedFile[];
};

const DB_NAME = "idea-vault";
const STORE = "outbox";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export function addQueued(item: QueuedIdea) {
  return run("readwrite", (s) => s.put(item));
}

export function removeQueued(id: string) {
  return run("readwrite", (s) => s.delete(id));
}

// Oldest first, so ideas reach the database in the order you wrote them.
export async function listQueued(): Promise<QueuedIdea[]> {
  const all = await run<QueuedIdea[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => a.created_at.localeCompare(b.created_at));
}
