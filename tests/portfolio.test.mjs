import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Phase 4B: the homepage markup lives in home-view.tsx and its text in the profile seed.
const homeSource = () => read('src/app/page.tsx') + read('src/app/portfolio/home-view.tsx');

test('public homepage no longer mounts the retired demos', () => {
  const home = homeSource();
  for (const retired of ['./portfolio/companion"', './portfolio/motor-explorer"', './portfolio/ohm-lab"', './portfolio/hero"', '"three"']) {
    assert.ok(!home.includes(retired), `homepage still imports ${retired}`);
  }
  for (const archived of ['companion', 'hero', 'motor-explorer', 'ohm-lab']) {
    assert.ok(fs.existsSync(path.join(root, `src/app/portfolio/_archive/${archived}.tsx`)), `${archived} was not archived`);
  }
});

test('homepage navigation shows Journal and résumé links only once something is published', () => {
  const home = homeSource();
  // Phase 4D: the Journal link exists only while at least one entry is published.
  assert.ok(home.includes('const journalLink = journalCount > 0 ? [{ label: "Journal", href: "/journal" }] : [];'));
  assert.equal((home.match(/label: "Journal"/g) ?? []).length, 1, 'no other, unconditional Journal link');
  // Phase 4C: no hard-coded résumé address; the link exists only when the profile has a résumé file.
  assert.ok(!/href=["'][^"']*r[eé]sum[eé]/i.test(home), 'no fixed résumé link in the markup');
  const view = fs.readFileSync(path.join(root, 'src/app/portfolio/home-view.tsx'), 'utf8');
  assert.ok(view.includes('const resumeHref = c.resume.file ? media.resumeHref : undefined;'));
  assert.equal((view.match(/href=\{resumeHref\}/g) ?? []).length, (view.match(/\{resumeHref && \(/g) ?? []).length, 'every résumé link is guarded');
  for (const anchor of ['about', 'experience', 'projects', 'contact']) {
    assert.ok(home.includes(`href: "#${anchor}"`), `missing nav link ${anchor}`);
    assert.ok(home.includes(`id="${anchor}"`), `nav link ${anchor} has no target section`);
  }
});

test('public pages do not link to removed sections', () => {
  for (const file of ['src/app/page.tsx', 'src/app/portfolio/home-view.tsx', 'src/lib/profile.ts', 'src/app/projects/layout.tsx', 'src/app/projects/page.tsx', 'src/app/projects/[slug]/page.tsx']) {
    assert.ok(!read(file).includes('#lab'), `${file} links to the removed lab section`);
  }
});

test('public case study does not claim the private vault page is cached offline', () => {
  assert.ok(!read('src/lib/projects.ts').includes('caches the vault page'));
});

test('the contact email never appears whole in public source, and three is gone with the motor demo', () => {
  for (const file of ['src/app/page.tsx', 'src/app/portfolio/home-view.tsx', 'src/lib/profile.ts', 'src/app/portfolio/email-link.tsx', 'src/lib/projects.ts',
    'src/app/vault/portfolio/profile/profile-editor.tsx', 'supabase/014_profile.sql']) {
    assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(read(file)), `${file} contains a full email address`);
  }
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies.three, undefined);
  assert.ok(read('src/app/portfolio/_archive/README.md').includes('reinstall'));
});

test('Idea Vault case study reflects the shipped conditional edits and archive', () => {
  const source = read('src/lib/projects.ts');
  assert.ok(!source.includes('More work remains around edits from multiple devices'));
  assert.ok(source.includes('simulated backend'));
});
