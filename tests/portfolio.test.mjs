import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('public homepage no longer mounts the retired demos', () => {
  const home = read('src/app/page.tsx');
  for (const retired of ['./portfolio/companion"', './portfolio/motor-explorer"', './portfolio/ohm-lab"', './portfolio/hero"', '"three"']) {
    assert.ok(!home.includes(retired), `homepage still imports ${retired}`);
  }
  for (const archived of ['companion', 'hero', 'motor-explorer', 'ohm-lab']) {
    assert.ok(fs.existsSync(path.join(root, `src/app/portfolio/_archive/${archived}.tsx`)), `${archived} was not archived`);
  }
});

test('homepage navigation has no empty Journal or unsupplied resume link', () => {
  const home = read('src/app/page.tsx');
  assert.ok(!/label: "Journal"/.test(home));
  assert.ok(!/href=[^>]*r[eé]sum[eé]/i.test(home), 'no résumé has been supplied');
  for (const anchor of ['about', 'experience', 'projects', 'contact']) {
    assert.ok(home.includes(`href: "#${anchor}"`), `missing nav link ${anchor}`);
    assert.ok(home.includes(`id="${anchor}"`), `nav link ${anchor} has no target section`);
  }
});

test('public pages do not link to removed sections', () => {
  for (const file of ['src/app/page.tsx', 'src/app/projects/layout.tsx', 'src/app/projects/page.tsx', 'src/app/projects/[slug]/page.tsx']) {
    assert.ok(!read(file).includes('#lab'), `${file} links to the removed lab section`);
  }
});

test('public case study does not claim the private vault page is cached offline', () => {
  assert.ok(!read('src/lib/projects.ts').includes('caches the vault page'));
});
