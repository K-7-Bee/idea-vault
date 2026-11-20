import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Phase 3C: project files. Synthetic storage, Drive and HTTP only.
const root = path.join(import.meta.dirname, '..');
const globals = { Blob, Response, URL, URLSearchParams, JSON, Math, Number, Promise, setTimeout };
function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (id) => mocks[id] ?? {}, process: { env: {} }, ...globals });
  return exports;
}
const ideas = load('src/lib/ideas.ts');
const files = load('src/lib/drive/files.ts', { '../ideas': ideas });
const projectFiles = load('src/lib/project-files.ts', { './ideas': ideas });
const upload = load('src/lib/drive/upload.ts');
const plain = (v) => JSON.parse(JSON.stringify(v));
const P = '77777777-7777-4777-8777-777777777777';
const E = '88888888-8888-4888-8888-888888888888';
const C = '99999999-9999-4999-8999-999999999999';
const I = '33333333-3333-4333-8333-333333333333';
const F = '44444444-4444-4444-8444-444444444444';

test('an upload targets exactly one idea or one project, optionally one of its records', () => {
  assert.deepEqual(plain(files.parseTarget({ ideaId: I })), { kind: 'idea', ideaId: I });
  assert.deepEqual(plain(files.parseTarget({ projectId: P })), { kind: 'project', projectId: P, entryId: null, componentId: null, characterId: null, unitId: null });
  assert.deepEqual(plain(files.parseTarget({ projectId: P, entryId: E })), { kind: 'project', projectId: P, entryId: E, componentId: null, characterId: null, unitId: null });
  assert.deepEqual(plain(files.parseTarget({ projectId: P, componentId: C, entryId: null })), { kind: 'project', projectId: P, entryId: null, componentId: C, characterId: null, unitId: null });
  for (const bad of [{}, { ideaId: I, projectId: P }, { ideaId: I, entryId: E }, { projectId: P, entryId: E, componentId: C },
    { projectId: 'x' }, { projectId: P, entryId: '../x' }, null]) {
    assert.equal(files.parseTarget(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(plain(files.parseUploadRequest({ projectId: P, componentId: C, fileId: F, name: 'spec.pdf', mimeType: 'application/pdf', size: 3 }).target),
    { kind: 'project', projectId: P, entryId: null, componentId: C, characterId: null, unitId: null });
});

test('project uploads are tagged and verified against the project, not an idea', () => {
  const tags = files.targetTags({ kind: 'project', projectId: P, entryId: E, componentId: null, characterId: null, unitId: null }, F);
  assert.deepEqual(plain(tags), { vaultFileId: F, vaultProjectId: P });
  const meta = { id: 'drive-file-000001', name: 'a', mimeType: 'text/plain', size: '3', parents: ['folder-proj-00001'], appProperties: { vaultFileId: F, vaultProjectId: P } };
  assert.equal(files.checkUploaded(meta, { tags, folderId: 'folder-proj-00001', size: 3 }).ok, true);
  assert.equal(files.checkUploaded({ ...meta, appProperties: { vaultFileId: F, vaultIdeaId: P } }, { tags, folderId: 'folder-proj-00001', size: 3 }).reason, 'not_this_file');
  assert.equal(files.checkUploaded({ ...meta, appProperties: { vaultFileId: F, vaultProjectId: 'other' } }, { tags, folderId: 'folder-proj-00001', size: 3 }).reason, 'not_this_file');
  assert.equal(files.checkUploaded(meta, { tags, folderId: 'vault-root-000001', size: 3 }).reason, 'wrong_folder', 'must be in the project folder');
});

test('"Check files" classifies Drive answers and never guesses on temporary errors', () => {
  assert.deepEqual(plain(files.classifyCheck({ meta: { name: 'Renamed.pdf', trashed: false } })), { state: 'ok', name: 'Renamed.pdf' });
  assert.deepEqual(plain(files.classifyCheck({ meta: { name: 'x', trashed: true } })), { state: 'unavailable', reason: 'trashed' });
  assert.deepEqual(plain(files.classifyCheck({ status: 404 })), { state: 'unavailable', reason: 'missing' });
  assert.deepEqual(plain(files.classifyCheck({ status: 403 })), { state: 'unavailable', reason: 'no_access' });
  for (const status of [429, 500, 503, 0]) assert.equal(files.classifyCheck({ status }), null);
});

test('project folder names are safe and never empty; Google files are recognised', () => {
  assert.equal(files.folderName('  Robot\u0007 arm / v2\\final  '), 'Robot arm v2 final');
  assert.equal(files.folderName('\u0000\u0001'), 'Project');
  assert.equal(files.folderName('x'.repeat(300)).length, 120);
  assert.equal(files.isGoogleNative('application/vnd.google-apps.document'), true);
  assert.equal(files.isGoogleNative('application/pdf'), false);
  assert.equal(files.isGoogleNative(null), false);
});

test('project files preview small safe media; Google files and large files open in Drive', () => {
  const base = { id: F, project_id: P, entry_id: null, component_id: null, source: 'upload', drive_file_id: 'drive-file-000001', md5: null, state: 'ok', state_reason: null, checked_at: null, created_at: 't' };
  const view = (over) => plain(projectFiles.projectFileView({ ...base, name: 'f', mime_type: 'image/png', size: 10, ...over }));
  assert.deepEqual(view({}), { href: `/api/drive/file/${F}`, preview: 'image', opensInDrive: false });
  assert.deepEqual(view({ mime_type: 'audio/webm' }).preview, 'audio');
  assert.deepEqual(view({ mime_type: 'image/svg+xml' }).preview, null);
  assert.deepEqual(view({ mime_type: 'application/pdf' }), { href: `/api/drive/file/${F}`, preview: null, opensInDrive: false });
  assert.deepEqual(view({ mime_type: 'application/vnd.google-apps.document', size: null }), { href: `/api/drive/file/${F}?open=drive`, preview: null, opensInDrive: true });
  assert.deepEqual(view({ size: 60 * 1024 * 1024 }).opensInDrive, true);
  assert.equal(projectFiles.projectFileMeta({ ...base, source: 'picked', mime_type: 'application/vnd.google-apps.spreadsheet', size: null }), 'Linked from Drive · Google file');
  assert.equal(projectFiles.projectFileMeta({ ...base, mime_type: 'text/plain', size: 2048 }), 'Uploaded · 2 KB');
});

test('a project upload sends the project target and never reuses an idea upload session', async () => {
  const calls = [];
  const sessions = new Map([[F, { fileId: F, ownerId: 'owner', ideaId: I, size: 3, session: 'https://idea-session.invalid/' }]]);
  const store = { get: async (id) => sessions.get(id), put: async (r) => { sessions.set(r.fileId, r); }, remove: async (id) => { sessions.delete(id); } };
  const fetch = async (url, init = {}) => {
    calls.push({ url, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
    if (url === '/api/drive/upload-session') return new Response(JSON.stringify({ session: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=p' }), { status: 200 });
    if (url === '/api/drive/upload-complete') return new Response(JSON.stringify({ file: { id: F, project_id: P } }), { status: 200 });
    const range = init.headers['Content-Range'];
    if (range.startsWith('bytes */')) return new Response(null, { status: 308 });
    return new Response(JSON.stringify({ id: 'drive-file-000002' }), { status: 200 });
  };
  const file = Object.assign(new Blob([new Uint8Array(3)], { type: 'text/plain' }), { name: 'notes.txt' });
  const row = await upload.uploadToDrive({ ownerId: 'owner', projectId: P, entryId: E, fileId: F, file }, { fetch, sessions: store });
  assert.deepEqual(plain(row), { id: F, project_id: P });
  assert.equal(calls.some((c) => c.url === 'https://idea-session.invalid/'), false);
  assert.deepEqual(calls[0].body, { projectId: P, entryId: E, componentId: null, characterId: null, unitId: null, fileId: F, name: 'notes.txt', mimeType: 'text/plain', size: 3 });
  assert.deepEqual(calls.at(-1).body, { projectId: P, entryId: E, componentId: null, characterId: null, unitId: null, fileId: F, size: 3, driveFileId: 'drive-file-000002' });
  assert.equal(sessions.size, 0);
});

test('3D: a file can belong to a character or a structure item, never two records', () => {
  const H = '55555555-5555-4555-8555-555555555555', U = '66666666-6666-4666-8666-666666666666';
  assert.deepEqual(plain(files.parseTarget({ projectId: P, characterId: H })), { kind: 'project', projectId: P, entryId: null, componentId: null, characterId: H, unitId: null });
  assert.deepEqual(plain(files.parseTarget({ projectId: P, unitId: U, characterId: null })), { kind: 'project', projectId: P, entryId: null, componentId: null, characterId: null, unitId: U });
  for (const bad of [{ projectId: P, characterId: H, unitId: U }, { projectId: P, entryId: E, unitId: U }, { projectId: P, characterId: 'x' },
    { ideaId: I, characterId: H }, { ideaId: I, unitId: U }]) {
    assert.equal(files.parseTarget(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(plain(files.linkColumns({ entryId: null, componentId: null, characterId: H, unitId: null })),
    { entry_id: null, component_id: null, character_id: H, unit_id: null });
  assert.equal(files.parseLink({ characterId: H, unitId: U }), null);
  assert.deepEqual(plain(files.parseLink({})), { entryId: null, componentId: null, characterId: null, unitId: null });
});

test('3D: a record shows its main image first, else the first image attached; other files are ignored', () => {
  const H = '55555555-5555-4555-8555-555555555555';
  const img = (id, created, extra = {}) => ({ id, created_at: created, mime_type: 'image/png', character_id: H, unit_id: null, is_main: false, ...extra });
  const first = img('a', '2026-01-01'), second = img('b', '2026-01-02'), third = img('c', '2026-01-03');
  const doc = img('d', '2025-01-01', { mime_type: 'application/pdf' }), svg = img('e', '2025-01-02', { mime_type: 'image/svg+xml' });
  const other = img('f', '2025-01-03', { character_id: 'someone-else' });
  const order = (list) => plain(projectFiles.imagesFor(list, { kind: 'character', id: H }).map((f) => f.id));
  assert.deepEqual(order([third, doc, second, first, svg, other]), ['a', 'b', 'c'], 'oldest image is main by default; SVG and PDF are not images');
  assert.deepEqual(order([third, second, { ...first }, { ...second, id: 'b2', is_main: true }].filter((f) => f.id !== 'b')), ['b2', 'a', 'c']);
  assert.deepEqual(plain(projectFiles.imagesFor([first], { kind: 'unit', id: H })), [], 'a character image is not a unit image');
  assert.equal(projectFiles.thumbUrl({ id: 'abc' }), '/api/drive/file/abc?size=thumb');
  assert.deepEqual(plain(projectFiles.imageOwner({ character_id: null, unit_id: 'u1' })), { kind: 'unit', id: 'u1' });
});

// --- server: project folders ---

function fakeStore() {
  const folders = [];
  const log = [];
  let conflictOnce = null;
  const supabase = { from(table) {
    const q = { filters: [], op: 'select', values: null,
      select() { return q; }, eq(c, v) { q.filters.push([c, v]); return q; }, limit() { return q; },
      insert(v) { q.op = 'insert'; q.values = v; return q; }, delete() { q.op = 'delete'; return q; },
      then(res, rej) { return Promise.resolve().then(() => run(table, q)).then(res, rej); } };
    return q;
  } };
  function run(table, q) {
    const match = (row) => q.filters.every(([c, v]) => row[c] === v);
    if (table === 'projects') return { data: [{ title: 'Robot / Arm' }], error: null };
    if (table !== 'drive_folders') throw new Error(`unexpected table ${table}`);
    if (q.op === 'insert') {
      log.push(['insert', q.values.purpose, q.values.folder_id]);
      if (conflictOnce && q.values.purpose === conflictOnce.purpose) { folders.push({ ...q.values, folder_id: conflictOnce.winner }); conflictOnce = null; return { data: null, error: { code: '23505' } }; }
      folders.push({ ...q.values });
      return { data: null, error: null };
    }
    if (q.op === 'delete') { for (const row of folders.filter(match)) folders.splice(folders.indexOf(row), 1); return { data: null, error: null }; }
    return { data: folders.filter(match).map((r) => ({ folder_id: r.folder_id })), error: null };
  }
  return { supabase, folders, log, raceOn: (purpose, winner) => { conflictOnce = { purpose, winner }; } };
}
function loadTargets(google) {
  class GoogleError extends Error { constructor(code, status) { super(code); this.code = code; this.status = status; } }
  return { targets: load('src/lib/drive/targets.ts', { './files': files, './google': { GoogleError, ...google(GoogleError) } }), GoogleError };
}
const ROOT = 'vault-root-folder-1';
const projectTarget = { kind: 'project', projectId: P, entryId: null, componentId: null, characterId: null, unitId: null };

test('project folders are created once under Projects/ and then reused', async () => {
  const made = [];
  const { targets } = loadTargets(() => ({ createFolder: async (_t, name, parent) => { const id = `made-folder-${made.length + 1}`; made.push([name, parent, id]); return { id }; } }));
  const s = fakeStore();
  assert.equal(await targets.targetFolder(s.supabase, 'owner', 'tok', ROOT, projectTarget, false), null, 'lookup only creates nothing');
  assert.deepEqual(made, []);
  const first = await targets.targetFolder(s.supabase, 'owner', 'tok', ROOT, projectTarget, true);
  assert.deepEqual(made, [['Projects', ROOT, 'made-folder-1'], ['Robot Arm', 'made-folder-1', 'made-folder-2']]);
  assert.equal(first, 'made-folder-2');
  assert.equal(await targets.targetFolder(s.supabase, 'owner', 'tok', ROOT, projectTarget, true), 'made-folder-2');
  assert.equal(await targets.targetFolder(s.supabase, 'owner', 'tok', ROOT, projectTarget, false), 'made-folder-2');
  assert.equal(made.length, 2, 'no further folders');
  assert.equal(await targets.targetFolder(s.supabase, 'owner', 'tok', ROOT, { kind: 'idea', ideaId: I }, true), ROOT, 'ideas use the chosen folder');
});

test('when two uploads race to create a folder, both use the recorded winner', async () => {
  const { targets } = loadTargets(() => ({ createFolder: async () => ({ id: 'loser-folder-01' }) }));
  const s = fakeStore();
  s.raceOn('projects_root', 'winner-folder-1');
  const folder = await targets.targetFolder(s.supabase, 'owner', 'tok', ROOT, projectTarget, true);
  const root = s.folders.find((f) => f.purpose === 'projects_root');
  assert.equal(root.folder_id, 'winner-folder-1');
  assert.equal(s.folders.find((f) => f.purpose === 'project').parent_folder_id, 'winner-folder-1');
  assert.equal(folder, 'loser-folder-01', 'project folder (created once) is used');
});

test('only Vault folders that are gone from Drive are forgotten', async () => {
  const s = fakeStore();
  s.folders.push({ user_id: 'owner', purpose: 'projects_root', parent_folder_id: ROOT, folder_id: 'projects-folder-1' },
    { user_id: 'owner', purpose: 'project', parent_folder_id: 'projects-folder-1', project_id: P, folder_id: 'project-folder-01' });
  const { targets } = loadTargets((GoogleError) => ({ getFileMeta: async (_t, id) => {
    if (id === 'project-folder-01') throw new GoogleError('notFound', 404);
    return { id, trashed: false };
  } }));
  await targets.forgetMissingFolders(s.supabase, 'owner', 'tok', ROOT, projectTarget);
  assert.deepEqual(s.folders.map((f) => f.folder_id), ['projects-folder-1'], 'the existing Projects folder is kept');
});

test('Project files code never logs', () => {
  for (const file of ['src/lib/drive/targets.ts', 'src/lib/drive/picker.ts', 'src/lib/project-files.ts', 'src/app/api/drive/project-files/route.ts',
    'src/app/api/drive/project-files/check/route.ts', 'src/app/api/drive/project-files/[id]/route.ts']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /console\.|debugger/, file);
  }
});
