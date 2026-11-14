// Run manually in DevTools on the existing Vault origin, after freezing writes and
// taking the browser offline. Does not reload, clear storage, or replay the queue.
(async () => {
  'use strict';
  if (navigator.onLine) throw new Error('Take this browser offline first to prevent queued uploads/deletions during export. Do not reload.');
  const password = prompt('Backup passphrase (at least 16 characters). Store it securely; it cannot be recovered.');
  if (!password || password.length < 16) throw new Error('Export cancelled: a passphrase of at least 16 characters is required.');
  if (prompt('Repeat the backup passphrase') !== password) throw new Error('Passphrases do not match.');
  const outbox = await new Promise((resolve, reject) => {
    const request = indexedDB.open('idea-vault');
    request.onupgradeneeded = () => {
      request.transaction.abort(); // Never create/upgrade a missing device database.
    };
    request.onerror = () => reject(new Error('Existing outbox unavailable; no database was created.'));
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('outbox')) { db.close(); reject(new Error('Existing outbox store missing')); return; }
      const tx = db.transaction('outbox', 'readonly');
      const all = tx.objectStore('outbox').getAll();
      tx.oncomplete = () => { db.close(); resolve(all.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(new Error('Outbox read failed')); };
    };
  });
  const base64 = (bytes) => {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
    return btoa(binary);
  };
  let total = 0;
  const rows = [];
  for (const item of outbox) {
    const files = [];
    for (const entry of item.files) {
      total += entry.file.size;
      if (total > 256 * 1024 * 1024) throw new Error('Outbox exceeds 256 MiB; stop and use a reviewed streaming export. Nothing was removed.');
      const bytes = new Uint8Array(await entry.file.arrayBuffer());
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      files.push({ id: entry.id, name: entry.file.name, type: entry.file.type, size: entry.file.size,
        lastModified: entry.file.lastModified, data_base64: base64(bytes),
        sha256: [...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('') });
    }
    rows.push({ ...item, files }); // Includes deletion markers without applying them.
  }
  const snapshot = { format: 'idea-vault-preservation-v1', kind: 'device', source: location.origin,
    captured_at: new Date().toISOString(), outbox: rows,
    local_storage: { 'vault-draft': localStorage.getItem('vault-draft'), 'vault-view': localStorage.getItem('vault-view') } };
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(snapshot)));
  const envelope = { format: snapshot.format, cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations: 600000,
    salt: base64(salt), iv: base64(iv), ciphertext: base64(new Uint8Array(encrypted)) };
  const archive = new Blob([JSON.stringify(envelope)], { type: 'application/octet-stream' });
  if (archive.size > 256 * 1024 * 1024) throw new Error('Encrypted archive exceeds the verifier limit; use a reviewed streaming export. Nothing was removed.');
  const url = URL.createObjectURL(archive);
  const link = document.createElement('a');
  link.href = url; link.download = `vault-device-${new Date().toISOString().replace(/[:.]/g, '-')}.vaultbackup`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  console.info('Encrypted device download requested. Verify it with backup.mjs before relying on it. Outbox/drafts were not cleared.');
})().catch(() => console.error('Device export failed or was cancelled. Nothing was cleared. Check offline state, existing outbox, storage access and matching passphrases.'));
