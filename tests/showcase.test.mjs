import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Phase 4A: showcase drafts, publishing rules and the public read path.
const root = path.join(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
function load(file) {
  const source = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  let n = 0;
  vm.runInNewContext(source, { exports, require: () => ({}), URL, crypto: { randomUUID: () => `uuid-${++n}` } });
  return exports;
}
const sc = load('src/lib/showcase.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));

const draft = (over = {}) => ({ slug: 'line-rover', title: 'Line rover', category: '', summary: 'A rover.', technologies: [],
  sections: {}, links: [], images: [], ...over });
const image = (over = {}) => ({ id: 'f1', mime_type: 'image/png', size: 1000, state: 'ok', ...over });
const done = { stage: 'completed', archived_at: null };

test('reserved addresses are exactly the hand-written case studies (also enforced in 013)', () => {
  const slugs = [...read('src/lib/projects.ts').matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(plain(sc.RESERVED_SLUGS).sort(), slugs.sort());
  const sql = read('supabase/013_showcases.sql');
  for (const slug of slugs) assert.match(sql, new RegExp(`'${slug}'`));
});

test('section keys match the ones publish_showcase allows, in the same order', () => {
  const sql = read('supabase/013_showcases.sql');
  const allowed = /allowed text\[\] := array\[([^\]]+)\]/.exec(sql)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(plain(sc.SECTIONS.map((s) => s.key)), allowed);
});

test('addresses: slugify and validation', () => {
  assert.equal(sc.slugify('  Line-Following Rover (v2)!  '), 'line-following-rover-v2');
  assert.equal(sc.slugify('Café Über'), 'cafe-uber');
  assert.equal(sc.slugProblem('line-rover'), null);
  for (const bad of ['', 'ab', 'Line', 'two--hyphens', '-start', 'end-', 'has space', 'cha-restaurant', 'a'.repeat(61)]) {
    assert.ok(sc.slugProblem(bad), bad);
  }
});

test('cleanDraft drops empty sections and links, and refuses unsafe input', () => {
  const ok = sc.cleanDraft(draft({ sections: { problem: 'P', lessons: '   ', bogus: 'x' }, links: [{ label: '', href: '' }, { label: 'Code', href: ' https://example.com/x ' }] }));
  assert.equal(ok.ok, true);
  assert.deepEqual(plain(ok.value.sections), { problem: 'P' });
  assert.deepEqual(plain(ok.value.links), [{ label: 'Code', href: 'https://example.com/x' }]);
  assert.equal(sc.cleanDraft(draft({ slug: '' })).ok, true, 'an unfinished draft may have no address yet');
  for (const bad of [
    { slug: 'idea-vault' },
    { links: [{ label: 'Plain', href: 'http://example.com' }] },
    { links: [{ label: 'Script', href: 'javascript:alert(1)' }] },
    { links: [{ label: '', href: 'https://example.com' }] },
    { images: [{ file_id: 'a', alt: '' }, { file_id: 'a', alt: '' }] },
    { images: Array.from({ length: 9 }, (_, i) => ({ file_id: `f${i}`, alt: 'x' })) },
    { summary: 'x'.repeat(401) },
    { sections: { problem: 'x'.repeat(5001) } },
  ]) assert.equal(sc.cleanDraft(draft(bad)).ok, false, JSON.stringify(bad).slice(0, 60));
});

test('the preview uses the same section rule as the published snapshot', () => {
  const content = sc.draftContent(draft({ sections: { lessons: ' L ', problem: 'P', approach: '  ' }, images: [{ file_id: 'f1', alt: ' Rover ' }] }), (id) => `/thumb/${id}`);
  assert.deepEqual(plain(content.sections), [{ key: 'problem', label: 'The problem', body: 'P' }, { key: 'lessons', label: 'Lessons learned', body: 'L' }]);
  assert.deepEqual(plain(content.images), [{ src: '/thumb/f1', alt: 'Rover' }]);
});

test('publishedContent builds public image URLs from the snapshot only', () => {
  const content = sc.publishedContent({ slug: 's', title: 'T', category: '', summary: 'S', technologies: ['C'], published_at: 'x',
    sections: [{ key: 'results', body: 'R' }], links: [], images: [{ path: 'owner/a b.webp', alt: 'A' }] }, 'https://x.supabase.co/');
  assert.equal(content.images[0].src, 'https://x.supabase.co/storage/v1/object/public/showcase/owner/a%20b.webp');
  assert.equal(content.sections[0].label, 'Results');
});

test('publishProblems: completed, active, complete draft and publishable images only', () => {
  assert.deepEqual(plain(sc.publishProblems(draft(), done, [])), []);
  assert.ok(sc.publishProblems(draft(), { stage: 'building', archived_at: null }, []).some((p) => /Completed/.test(p)));
  assert.ok(sc.publishProblems(draft(), { stage: 'completed', archived_at: 'x' }, []).some((p) => /archive/.test(p)));
  assert.ok(sc.publishProblems(null, done, []).some((p) => /Save a showcase draft/.test(p)));
  assert.ok(sc.publishProblems(draft({ title: ' ', summary: '' }), done, []).length >= 2);
  const withImage = (file, alt = 'Rover') => sc.publishProblems(draft({ images: [{ file_id: 'f1', alt }] }), done, file ? [file] : []);
  assert.deepEqual(plain(withImage(image())), []);
  assert.ok(withImage(image(), ' ').some((p) => /Describe image 1/.test(p)));
  assert.ok(withImage(image({ mime_type: 'image/gif' })).some((p) => /JPEG, PNG or WebP/.test(p)));
  assert.ok(withImage(image({ size: 5 * 1024 * 1024 + 1 })).some((p) => /5 MB/.test(p)));
  assert.ok(withImage(image({ size: null })).some((p) => /5 MB/.test(p)));
  assert.ok(withImage(image({ state: 'unavailable' })).some((p) => /unavailable/.test(p)));
  assert.ok(withImage(null).some((p) => /no longer on the project/.test(p)));
});

test('image bytes are identified by content, not by name or label', () => {
  const bytes = (...b) => new Uint8Array(b);
  assert.equal(sc.sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)), 'image/png');
  assert.equal(sc.sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg');
  assert.equal(sc.sniffImage(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)), 'image/webp');
  assert.equal(sc.sniffImage(new TextEncoder().encode('<svg onload="x"></svg>')), null);
  assert.equal(sc.sniffImage(bytes(0x47, 0x49, 0x46, 0x38)), null, 'GIF is not published');
  assert.equal(sc.sniffImage(bytes()), null);
});

test('a new draft never copies private project text beyond the title', () => {
  const suggestion = sc.suggestedDraft({ title: 'Line Rover', summary: 'PRIVATE notes about the supplier' });
  assert.equal(suggestion.summary, '');
  assert.equal(suggestion.slug, 'line-rover');
  assert.deepEqual(plain(suggestion.sections), {});
  assert.equal(sc.suggestedDraft({ title: 'Idea Vault', summary: '' }).slug, '', 'reserved address is not suggested');
});

function fakeClient(answer) {
  const calls = [];
  const q = (call) => {
    const chain = {
      update(payload) { call.op = 'update'; call.payload = payload; return chain; },
      insert(payload) { call.op = 'insert'; call.payload = payload; return chain; },
      select(columns) { call.columns = columns; return chain; },
      eq(column, value) { call.filters.push([column, value]); return chain; },
      then(resolve, reject) { return Promise.resolve(answer).then(resolve, reject); },
    };
    return chain;
  };
  return { calls, client: { from(table) { const call = { table, filters: [] }; calls.push(call); return q(call); } } };
}

test('saveDraft inserts once, then updates only the version it saw', async () => {
  const row = { id: 'd1', version: 2 };
  const first = fakeClient({ data: [row], error: null });
  const created = await sc.saveDraft(first.client, 'owner', 'p1', null, draft());
  assert.equal(created.ok, true);
  assert.equal(first.calls[0].op, 'insert');
  assert.equal(first.calls[0].payload.project_id, 'p1');
  assert.equal(first.calls[0].payload.user_id, 'owner');

  const second = fakeClient({ data: [row], error: null });
  await sc.saveDraft(second.client, 'owner', 'p1', { id: 'd1', version: 1 }, draft());
  assert.deepEqual(plain(second.calls[0].filters), [['id', 'd1'], ['user_id', 'owner'], ['version', 1]]);
  assert.equal(second.calls[0].payload.version, undefined, 'the database owns the version');

  const stale = await sc.saveDraft(fakeClient({ data: [], error: null }).client, 'owner', 'p1', { id: 'd1', version: 1 }, draft());
  assert.equal(stale.reason, 'conflict');
  const taken = await sc.saveDraft(fakeClient({ data: null, error: { code: '23505', message: 'project_showcases_slug_key' } }).client, 'owner', 'p1', null, draft());
  assert.match(taken.message, /already uses that address/);
  const invalid = fakeClient({ data: [row], error: null });
  assert.equal((await sc.saveDraft(invalid.client, 'owner', 'p1', null, draft({ slug: 'cha-restaurant' }))).reason, 'invalid');
  assert.equal(invalid.calls.length, 0, 'invalid drafts never reach the database');
});

test('public pages read only the whitelisted columns, anonymously and uncached', () => {
  const lib = read('src/lib/showcase-public.ts');
  assert.match(lib, /select\(PUBLIC_COLUMNS\)/);
  assert.doesNotMatch(lib, /select\(\s*["'`]\*/);
  assert.doesNotMatch(lib, /next\/headers|cookies\(|supabase\/server/, 'no visitor session is involved');
  assert.match(lib, /await connection\(\)/);
  assert.match(lib, /cache: "no-store"/);
  assert.equal(/PUBLIC_COLUMNS = "([^"]+)"/.exec(read('src/lib/showcase.ts'))[1].includes('user_id'), false);
  const sql = read('supabase/013_showcases.sql');
  const anonGrant = /grant select \(([^)]+)\) on public\.showcases to anon/.exec(sql)[1].split(',').map((s) => s.trim());
  assert.deepEqual(anonGrant, /PUBLIC_COLUMNS = "([^"]+)"/.exec(read('src/lib/showcase.ts'))[1].split(',').map((s) => s.trim()));
  for (const page of ['src/app/projects/page.tsx', 'src/app/projects/[slug]/page.tsx']) {
    assert.doesNotMatch(read(page), /supabase\/server|from\("project/, `${page} must not read private tables`);
  }
});

test('showcase routes check the origin and the owner before anything else', () => {
  for (const name of ['publish', 'unpublish', 'cleanup']) {
    const src = read(`src/app/api/showcase/${name}/route.ts`);
    const body = src.slice(src.indexOf('export async function POST'));
    assert.ok(body.indexOf('sameOrigin(request)') < body.indexOf('routeOwner()'), `${name}: origin first`);
    assert.ok(body.indexOf('routeOwner()') < body.indexOf('request.json()') || !body.includes('request.json()'), `${name}: owner before input`);
    assert.doesNotMatch(src, /export async function (GET|PUT|DELETE)/);
  }
});
