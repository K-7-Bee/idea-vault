import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as live from '../scripts/vault/live-archive.mjs';

// Phase 6A: the live backup archive (encryption, tamper detection, fingerprints, catalog
// comparison, safety rails) and "Download my data" (every owner table, no secrets).
const root = path.join(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pass = 'a-long-test-passphrase-of-32-chars!';
const archive = () => ({ format: live.FORMAT, createdAt: '2026-11-21T00:00:00Z', tables: { ideas: ['{"id":"1"}'] }, files: [] });

test('archives round-trip, and a wrong passphrase or any changed byte is refused', () => {
  const envelope = live.encryptArchive(archive(), pass);
  assert.equal(envelope.cipher, 'AES-256-GCM');
  assert.equal(envelope.iterations, 600000);
  assert.ok(!JSON.stringify(envelope).includes('ideas'), 'nothing readable in the file');
  assert.deepEqual(live.decryptArchive(envelope, pass).tables, { ideas: ['{"id":"1"}'] });
  assert.throws(() => live.decryptArchive(envelope, 'another-long-passphrase-123456'), /wrong passphrase or damaged/);
  const bytes = Buffer.from(envelope.ciphertext, 'base64');
  bytes[Math.floor(bytes.length / 2)] ^= 1;
  assert.throws(() => live.decryptArchive({ ...envelope, ciphertext: bytes.toString('base64') }, pass), /wrong passphrase or damaged/);
  assert.throws(() => live.decryptArchive({ ...envelope, iterations: 1000 }, pass), /Unsupported/);
  assert.throws(() => live.encryptArchive(archive(), 'short'), /at least 16 characters/);
  assert.throws(() => live.encryptArchive({ format: 'other' }, pass), /Not a live backup/);
});

test('table fingerprints ignore row order but catch any change', () => {
  const a = live.tableDigest(['{"id":"2"}', '{"id":"1"}']);
  assert.deepEqual(a, live.tableDigest(['{"id":"1"}', '{"id":"2"}']));
  assert.equal(a.count, 2);
  assert.notEqual(a.sha256, live.tableDigest(['{"id":"1"}', '{"id":"3"}']).sha256);
  assert.notEqual(a.sha256, live.tableDigest(['{"id":"1"}']).sha256);
});

test('file hashes are checked; catalogs compare without schema-prefix noise', () => {
  const bytes = Buffer.from('hello');
  const good = { bucket: 'library', name: 'a/b.pdf', size: 5, sha256: live.sha256(bytes), base64: bytes.toString('base64') };
  assert.deepEqual(live.verifyFiles({ files: [good] }), []);
  assert.deepEqual(live.verifyFiles({ files: [{ ...good, base64: Buffer.from('hellp').toString('base64') }] }), ['library/a/b.pdf']);
  const prod = { policies: [{ qual: '(( SELECT auth.uid() AS uid) = user_id)' }], tables: [{ name: 'ideas', rls: true }] };
  assert.deepEqual(live.compareCatalogs(prod, { policies: [{ qual: '(( SELECT uid() AS uid) = user_id)' }], tables: [{ name: 'ideas', rls: true }] }), []);
  assert.deepEqual(live.compareCatalogs(prod, { policies: prod.policies, tables: [{ name: 'ideas', rls: false }] }),
    ['tables: missing after restore: {"name":"ideas","rls":true}', 'tables: only in the restore: {"name":"ideas","rls":false}']);
});

test('safety rails: backups never go inside the repository; table names are checked', () => {
  assert.throws(() => live.assertOutsideRepo(path.join(root, 'backups')), /outside this repository/);
  assert.throws(() => live.assertOutsideRepo(root), /outside this repository/);
  assert.equal(live.assertOutsideRepo(path.join(os.tmpdir(), 'vault-backups')), path.resolve(os.tmpdir(), 'vault-backups'));
  assert.equal(live.quoteIdent('journal_entries'), '"journal_entries"');
  for (const bad of ['x; drop table y', 'Ideas', '"x"', '']) assert.throws(() => live.quoteIdent(bad), /Unexpected table name/);
  assert.match(read('.gitignore'), /\*\.vaultlive/, 'archives are ignored by git');
});

test('the backup reads only, discovers tables at run time and leaves out account secrets', () => {
  const src = read('scripts/vault/backup-live.mjs');
  const helper = read('scripts/vault/live-archive.mjs');
  assert.ok(helper.includes("'db', 'query', `--remote=${ref}`, '--read-only'"), 'every query is read-only');
  assert.ok(src.includes("from information_schema.tables where table_schema = 'public'"));
  assert.ok(!/encrypted_password|recovery_token|confirmation_token|refresh_token/.test(src.match(/auth\.users`?\)?[^;]*/)?.[0] ?? src.slice(src.indexOf('authUsers'), src.indexOf('archive.storage'))));
  assert.ok(src.includes("{ flag: 'wx', mode: 0o600 }"), 'never overwrites an existing backup');
  assert.ok(src.includes('fs.rmSync(work, { recursive: true, force: true })'), 'downloaded plaintext files are removed');
});

function loadExport() {
  const source = ts.transpileModule(read('src/lib/export.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: () => ({}) });
  return exports;
}
const ex = loadExport();

test('the export covers every table the owner can read, and no Drive tokens', () => {
  const sql = fs.readdirSync(path.join(root, 'supabase')).filter((f) => f.endsWith('.sql')).map((f) => read(`supabase/${f}`)).join('\n');
  const tables = new Set([...sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)/g)].map((m) => m[1]));
  const exported = new Set(ex.EXPORT_TABLES.map((s) => s.table));
  for (const t of tables) if (t !== 'site_owner') assert.ok(exported.has(t), `${t} is in the export`);
  assert.ok(exported.has('timevault_state'), 'the legacy table too');
  const drive = ex.EXPORT_TABLES.find((s) => s.table === 'drive_connections');
  assert.ok(drive.columns && !/token|google_account_id/.test(drive.columns));
});

test('the export reads with the owner filter, reports unreadable tables, and changes nothing', async () => {
  const calls = [];
  const client = { from(table) {
    const call = { table, filters: [] }; calls.push(call);
    const q = { select(cols) { call.cols = cols; return q; }, limit() { return q; }, eq(k, v) { call.filters.push([k, v]); return q; },
      then(ok) { return Promise.resolve(table === 'timevault_state' ? { data: null, error: { code: '42P01' } } : { data: [{ table }], error: null }).then(ok); } };
    return q;
  } };
  const file = await ex.buildExport(client, { id: 'owner-1', email: 'o@example.invalid' }, new Date('2026-11-21T00:00:00Z'));
  assert.equal(file.format, 'idea-vault-export-v1');
  assert.deepEqual(calls.find((c) => c.table === 'ideas').filters, [['user_id', 'owner-1']]);
  assert.deepEqual(calls.find((c) => c.table === 'showcases').filters, [], 'public snapshots carry no owner id');
  assert.equal(file.counts.ideas, 1);
  assert.equal(file.tables.timevault_state, undefined);
  assert.ok(file.notes.includes("timevault_state: couldn't be read for this export."));
  assert.ok(!('insert' in client) && calls.every((c) => c.cols !== undefined), 'only selects');
  const route = read('src/app/api/export/route.ts');
  assert.ok(route.includes('routeOwner()') && route.includes('"Cache-Control": "no-store"') && route.includes('"sec-fetch-site") === "cross-site"'));
  assert.ok(!/export async function (POST|PUT|PATCH|DELETE)/.test(route), 'GET only');
});
