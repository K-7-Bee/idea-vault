import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Phase 4D: the Journal's content rules, how the app and migration 016 agree, and the read paths
// that keep private projects and drafts off the public site.
const root = path.join(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const source = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  cache.set(file, exports);
  const require = (name) => name.startsWith('./') ? load(path.join(path.dirname(file), `${name.slice(2)}.ts`).replace(/\\/g, '/')) : {};
  vm.runInNewContext(source, { exports, require, URL, crypto });
  return exports;
}
const j = load('src/lib/journal.ts');
const sql = read('supabase/016_journal.sql');
const plain = (v) => JSON.parse(JSON.stringify(v));
const ID = 'aaaaaaaa-0000-4000-8000-000000000001';

test('addresses: lowercase words and single dashes, 3 to 60 characters; suggested from the title', () => {
  for (const ok of ['solar-charger-notes', 'abc', 'a1-b2']) assert.ok(j.slugOk(ok), ok);
  for (const bad of ['ab', 'Solar', 'two--dashes', '-lead', 'trail-', 'with space', 'a'.repeat(61), '../x']) assert.ok(!j.slugOk(bad), bad);
  assert.equal(j.slugFrom('  Why my fuse blew (twice)! '), 'why-my-fuse-blew-twice');
  assert.equal(j.slugFrom('Ünïcode Résumé'), 'unicode-resume');
  assert.ok(j.slugFrom('x'.repeat(100)).length <= 60);
});

test('normalizeEdit trims, caps, and keeps only safe references', () => {
  const e = j.normalizeEdit({
    slug: ' My-Note ', title: '  A   title ', summary: ' s ', body: ' one \r\n\r\n\r\n two \n\n' + Array.from({ length: 30 }, (_, k) => `p${k}`).join('\n\n'),
    entry_date: ' March 2026 ', project_id: 'not-a-uuid', case_study: 'unknown', extra: 'dropped',
    images: [{ file: ID, alt: ' bench ' }, { file: ID, alt: 'duplicate' }, { file: '../x', alt: 'bad' }, { file: 'cccccccc-0000-4000-8000-000000000001.jpg', alt: 'public copy' },
      ...Array.from({ length: 5 }, (_, k) => ({ file: `aaaaaaaa-0000-4000-8000-00000000001${k}`, alt: 'x' }))],
  });
  assert.equal(e.slug, 'my-note');
  assert.equal(e.title, 'A title');
  assert.equal(j.paragraphs(e.body).length, j.JOURNAL_LIMITS.paragraphs);
  assert.deepEqual(plain(j.paragraphs(e.body).slice(0, 2)), ['one', 'two']);
  assert.equal(e.project_id, null);
  assert.equal(e.case_study, '');
  assert.equal(e.extra, undefined);
  assert.equal(e.images.length, j.JOURNAL_LIMITS.images);
  assert.deepEqual(plain(e.images.slice(0, 2)), [{ file: ID, alt: 'bench' }, { file: 'cccccccc-0000-4000-8000-000000000001.jpg', alt: 'public copy' }]);
  const both = j.normalizeEdit({ project_id: ID, case_study: 'idea-vault' });
  assert.equal(both.case_study, 'idea-vault');
  assert.equal(both.project_id, null, 'a case study wins; never both');
});

test('publish problems: address, title, text, image descriptions, missing files, no HTML', () => {
  const good = j.normalizeEdit({ slug: 'first-note', title: 'First', body: 'Text.', images: [{ file: ID, alt: 'Bench' }] });
  assert.deepEqual(plain(j.publishProblems(good, new Set([ID]))), []);
  assert.ok(j.publishProblems(j.normalizeEdit({ title: 'x', body: 'y' })).some((p) => /address/.test(p)));
  assert.ok(j.publishProblems(j.normalizeEdit({ slug: 'abc', body: 'y' })).some((p) => /title/.test(p)));
  assert.ok(j.publishProblems(j.normalizeEdit({ slug: 'abc', title: 'x' })).some((p) => /text/.test(p)));
  assert.ok(j.publishProblems({ ...good, images: [{ file: ID, alt: '' }] }, new Set([ID])).some((p) => /Describe image 1/.test(p)));
  assert.ok(j.publishProblems(good, new Set()).some((p) => /no longer in your library/.test(p)));
  for (const field of ['title', 'summary', 'body', 'entry_date']) {
    assert.ok(j.publishProblems({ ...good, [field]: 'x <script>' }, new Set([ID])).some((p) => /HTML/.test(p)), field);
  }
});

test('the app and migration 016 agree on limits, case studies and image rules', () => {
  const L = j.JOURNAL_LIMITS;
  for (const [column, max] of [['title', L.title], ['summary', L.summary], ['body', L.body], ['entry_date', L.date]]) {
    assert.ok(sql.includes(`char_length(${column}) <= ${max}`), `${column} ${max}`);
  }
  assert.ok(sql.includes(`jsonb_array_length(v) <= ${L.images}`), 'image count');
  assert.ok(sql.includes(`char_length(i ->> 'alt') > ${L.alt}`), 'image description length');
  assert.ok(sql.includes(`case_study in ('', ${j.CASE_STUDIES.map((c) => `'${c.slug}'`).join(', ')})`), 'the same three case studies');
  assert.ok(sql.includes("'^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60"), 'slug rule');
});

test('visitors read only through journal_public(), at request time; project ids never leave the database', () => {
  const pub = read('src/lib/journal-public.ts');
  assert.ok(!/from\("journal_(published|entries)"\)/.test(pub), 'no direct table reads for visitors');
  assert.equal((pub.match(/await connection\(\)/g) ?? []).length, 2, 'list and entry read per request');
  assert.ok(/cacheTag\(JOURNAL_TAG\)/.test(pub) && /cacheLife\("max"\)/.test(pub), 'only the homepage count is cached, by tag');
  const fn = sql.slice(sql.indexOf('create or replace function public.journal_public'), sql.indexOf('revoke all on function public.journal_public'));
  assert.ok(!/project_id\s*,|j\.project_id\s*,|j\.user_id\s*,/.test(fn.split('from public.journal_published')[0]), 'no ids in the returned columns');
  assert.ok(fn.includes('left join public.showcases s on s.project_id = j.project_id'), 'a project is named only through its live showcase');
  for (const route of ['src/app/api/journal/publish/route.ts', 'src/app/api/journal/unpublish/route.ts']) {
    const src = read(route);
    assert.ok(src.includes('if (!sameOrigin(request)) return json({ error: "origin" }, 403);') && src.includes('routeOwner()'), route);
    assert.ok(src.includes('revalidateTag(JOURNAL_TAG, "max")') && !src.includes('expire: 0'), `${route} refreshes the homepage safely`);
  }
});

test('public copies stay while the profile or any published entry uses them', () => {
  const src = read('src/lib/public-files.ts');
  assert.ok(src.includes('supabase.from("journal_published").select("images")'));
  assert.ok(/const used = new Set\(\[content\?\.resume\?\.file, content\?\.photo\?\.file, \.\.\.journalFiles\]/.test(src));
});
