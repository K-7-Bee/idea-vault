import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Phase 3B: Drive attachment logic with synthetic HTTP, storage and files. No network.
const root = path.join(import.meta.dirname, '..');
const globals = { Blob, Response, URL, URLSearchParams, JSON, Math, Number, Promise, setTimeout, fetch: () => assert.fail('unexpected fetch'), navigator: { onLine: true } };
function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (id) => mocks[id] ?? {}, process: { env: {} }, ...globals });
  return exports;
}
const ideas = load('src/lib/ideas.ts');
const files = load('src/lib/drive/files.ts', { '../ideas': ideas });
const upload = load('src/lib/drive/upload.ts');
const plain = (v) => JSON.parse(JSON.stringify(v));
const MB = 1024 * 1024;
const IDEA = '33333333-3333-4333-8333-333333333333';
const FILE = '44444444-4444-4444-8444-444444444444';

test('the upload switch is off unless explicitly enabled', () => {
  assert.equal(files.driveUploadsEnabled({}), false);
  assert.equal(files.driveUploadsEnabled({ DRIVE_UPLOADS_ENABLED: '0' }), false);
  for (const on of ['1', 'true', ' ON ']) assert.equal(files.driveUploadsEnabled({ DRIVE_UPLOADS_ENABLED: on }), true);
});

test('upload requests are validated and normalised', () => {
  const good = { ideaId: IDEA, fileId: FILE, name: ' photo\u0007.jpg ', mimeType: 'IMAGE/JPEG', size: 5 * MB };
  assert.deepEqual(plain(files.parseUploadRequest(good)), { ideaId: IDEA, fileId: FILE, name: 'photo.jpg', mimeType: 'image/jpeg', size: 5 * MB });
  assert.equal(files.parseUploadRequest({ ...good, mimeType: 'text/html; x=<script>' }).mimeType, 'application/octet-stream');
  assert.equal(files.parseUploadRequest({ ...good, size: 0 }).size, 0);
  assert.equal(files.parseUploadRequest({ ...good, size: 1024 * MB }).size, 1024 * MB);
  for (const bad of [{ ...good, size: 1024 * MB + 1 }, { ...good, size: -1 }, { ...good, size: 1.5 }, { ...good, size: '5' },
    { ...good, ideaId: 'x' }, { ...good, fileId: '../../etc' }, { ...good, name: '   ' }, null]) {
    assert.equal(files.parseUploadRequest(bad), null);
  }
});

test('a finished upload is recorded only if Drive holds exactly what the Vault asked for', () => {
  const expected = { fileId: FILE, ideaId: IDEA, folderId: 'folder-0000000001', size: 10 };
  const meta = { id: 'drive-file-000001', name: 'a.jpg', mimeType: 'image/jpeg', size: '10', md5Checksum: 'd41d8cd98f00b204e9800998ecf8427e',
    parents: ['folder-0000000001'], trashed: false, appProperties: { vaultFileId: FILE, vaultIdeaId: IDEA } };
  assert.deepEqual(plain(files.checkUploaded(meta, expected)), { ok: true, size: 10, md5: 'd41d8cd98f00b204e9800998ecf8427e' });
  assert.equal(files.checkUploaded({ ...meta, size: '11' }, expected).reason, 'size_mismatch');
  assert.equal(files.checkUploaded({ ...meta, size: undefined }, expected).reason, 'size_mismatch');
  assert.equal(files.checkUploaded({ ...meta, parents: ['elsewhere-000001'] }, expected).reason, 'wrong_folder');
  assert.equal(files.checkUploaded({ ...meta, appProperties: { vaultFileId: 'other', vaultIdeaId: IDEA } }, expected).reason, 'not_this_file');
  assert.equal(files.checkUploaded({ ...meta, appProperties: undefined }, expected).reason, 'not_this_file');
  assert.equal(files.checkUploaded({ ...meta, trashed: true }, expected).reason, 'trashed');
  assert.equal(files.checkUploaded({ ...meta, md5Checksum: 'not-hex' }, expected).md5, null);
  // Drive reports no size for an empty file.
  assert.equal(files.checkUploaded({ ...meta, size: undefined }, { ...expected, size: 0 }).ok, true);
});

test('only script-free types are served inline; everything else downloads', () => {
  for (const ok of ['image/png', 'image/jpeg', 'image/webp', 'audio/webm', 'audio/mp4', 'video/mp4', 'VIDEO/WEBM']) assert.equal(files.inlineSafe(ok), true, ok);
  for (const no of ['image/svg+xml', 'text/html', 'application/pdf', 'application/xhtml+xml', 'text/javascript', '', null]) assert.equal(files.inlineSafe(no), false, String(no));
  assert.equal(files.disposition('inline', 'naïve "x".png'), 'inline; filename="na_ve _x_.png"; filename*=UTF-8\'\'na%C3%AFve%20%22x%22.png');
  assert.equal(files.safeRange('bytes=0-1023'), 'bytes=0-1023');
  assert.equal(files.safeRange('bytes=500-'), 'bytes=500-');
  for (const bad of ['bytes=0-1,5-9', 'items=0-1', 'bytes=-500', null]) assert.equal(files.safeRange(bad), null);
});

test('Drive files get owner-checked Vault links and never Supabase signed URLs', async () => {
  const signed = [];
  const supabase = { storage: { from: () => ({ async createSignedUrls(paths) { signed.push(...paths); return { data: paths.map((p) => ({ path: p, signedUrl: `signed:${p}` })), error: null }; } }) } };
  const rows = [
    { id: 'a', path: 'owner/idea/a.jpg', name: 'a.jpg', mime_type: 'image/jpeg', size: 10 },
    { id: 'b', path: 'drive/drive-file-000001', name: 'b.jpg', mime_type: 'image/jpeg', size: 10, provider: 'drive', drive_file_id: 'drive-file-000001' },
    { id: 'c', path: 'drive/drive-file-000002', name: 'c.mp4', mime_type: 'video/mp4', size: 60 * MB, provider: 'drive', drive_file_id: 'drive-file-000002' },
  ];
  const result = await ideas.signFiles(supabase, rows);
  assert.deepEqual(signed, ['owner/idea/a.jpg']);
  assert.deepEqual(result.map((r) => r.url), ['signed:owner/idea/a.jpg', '/api/drive/file/b', '/api/drive/file/c?open=drive']);
  assert.equal(ideas.canPreview(result[0]), true);
  assert.equal(ideas.canPreview(result[1]), true);
  assert.equal(ideas.canPreview(result[2]), false, 'large Drive files open in Drive');
  assert.equal(ideas.canPreview({ ...result[1], mime_type: 'image/svg+xml' }), false, 'SVG from Drive is never inline');
  assert.equal(ideas.canPreview({ ...result[0], url: null }), false);
  // Only Drive rows: no signing request at all.
  signed.length = 0;
  await ideas.signFiles(supabase, [rows[1]]);
  assert.deepEqual(signed, []);
});

// --- browser upload ---

function memorySessions(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { map, get: async (id) => map.get(id), put: async (r) => { map.set(r.fileId, { ...r }); }, remove: async (id) => { map.delete(id); } };
}
const SESSION = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=session-1';

// A synthetic Google resumable endpoint plus the two Vault routes.
function fakeDrive({ size, stored = 0, failChunk = {}, start = null, complete = null, expire = false }) {
  const calls = [];
  let received = stored, expired = expire;
  const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method, range: init.headers?.['Content-Range'], bytes: init.body?.size ?? 0,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
    if (url === '/api/drive/upload-session') return start ? start() : json(200, { session: SESSION });
    if (url === '/api/drive/upload-complete') return complete ? complete() : json(200, { file: { id: FILE, provider: 'drive' } });
    if (expired) { expired = false; return new Response(null, { status: 404 }); }
    const range = init.headers['Content-Range'];
    if (range === `bytes */${size}`) return received === size ? json(200, { id: 'drive-file-000001' }) : new Response(null, { status: 308, headers: received ? { Range: `bytes=0-${received - 1}` } : {} });
    const [, a, b] = range.match(/^bytes (\d+)-(\d+)\//);
    const index = calls.filter((c) => c.range && !c.range.includes('*')).length;
    if (failChunk[index]) return failChunk[index]();
    assert.equal(Number(a), received, 'chunks must continue from the confirmed byte');
    received = Number(b) + 1;
    return received === size ? json(200, { id: 'drive-file-000001' }) : new Response(null, { status: 308, headers: { Range: `bytes=0-${received - 1}` } });
  };
  return { fetch, calls, get received() { return received; } };
}
const fileOf = (size, name = 'clip.mp4', type = 'video/mp4') => Object.assign(new Blob([new Uint8Array(size)], { type }), { name });
const input = (file) => ({ ownerId: 'owner', ideaId: IDEA, fileId: FILE, file });

test('Google byte ranges map to the next offset', () => {
  assert.equal(upload.nextOffset(null), 0);
  assert.equal(upload.nextOffset('bytes=0-8388607'), 8388608);
  assert.equal(upload.nextOffset('bytes=5-9'), 0);
  assert.equal(upload.CHUNK_BYTES % (256 * 1024), 0, 'chunks are a multiple of 256 KiB');
});

test('a file is sent in 256 KiB-aligned chunks, then verified and recorded', async () => {
  const size = 20 * MB + 123;
  const drive = fakeDrive({ size });
  const sessions = memorySessions();
  const progress = [];
  const row = await upload.uploadToDrive(input(fileOf(size)), { fetch: drive.fetch, sessions, onProgress: (s, t) => progress.push([s, t]) });
  assert.deepEqual(plain(row), { id: FILE, provider: 'drive' });
  const puts = drive.calls.filter((c) => c.method === 'PUT' && !c.range.includes('*'));
  assert.deepEqual(puts.map((c) => c.range), [`bytes 0-8388607/${size}`, `bytes 8388608-16777215/${size}`, `bytes 16777216-${size - 1}/${size}`]);
  assert.deepEqual(puts.map((c) => c.bytes), [8 * MB, 8 * MB, size - 16 * MB]);
  assert.deepEqual(drive.calls[0].body, { ideaId: IDEA, fileId: FILE, name: 'clip.mp4', mimeType: 'video/mp4', size });
  assert.deepEqual(drive.calls.at(-1).body, { ideaId: IDEA, fileId: FILE, size, driveFileId: 'drive-file-000001' });
  assert.deepEqual(progress.at(-1), [size, size]);
  assert.equal(sessions.map.size, 0, 'session removed once recorded');
});

test('after a reload the upload resumes from the byte Google confirmed', async () => {
  const size = 20 * MB;
  const drive = fakeDrive({ size, stored: 8 * MB });
  const sessions = memorySessions({ [FILE]: { fileId: FILE, ownerId: 'owner', ideaId: IDEA, size, session: SESSION } });
  await upload.uploadToDrive(input(fileOf(size)), { fetch: drive.fetch, sessions });
  assert.equal(drive.calls.some((c) => c.url === '/api/drive/upload-session'), false, 'no new session');
  const puts = drive.calls.filter((c) => c.method === 'PUT' && !c.range.includes('*'));
  assert.equal(puts[0].range, `bytes 8388608-16777215/${size}`);
  assert.equal(puts.length, 2);
});

test('a saved session for another owner, idea or size is ignored', async () => {
  const size = 1 * MB;
  for (const stale of [{ ownerId: 'other' }, { ideaId: '55555555-5555-4555-8555-555555555555' }, { size: size + 1 }]) {
    const drive = fakeDrive({ size });
    const sessions = memorySessions({ [FILE]: { fileId: FILE, ownerId: 'owner', ideaId: IDEA, size, session: 'https://stale.invalid/', ...stale } });
    await upload.uploadToDrive(input(fileOf(size)), { fetch: drive.fetch, sessions });
    assert.equal(drive.calls.some((c) => c.url === 'https://stale.invalid/'), false);
    assert.equal(drive.calls[0].url, '/api/drive/upload-session');
  }
});

test('an expired session starts once more; a second expiry fails without fallback', async () => {
  const size = 1 * MB;
  const drive = fakeDrive({ size, expire: true });
  const sessions = memorySessions({ [FILE]: { fileId: FILE, ownerId: 'owner', ideaId: IDEA, size, session: SESSION } });
  await upload.uploadToDrive(input(fileOf(size)), { fetch: drive.fetch, sessions });
  assert.equal(drive.calls.filter((c) => c.url === '/api/drive/upload-session').length, 1);

  const always = async (url) => url === '/api/drive/upload-session' ? new Response(JSON.stringify({ session: SESSION }), { status: 200 }) : new Response(null, { status: 410 });
  await assert.rejects(upload.uploadToDrive(input(fileOf(size)), { fetch: always, sessions: memorySessions() }),
    (e) => !(e instanceof upload.DriveUnavailable) && /expired/.test(e.message));
});

test('temporary Google errors back off and re-check the offset, with a bounded number of retries', async () => {
  const size = 10 * MB;
  const sleeps = [];
  const drive = fakeDrive({ size, failChunk: { 1: () => new Response(null, { status: 503 }), 2: () => new Response(null, { status: 429 }) } });
  await upload.uploadToDrive(input(fileOf(size)), { fetch: drive.fetch, sessions: memorySessions(), sleep: async (ms) => { sleeps.push(ms); } });
  assert.deepEqual(sleeps, [1000, 2000]);
  assert.equal(drive.received, size);

  const failing = fakeDrive({ size, failChunk: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [i + 1, () => new Response(null, { status: 500 })])) });
  const waits = [];
  await assert.rejects(upload.uploadToDrive(input(fileOf(size)), { fetch: failing.fetch, sessions: memorySessions(), sleep: async (ms) => { waits.push(ms); } }),
    /kept refusing/);
  assert.equal(waits.length, 6);
  assert.ok(waits.every((ms) => ms <= 32000));
});

test('Drive being unavailable, a dropped connection and a paused session are told apart', async () => {
  const size = 1 * MB;
  for (const reason of ['disabled', 'not_connected', 'reconnect', 'no_folder', 'google', 'quota']) {
    const drive = fakeDrive({ size, start: () => new Response(JSON.stringify({ error: reason }), { status: 409 }) });
    await assert.rejects(upload.uploadToDrive(input(fileOf(size)), { fetch: drive.fetch, sessions: memorySessions() }),
      (e) => e instanceof upload.DriveUnavailable && e.reason === reason);
  }
  const bad = fakeDrive({ size, start: () => new Response(JSON.stringify({ error: 'invalid' }), { status: 400 }) });
  await assert.rejects(upload.uploadToDrive(input(fileOf(size)), { fetch: bad.fetch, sessions: memorySessions() }),
    (e) => !(e instanceof upload.DriveUnavailable) && !(e instanceof upload.DriveOffline));

  const sessions = memorySessions();
  const dropped = async (url) => { if (url === '/api/drive/upload-session') return new Response(JSON.stringify({ session: SESSION }), { status: 200 }); throw new TypeError('Failed to fetch'); };
  await assert.rejects(upload.uploadToDrive(input(fileOf(size)), { fetch: dropped, sessions }), (e) => e instanceof upload.DriveOffline);
  assert.equal(sessions.map.get(FILE).session, SESSION, 'session kept to resume later');

  await assert.rejects(upload.uploadToDrive(input(fileOf(size)), { fetch: fakeDrive({ size }).fetch, sessions: memorySessions(), active: () => false }),
    (e) => e instanceof upload.DriveOffline);
});

test('bytes in Drive are never re-sent elsewhere when recording fails; the retry only records', async () => {
  const size = 1 * MB;
  const sessions = memorySessions();
  let completeAnswer = () => new Response(JSON.stringify({ error: 'reconnect' }), { status: 409 });
  const drive = fakeDrive({ size, complete: () => completeAnswer() });
  await assert.rejects(upload.uploadToDrive(input(fileOf(size)), { fetch: drive.fetch, sessions }),
    (e) => !(e instanceof upload.DriveUnavailable) && /reached Google Drive/.test(e.message));
  assert.equal(sessions.map.get(FILE).driveFileId, 'drive-file-000001');
  const before = drive.calls.length;
  completeAnswer = () => new Response(JSON.stringify({ file: { id: FILE } }), { status: 200 });
  await upload.uploadToDrive(input(fileOf(size)), { fetch: drive.fetch, sessions });
  assert.deepEqual(drive.calls.slice(before).map((c) => c.url), ['/api/drive/upload-complete'], 'no new session and no bytes');
});

test('empty and already-recorded files skip the byte upload', async () => {
  const drive = fakeDrive({ size: 0, start: () => new Response(JSON.stringify({ done: true, driveFileId: 'drive-file-000009' }), { status: 200 }) });
  await upload.uploadToDrive(input(fileOf(0)), { fetch: drive.fetch, sessions: memorySessions() });
  assert.deepEqual(drive.calls.map((c) => c.url), ['/api/drive/upload-session', '/api/drive/upload-complete']);
  assert.equal(drive.calls[1].body.driveFileId, 'drive-file-000009');
});

// --- destination choice in the capture sync ---

function loadSync() {
  return load('src/lib/sync.ts', {
    './ideas': ideas,
    './drive/upload': upload,
    './recovery-operations': { retainDeletedIdea: async () => {} },
  });
}
function fakeSupabase() {
  const log = [];
  const result = (data) => ({ data, error: null });
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
    from(table) {
      const q = { insert(row) { log.push([table, 'insert', row]); return Promise.resolve(result(null)); },
        select() { return q; }, eq() { return q; }, single: async () => result({ id: IDEA, content: 'x', status: 'exploring', tags: [], created_at: 'now', files: [] }) };
      return q;
    },
    storage: { from: () => ({ async upload(p) { log.push(['storage', 'upload', p]); return { error: null }; }, async createSignedUrls() { return { data: [], error: null }; } }) },
  };
  return { supabase, log };
}
const queued = (files) => ({ owner_id: 'owner', id: IDEA, content: 'x', tags: [], created_at: 'now',
  files: files.map(([name, size], i) => ({ id: `file-${i}`, file: fileOf(size, name) })) });

test('each file goes to Drive, falls back to Vault storage within 25 MB, or waits for Drive', async () => {
  const sync = loadSync();
  const scenarios = [
    ['drive ok', async () => ({ id: 'x' }), { stored: 0, failures: 0, waiting: [], fellBack: [] }],
    ['unavailable small', async () => { throw new upload.DriveUnavailable('reconnect'); }, { stored: 1, failures: 0, waiting: [], fellBack: ['small.jpg'] }],
  ];
  for (const [label, uploader, expected] of scenarios) {
    const { supabase, log } = fakeSupabase();
    const result = await sync.pushIdea(supabase, queued([['small.jpg', 2 * MB]]), () => true, { enabled: true, upload: uploader });
    assert.equal(log.filter((l) => l[1] === 'upload').length, expected.stored, label);
    assert.deepEqual(plain(result.waiting), expected.waiting, label);
    assert.deepEqual(plain(result.fellBack), expected.fellBack, label);
    assert.equal(result.failures.length, expected.failures, label);
  }

  const { supabase, log } = fakeSupabase();
  const large = await sync.pushIdea(supabase, queued([['big.mp4', 30 * MB]]), () => true,
    { enabled: true, upload: async () => { throw new upload.DriveUnavailable('not_connected'); } });
  assert.deepEqual(plain(large.waiting), ['big.mp4']);
  assert.equal(log.some((l) => l[1] === 'upload'), false, 'large files never go to Vault storage');

  const failed = await sync.pushIdea(fakeSupabase().supabase, queued([['a.jpg', 1]]), () => true,
    { enabled: true, upload: async () => { throw new Error('size_mismatch'); } });
  assert.deepEqual(failed.failures.length, 1);
  assert.deepEqual(plain(failed.fellBack), [], 'a real failure never falls back to a second copy');
});

test('a dropped connection keeps the whole capture queued; uploads off keeps today\'s behaviour', async () => {
  const sync = loadSync();
  await assert.rejects(sync.pushIdea(fakeSupabase().supabase, queued([['a.jpg', 1]]), () => true,
    { enabled: true, upload: async () => { throw new upload.DriveOffline('dropped'); } }), (e) => e.constructor.name === 'NetworkError' || e instanceof sync.NetworkError);

  const { supabase, log } = fakeSupabase();
  let called = false;
  const off = await sync.pushIdea(supabase, queued([['a.jpg', 1]]), () => true, { enabled: false, upload: async () => { called = true; } });
  assert.equal(called, false);
  assert.equal(log.filter((l) => l[1] === 'upload').length, 1);
  assert.deepEqual(plain(off.waiting), []);
  const defaulted = await sync.pushIdea(fakeSupabase().supabase, queued([['a.jpg', 1]]));
  assert.deepEqual(plain(defaulted.fellBack), []);
});

test('device recovery accepts a Drive attachment only in its exact drive/<id> form', async () => {
  const ops = load('src/lib/recovery-operations.ts', { './recovery': { saveRecovery: async () => {}, getRecovery: async () => undefined } });
  const inserted = [];
  const client = { from(table) {
    const q = { select() { return q; }, eq() { return q; },
      maybeSingle: async () => ({ data: { id: IDEA, content: 'x', status: 'exploring', tags: [], created_at: 't', files: [] }, error: null }),
      insert: async (row) => { inserted.push([table, row]); return { error: null }; } };
    return q;
  } };
  const record = (file) => ({ id: 'r', owner_id: 'owner', kind: 'file', saved_at: 't',
    idea: { id: IDEA, content: 'x', status: 'exploring', tags: [], created_at: 't', files: [file] } });
  const drive = { id: FILE, path: 'drive/drive-file-000001', name: 'a.png', mime_type: 'image/png', size: 1, provider: 'drive', drive_file_id: 'drive-file-000001', md5: 'd41d8cd98f00b204e9800998ecf8427e' };
  await ops.restoreRecovery(client, record(drive), 'owner', async () => {});
  assert.deepEqual(plain(inserted[0][1]), { id: FILE, path: 'drive/drive-file-000001', name: 'a.png', mime_type: 'image/png', size: 1,
    provider: 'drive', drive_file_id: 'drive-file-000001', md5: 'd41d8cd98f00b204e9800998ecf8427e', idea_id: IDEA, user_id: 'owner' });
  for (const bad of [{ ...drive, path: 'drive/another-file-0001' }, { ...drive, drive_file_id: '../x' , path: 'drive/../x' },
    { ...drive, provider: undefined }, { ...drive, path: 'other-owner/idea/a.png', provider: undefined }]) {
    await assert.rejects(ops.restoreRecovery(client, record(bad), 'owner', async () => {}), /ownership/);
  }
  // A legacy Supabase record restores exactly as before (no Drive fields).
  inserted.length = 0;
  await ops.restoreRecovery(client, record({ id: FILE, path: `owner/${IDEA}/a.png`, name: 'a.png', mime_type: 'image/png', size: 1 }), 'owner', async () => {});
  assert.equal('provider' in inserted[0][1], false);
});

test('Drive attachment code never logs', () => {
  for (const file of ['src/lib/drive/upload.ts', 'src/lib/drive/files.ts', 'src/app/api/drive/upload-session/route.ts',
    'src/app/api/drive/upload-complete/route.ts', 'src/app/api/drive/file/[fileId]/route.ts']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /console\.|debugger/, file);
  }
});
