import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { FORMAT, collectDatabase, compareSnapshots, decryptSnapshot, encryptSnapshot, sha256, verifySnapshot } from '../scripts/vault/preservation.mjs';

const password = 'fixture-only-passphrase';
const bytes = Buffer.from([0, 255, 9, 42]);
function fixture() {
  return { format: FORMAT, kind: 'database', source: 'isolated-fixture', captured_at: '2026-11-14T00:00:00Z',
    schema_sql: '-- fixture policies and schema',
    ideas: [{ id: 'idea-1', user_id: 'owner', content: 'Original 한국어 #tag', tags: ['tag'], status: 'raw', created_at: '2020-01-02T00:00:00Z' }],
    idea_files: [{ id: 'file-1', idea_id: 'idea-1', user_id: 'owner', path: 'owner/idea-1/photo.bin', name: 'original name.bin', mime_type: null, size: bytes.length }],
    objects: [{ path: 'owner/idea-1/photo.bin', size: bytes.length, sha256: sha256(bytes), data_base64: bytes.toString('base64') }] };
}

test('encrypted backup preserves exact original records and binary bytes; rejects wrong password and tampering', () => {
  const source = fixture(), backup = encryptSnapshot(source, password);
  assert.ok(!JSON.stringify(backup).includes('Original'));
  assert.deepEqual(decryptSnapshot(backup, password), source);
  assert.throws(() => decryptSnapshot(backup, 'wrong-fixture-passphrase'), /authentication failed/);
  const altered = Buffer.from(backup.ciphertext, 'base64'); altered[0] ^= 1;
  assert.throws(() => decryptSnapshot({ ...backup, ciphertext: altered.toString('base64') }, password), /authentication failed/);
});

test('verification rejects missing/corrupt bytes, duplicate IDs and foreign-owner attachment links', () => {
  let source = fixture(); source.objects = [];
  assert.throws(() => verifySnapshot(source), /object missing/);
  source = fixture(); source.objects[0].sha256 = '0'.repeat(64);
  assert.throws(() => verifySnapshot(source), /checksum/);
  source = fixture(); source.ideas.push({ ...source.ideas[0] });
  assert.throws(() => verifySnapshot(source), /Duplicate/);
  source = fixture(); source.idea_files[0].user_id = 'another-owner';
  assert.throws(() => verifySnapshot(source), /ownership mismatch/);
});

test('orphan bytes are retained and reported; comparison detects field changes despite matching counts', () => {
  const source = fixture(); source.objects.push({ ...source.objects[0], path: 'owner/orphan' });
  assert.equal(verifySnapshot(source).orphanObjects, 1);
  const restored = structuredClone(source); restored.ideas[0].created_at = '2021-01-02T00:00:00Z';
  assert.throws(() => compareSnapshots(source, restored), /ideas differ/);
  assert.equal(compareSnapshots(source, structuredClone(source)), true);
});

test('directory collection, encrypted extraction and re-collection preserve rows, schema and bytes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vault-preservation-test-'));
  try {
    const input = path.join(root, 'input'); await mkdir(input);
    const source = fixture();
    await writeFile(path.join(input, 'ideas.json'), JSON.stringify(source.ideas));
    await writeFile(path.join(input, 'idea_files.json'), JSON.stringify(source.idea_files));
    await writeFile(path.join(input, 'schema.sql'), source.schema_sql);
    await writeFile(path.join(input, 'bytes.bin'), bytes);
    await writeFile(path.join(input, 'objects.json'), JSON.stringify([{ path: source.objects[0].path, local_file: 'bytes.bin' }]));
    const collected = await collectDatabase(input, 'test');
    const backup = path.join(root, 'fixture.vaultbackup');
    await writeFile(backup, JSON.stringify(encryptSnapshot(collected, password)));
    const destination = path.join(root, 'extracted');
    const run = () => spawnSync(process.execPath, ['scripts/vault/backup.mjs', 'extract', backup, destination],
      { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, VAULT_BACKUP_PASSPHRASE: password }, encoding: 'utf8' });
    assert.equal(run().status, 0);
    assert.equal(compareSnapshots(collected, await collectDatabase(destination, 'restored-test')), true);
    assert.notEqual(run().status, 0, 'must refuse existing destination');
    await writeFile(path.join(input, 'objects.json'), JSON.stringify([{ path: 'owner/file', local_file: '../fixture.vaultbackup' }]));
    await assert.rejects(collectDatabase(input, 'test'), /escapes export directory/);
  } finally {
    // root is created by mkdtemp in the OS temp directory and never comes from user input.
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('vault-preservation-test-'));
    await rm(root, { recursive: true, force: true });
  }
});

test('browser exporter uses a read-only transaction and produces a Node-decryptable blob with tombstones and files', async () => {
  const script = await readFile(new URL('../scripts/vault/export-device.js', import.meta.url), 'utf8');
  const queued = { id: 'queued', content: '', tags: [], created_at: '2026-11-14T00:00:00Z', deleted: true,
    files: [{ id: 'voice', file: new File([bytes], 'voice.webm', { type: 'audio/webm', lastModified: 123 }) }] };
  const recovery = { id: 'recovery', owner_id: 'owner', kind: 'idea',
    idea: { id: 'queued', files: [{ path: 'owner/queued/voice' }] }, queued: { ...queued, owner_id: 'owner' } };
  let blob, closed = false;
  const errors = [];
  const db = { objectStoreNames: { contains: () => true }, close: () => { closed = true; },
    transaction: (store, mode) => {
      assert.ok(['outbox', 'records'].includes(store)); assert.equal(mode, 'readonly');
      const tx = { objectStore: () => ({ getAll: () => ({ result: store === 'records' ? [recovery] : [queued] }) }) };
      queueMicrotask(() => tx.oncomplete()); return tx;
    } };
  const context = { navigator: { onLine: false }, prompt: () => password,
    indexedDB: { open: () => { const request = { result: db }; queueMicrotask(() => request.onsuccess()); return request; } },
    location: { origin: 'https://fixture.invalid' }, crypto: webcrypto, TextEncoder, Blob, Uint8Array, Date,
    localStorage: { length: 1, key: () => 'vault-draft:owner', getItem: (key) => key.startsWith('vault-draft') ? 'unsent text' : null },
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    URL: { createObjectURL: (value) => { blob = value; return 'blob:fixture'; }, revokeObjectURL: () => {} },
    document: { createElement: () => ({ click: () => {} }) }, setTimeout: () => {},
    console: { info: () => {}, error: (message) => errors.push(message) } };
  await vm.runInNewContext(script, context);
  assert.deepEqual(errors, []); assert.equal(closed, true);
  const restored = decryptSnapshot(JSON.parse(await blob.text()), password);
  assert.equal(restored.outbox[0].deleted, true);
  assert.equal(restored.outbox[0].files[0].data_base64, bytes.toString('base64'));
  assert.equal(restored.local_storage['vault-draft'], 'unsent text');
  assert.equal(restored.local_storage['vault-draft:owner'], 'unsent text');
  assert.equal(restored.recovery[0].queued.files[0].data_base64, bytes.toString('base64'));
  assert.equal(verifySnapshot(restored).recoveryRecords, 1);
  assert.equal(verifySnapshot(restored).deletionMarkers, 1);
  context.indexedDB.open = (name) => {
    if (name === 'idea-vault') {
      const request = { result: db }; queueMicrotask(() => request.onsuccess()); return request;
    }
    const request = { transaction: { abort() { queueMicrotask(() => request.onerror()); } } };
    queueMicrotask(() => request.onupgradeneeded());
    return request;
  };
  await vm.runInNewContext(script, context);
  assert.deepEqual(errors, []);
  const legacyDevice = decryptSnapshot(JSON.parse(await blob.text()), password);
  assert.deepEqual(legacyDevice.recovery, []);
  assert.equal(legacyDevice.outbox.length, 1);
  assert.throws(() => compareSnapshots(restored, legacyDevice), /Device data differ/);
});
