import { createHash, randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export const FORMAT = 'idea-vault-preservation-v1';
const ITERATIONS = 600000;
const MAX_BYTES = 256 * 1024 * 1024;
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const canonical = (value) => JSON.stringify(value, function (_, item) {
  return item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item;
});

export function decodeBytes(value) {
  requireValue(typeof value === 'string' && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value), 'Invalid base64 bytes');
  return Buffer.from(value, 'base64');
}

function unique(items, key, label) {
  const keys = items.map((item) => item[key]);
  requireValue(keys.every((id) => typeof id === 'string' && id.length > 0), `Missing ${label} identity`);
  requireValue(new Set(keys).size === keys.length, `Duplicate ${label} identity`);
}

function verifyBlob(blob) {
  const bytes = decodeBytes(blob.data_base64);
  requireValue(Number.isSafeInteger(blob.size) && bytes.length === blob.size, 'Object size mismatch');
  requireValue(sha256(bytes) === blob.sha256, 'Object checksum mismatch');
}

// Validation never repairs or removes records. Orphan objects are preserved and reported.
export function verifySnapshot(snapshot) {
  requireValue(snapshot?.format === FORMAT, 'Unsupported snapshot format');
  requireValue(typeof snapshot.source === 'string' && snapshot.source.length > 0, 'Missing source identity');
  requireValue(typeof snapshot.captured_at === 'string' && Number.isFinite(Date.parse(snapshot.captured_at)), 'Missing capture time');
  if (snapshot.kind === 'database') {
    const { ideas, idea_files: files, objects } = snapshot;
    requireValue(Array.isArray(ideas) && Array.isArray(files) && Array.isArray(objects), 'Missing database inventory');
    requireValue(typeof snapshot.schema_sql === 'string' && snapshot.schema_sql.trim().length > 0, 'Schema/policy export required');
    unique(ideas, 'id', 'idea'); unique(files, 'id', 'attachment'); unique(objects, 'path', 'object');
    const byIdea = new Map(ideas.map((idea) => [idea.id, idea]));
    const byPath = new Map(objects.map((object) => [object.path, object]));
    for (const idea of ideas) {
      requireValue(typeof idea.user_id === 'string' && typeof idea.content === 'string' && Array.isArray(idea.tags)
        && idea.tags.every((tag) => typeof tag === 'string') && ['raw', 'exploring', 'building', 'done'].includes(idea.status)
        && Number.isFinite(Date.parse(idea.created_at)), 'Invalid idea fields');
    }
    for (const object of objects) verifyBlob(object);
    for (const file of files) {
      const parent = byIdea.get(file.idea_id);
      requireValue(parent && parent.user_id === file.user_id, 'Missing parent or attachment ownership mismatch');
      requireValue(typeof file.path === 'string' && file.path.startsWith(`${file.user_id}/`), 'Attachment path ownership mismatch');
      const object = byPath.get(file.path);
      requireValue(object, 'Attachment object missing');
      requireValue(Number.isSafeInteger(file.size) && file.size >= 0 && object.size === file.size, 'Attachment metadata size mismatch');
    }
    const referenced = new Set(files.map((file) => file.path));
    return { kind: snapshot.kind, ideas: ideas.length, attachments: files.length, objects: objects.length,
      orphanObjects: objects.filter((object) => !referenced.has(object.path)).length,
      duplicateReferences: files.length - referenced.size,
      liveCompletenessVerified: false };
  }
  requireValue(snapshot.kind === 'device', 'Unknown snapshot kind');
  requireValue(Array.isArray(snapshot.outbox) && snapshot.local_storage && typeof snapshot.local_storage === 'object', 'Missing device inventory');
  unique(snapshot.outbox, 'id', 'queued idea');
  for (const item of snapshot.outbox) {
    requireValue(typeof item.content === 'string' && Array.isArray(item.tags) && Array.isArray(item.files)
      && Number.isFinite(Date.parse(item.created_at)) && (item.deleted === undefined || typeof item.deleted === 'boolean'), 'Invalid queued idea');
    unique(item.files, 'id', 'queued file');
    for (const file of item.files) {
      requireValue(typeof file.name === 'string' && typeof file.type === 'string' && Number.isFinite(file.lastModified), 'Missing queued file metadata');
      verifyBlob(file);
    }
  }
  return { kind: snapshot.kind, queuedIdeas: snapshot.outbox.length,
    queuedFiles: snapshot.outbox.reduce((count, item) => count + item.files.length, 0),
    deletionMarkers: snapshot.outbox.filter((item) => item.deleted).length, liveCompletenessVerified: false };
}

function passwordKey(password, salt) {
  requireValue(typeof password === 'string' && password.length >= 16, 'Use a backup passphrase of at least 16 characters');
  return pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
}

export function encryptSnapshot(snapshot, password) {
  verifySnapshot(snapshot);
  const salt = randomBytes(16), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', passwordKey(password, salt), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(snapshot), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  const envelope = { format: FORMAT, cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations: ITERATIONS,
    salt: salt.toString('base64'), iv: iv.toString('base64'), ciphertext: encrypted.toString('base64') };
  requireValue(Buffer.byteLength(JSON.stringify(envelope)) <= MAX_BYTES, 'Encrypted archive exceeds 256 MiB; use a reviewed streaming backup method');
  return envelope;
}

export function decryptSnapshot(envelope, password) {
  requireValue(envelope?.format === FORMAT && envelope.cipher === 'AES-256-GCM'
    && envelope.kdf === 'PBKDF2-SHA256' && envelope.iterations === ITERATIONS, 'Unsupported encrypted backup');
  const salt = decodeBytes(envelope.salt), iv = decodeBytes(envelope.iv), encrypted = decodeBytes(envelope.ciphertext);
  requireValue(salt.length === 16 && iv.length === 12 && encrypted.length >= 16, 'Invalid encryption parameters');
  const decipher = createDecipheriv('aes-256-gcm', passwordKey(password, salt), iv);
  decipher.setAuthTag(encrypted.subarray(-16));
  let snapshot;
  try { snapshot = JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString('utf8')); }
  catch { throw new Error('Backup authentication failed (wrong passphrase or damaged backup)'); }
  verifySnapshot(snapshot);
  return snapshot;
}

export async function readLimited(file) {
  requireValue((await stat(file)).size <= MAX_BYTES, 'Input exceeds 256 MiB; use a reviewed streaming backup method');
  return readFile(file);
}

async function containedFile(root, relative) {
  requireValue(typeof relative === 'string' && relative.length > 0 && !path.isAbsolute(relative), 'Expected relative input file');
  const resolved = await realpath(path.resolve(root, relative));
  const within = path.relative(root, resolved);
  requireValue(within !== '' && within !== '..' && !within.startsWith(`..${path.sep}`) && !path.isAbsolute(within), 'Input file escapes export directory');
  return readLimited(resolved);
}

// Input is an independently exported, frozen inventory, not a connection to production.
export async function collectDatabase(directory, source) {
  const root = await realpath(directory);
  const json = async (name) => JSON.parse((await containedFile(root, name)).toString('utf8'));
  const ideas = await json('ideas.json'), files = await json('idea_files.json'), entries = await json('objects.json');
  requireValue(Array.isArray(entries), 'objects.json must be an array');
  const objects = [];
  let total = 0;
  for (const entry of entries) {
    const bytes = await containedFile(root, entry.local_file);
    total += bytes.length;
    requireValue(total <= MAX_BYTES, 'Object inventory exceeds 256 MiB; use a reviewed streaming backup method');
    const { local_file: locator, ...metadata } = entry;
    void locator;
    if (entry.size !== undefined) requireValue(entry.size === bytes.length, 'Exported object size mismatch');
    if (entry.sha256 !== undefined) requireValue(entry.sha256 === sha256(bytes), 'Exported object checksum mismatch');
    objects.push({ ...metadata, size: bytes.length, sha256: sha256(bytes), data_base64: bytes.toString('base64') });
  }
  const snapshot = { format: FORMAT, kind: 'database', source, captured_at: new Date().toISOString(),
    ideas, idea_files: files, objects, schema_sql: (await containedFile(root, 'schema.sql')).toString('utf8') };
  verifySnapshot(snapshot);
  return snapshot;
}

export function compareSnapshots(before, after) {
  verifySnapshot(before); verifySnapshot(after);
  requireValue(before.kind === after.kind, 'Snapshot kinds differ');
  if (before.kind === 'database') {
    for (const key of ['ideas', 'idea_files', 'objects']) {
      const identity = key === 'objects' ? 'path' : 'id';
      const ordered = (items) => [...items].sort((a, b) => a[identity].localeCompare(b[identity]));
      requireValue(canonical(ordered(before[key])) === canonical(ordered(after[key])), `${key} differ`);
    }
    requireValue(before.schema_sql === after.schema_sql, 'Schema exports differ');
  } else {
    requireValue(canonical(before.outbox) === canonical(after.outbox)
      && canonical(before.local_storage) === canonical(after.local_storage), 'Device data differ');
  }
  return true;
}
