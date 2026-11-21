import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';

// Phase 4B: the public profile (homepage text): seed, validation, publish rules and the read path.
const root = path.join(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
function load(file) {
  const source = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  let n = 0;
  vm.runInNewContext(source, { exports, require: () => ({}), URL, crypto: { randomUUID: () => `uuid-${++n}` } });
  return exports;
}
const pf = load('src/lib/profile.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));
const seed = () => plain(pf.SEED);
const sql = read('supabase/014_profile.sql');

test('the seed is already clean and publishable, so day one renders exactly the old text', () => {
  assert.deepEqual(plain(pf.normalize(pf.SEED)), seed());
  assert.deepEqual(plain(pf.publishProblems(pf.SEED)), []);
  assert.equal(pf.SEED.certificates.length, 0, 'no certificate has been supplied');
  assert.ok(pf.SEED.timeline.every((e) => !e.tools.length && !e.responsibilities.length && !e.outcomes.length), 'no internship details have been supplied');
});

test('the seed carries the homepage text that page.tsx had before 4B', () => {
  // Checked against the actual pre-4B source in git, so a typo in the move fails here.
  const old = execFileSync('git', ['show', 'ac3e2f9:src/app/page.tsx'], { cwd: root, encoding: 'utf8' });
  const c = pf.SEED;
  const strings = [c.name, c.hero.eyebrow, c.hero.accent, c.hero.headline, ...c.highlights.flatMap((h) => [h.title, h.detail]),
    ...c.timeline.flatMap((e) => [e.when, e.title, e.detail, e.where]), ...c.focus, ...c.links.flatMap((l) => [l.label, l.href]),
    c.contact.email.user, c.contact.email.domain, c.contact.text];
  const source = old.replace(/&apos;/g, "'").replace(/\s+/g, ' ');
  for (const s of strings) assert.ok(source.includes(s), `not in the old homepage: ${s}`);
  for (const p of [...c.about.paragraphs, c.about.heading, c.contact.heading]) assert.ok(source.includes(p), `not in the old homepage: ${p}`);
  assert.ok(source.includes("an engineering science student at Jeonbuk National University exploring circuits, electrical systems and practical software through real projects."));
});

test('normalize trims, caps, drops unknown fields and never throws', () => {
  for (const bad of [null, 42, 'x', [], { hero: 'no' }]) assert.doesNotThrow(() => pf.normalize(bad));
  const c = pf.normalize({
    name: '  Ada   Lovelace ', secret: 'private notes', hero: { eyebrow: ' a ', accent: '', headline: 'Hi', intro: ' Line one\r\n\r\nLine two ', extra: 1 },
    highlights: [{ icon: 'rocket', title: 'T', detail: '' }, { icon: 'cap', title: '' }, ...Array.from({ length: 6 }, (_, i) => ({ icon: 'cap', title: `H${i}` }))],
    timeline: [{ kind: 'spy', title: 'Intern', tools: [' C ', '', 'Python'], responsibilities: ['  a  ', ''], outcomes: 'nope' }, { title: '' }],
    focus: ['x', '', 'y'], links: [{ label: '', href: '' }, { label: 'GH', href: ' https://github.com/a ' }],
    contact: { email: { user: 'me', domain: 'EXAMPLE.com' } },
  });
  assert.equal(c.name, 'Ada Lovelace');
  assert.equal(c.secret, undefined);
  assert.equal(c.hero.extra, undefined);
  assert.equal(c.hero.intro, 'Line one\n\nLine two');
  assert.equal(c.highlights[0].icon, 'check', 'unknown icon replaced');
  assert.equal(c.highlights.length, pf.LIMITS.highlights);
  assert.ok(c.highlights.every((h) => h.title), 'untitled highlights dropped');
  assert.equal(c.timeline.length, 1);
  assert.equal(c.timeline[0].kind, 'work', 'unknown kind replaced');
  assert.deepEqual(plain(c.timeline[0].tools), ['C', 'Python']);
  assert.deepEqual(plain(c.timeline[0].responsibilities), ['a']);
  assert.deepEqual(plain(c.timeline[0].outcomes), []);
  assert.deepEqual(plain(c.focus), ['x', 'y']);
  assert.deepEqual(plain(c.links), [{ label: 'GH', href: 'https://github.com/a' }]);
  assert.equal(c.contact.email.domain, 'example.com');
  assert.deepEqual(plain(c.certificates), []);
});

test('unsafe links, HTML-like text and bad email addresses are refused for publishing', () => {
  const with_ = (change) => pf.publishProblems(pf.normalize({ ...seed(), ...change }));
  for (const href of ['javascript:alert(1)', 'data:text/html,hi', 'http://example.com', 'https://', 'https://exa mple.com', '//example.com']) {
    assert.ok(with_({ links: [{ label: 'X', href }] }).length > 0, `link allowed: ${href}`);
    assert.ok(with_({ certificates: [{ name: 'C', issuer: '', when: '', href }] }).length > 0, `certificate link allowed: ${href}`);
  }
  assert.deepEqual(plain(with_({ certificates: [{ name: 'C', issuer: 'I', when: '2024', href: '' }] })), []);
  // A certificate name may be longer than a link label (regression: its link was checked as a label).
  assert.deepEqual(plain(with_({ certificates: [{ name: 'A certificate with a fairly long name for wrapping', issuer: '', when: '', href: 'https://example.com/c' }] })), []);
  assert.ok(with_({ about: { heading: 'Hi', paragraphs: ['<script>alert(1)</script>'] } }).some((p) => /HTML/.test(p)));
  assert.ok(with_({ focus: ['<img src=x onerror=alert(1)>'] }).some((p) => /HTML/.test(p)));
  assert.deepEqual(plain(with_({ focus: ['C++ < Rust? 3 < 4'] })), [], 'a plain less-than sign is fine');
  for (const email of [{ user: 'a b', domain: 'x.com' }, { user: 'me', domain: 'localhost' }, { user: '', domain: 'x.com' }]) {
    assert.ok(with_({ contact: { ...seed().contact, email } }).length > 0, `email allowed: ${JSON.stringify(email)}`);
  }
  assert.deepEqual(plain(with_({ contact: { ...seed().contact, email: { user: '', domain: '' } } })), [], 'no email is allowed');
  assert.ok(with_({ name: '' }).length > 0);
  assert.ok(with_({ hero: { ...seed().hero, accent: '', headline: '' } }).length > 0);
});

test('splitEmail and changedSections', () => {
  assert.deepEqual(plain(pf.splitEmail(' me@Example.COM ')), { user: 'me', domain: 'example.com' });
  assert.deepEqual(plain(pf.splitEmail('')), { user: '', domain: '' });
  assert.equal(pf.changedSections(pf.SEED, null).length, pf.SECTIONS.length);
  assert.deepEqual(plain(pf.changedSections(pf.SEED, pf.SEED)), []);
  const next = { ...seed(), focus: ['Robotics'], links: [] };
  assert.deepEqual(plain(pf.changedSections(next, pf.SEED)), ['Current focus', 'Contact and links']);
});

test('the migration enforces the same limits, owner, columns and checks as the app', () => {
  const L = pf.LIMITS;
  assert.match(sql, new RegExp(`jsonb_array_length\\(c -> 'highlights'\\) > ${L.highlights}`));
  assert.match(sql, new RegExp(`jsonb_array_length\\(c -> 'timeline'\\) > ${L.timeline}`));
  assert.match(sql, new RegExp(`jsonb_array_length\\(c -> 'certificates'\\) > ${L.certificates}`));
  assert.match(sql, new RegExp(`jsonb_array_length\\(c -> 'links'\\) > ${L.links}`));
  assert.match(sql, new RegExp(`profile_list_ok\\(c -> 'focus', ${L.focus}, ${L.short}\\)`));
  assert.match(sql, new RegExp(`profile_list_ok\\(x -> 'paragraphs', ${L.paragraphs}, ${L.paragraph}\\)`));
  assert.match(sql, new RegExp(`profile_list_ok\\(e -> 'tools', ${L.tools}, ${L.tool}\\)`));
  for (const icon of Object.keys(pf.ICONS)) assert.match(sql, new RegExp(`'${icon}'`));
  // Visitors read exactly the public columns, and never the owner id.
  const grant = sql.match(/grant select \(([^)]+)\) on public\.profile_published to anon;/);
  assert.ok(grant, 'anon column grant');
  assert.deepEqual(grant[1].split(',').map((s) => s.trim()).sort(), pf.PUBLIC_COLUMNS.split(',').map((s) => s.trim()).sort());
  assert.ok(!/grant[^;]*(insert|update|delete)[^;]*profile_published/i.test(sql), 'nobody writes the public copy directly');
  assert.ok(!/grant[^;]*(insert|update|delete)[^;]*profile_versions/i.test(sql), 'history is append-only through publish_profile');
  assert.match(sql, /site_owner o where o\.user_id = uid/, 'only the site owner may publish');
  assert.match(sql, /d\.version <> p_draft_version/, 'publishes only the confirmed draft version');
  assert.match(sql, /revoke all on function public\.publish_profile\(integer\) from public, anon;/);
});

test('the homepage stays static and is refreshed only by publishing', () => {
  const reader = read('src/lib/profile-public.ts');
  assert.match(reader, /"use cache";/);
  assert.match(reader, /cacheTag\(PROFILE_TAG\)/);
  assert.match(reader, /select\(PUBLIC_COLUMNS\)/);
  assert.match(reader, /throw new Error/, 'read errors are thrown, never replaced by the seed');
  assert.ok(!/SEED/.test(reader));
  const page = read('src/app/page.tsx');
  assert.ok(!/connection\(|cookies\(|headers\(|Suspense/.test(page), 'nothing request-time on the homepage');
  assert.match(page, /published\?\.content \?\? SEED/);
  const route = read('src/app/api/profile/publish/route.ts');
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(route, /routeOwner\(\)/);
  assert.match(route, /revalidateTag\(PROFILE_TAG, "max"\)/, 'a failed rebuild must keep the last good page');
  assert.ok(!/expire: 0/.test(route.replace(/\/\/.*$/gm, '')), '{ expire: 0 } served the build-time page on a failed rebuild');
  assert.ok(route.indexOf('rpc("publish_profile"') < route.indexOf('revalidateTag('), 'cache expired only after the database write');
});

test('the preview renders the same component as the public homepage, behind the owner check', () => {
  const preview = read('src/app/vault/portfolio/profile/preview/page.tsx');
  assert.match(preview, /verifiedOwner\(supabase\)/);
  assert.match(preview, /<HomeView content=\{d\.content\} \/>/);
  assert.match(read('src/app/page.tsx'), /<HomeView content=\{published\?\.content \?\? SEED\} publishedAt=\{published\?\.published_at\} \/>/);
});
