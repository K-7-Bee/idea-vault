import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

// Phase 4C: the files library (type checks, de-duplication), the metadata clean-up for every public
// image, the résumé and photo profile fields, and the rules the SQL migration must agree with.
const root = path.join(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const realRequire = createRequire(path.join(root, 'package.json'));
const sharp = realRequire('sharp');

// Loads a src/lib TypeScript module with its relative imports (and sharp) resolved for real.
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const source = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  cache.set(file, exports);
  const require = (name) => name.startsWith('./') ? load(path.join(path.dirname(file), `${name.slice(2)}.ts`).replace(/\\/g, '/'))
    : name === 'sharp' ? sharp : {};
  vm.runInNewContext(source, { exports, require, URL, crypto, Buffer, Uint8Array, TextEncoder });
  return exports;
}
const lib = load('src/lib/library.ts');
const pf = load('src/lib/profile.ts');
const pub = load('src/lib/public-files.ts');
const sql = read('supabase/015_library.sql');
const bytes = (...values) => new Uint8Array(values);
const ascii = (text) => new Uint8Array(Buffer.from(text, 'latin1'));

test('files are recognised by their bytes, not their names', () => {
  assert.equal(lib.sniffFile(ascii('%PDF-1.7\n')), 'application/pdf');
  assert.equal(lib.sniffFile(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'image/png');
  assert.equal(lib.sniffFile(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg');
  assert.equal(lib.sniffFile(ascii('RIFF\0\0\0\0WEBPVP8 ')), 'image/webp');
  for (const bad of [ascii('MZ\x90\0'), ascii('<html>'), ascii('PDF-'), ascii('GIF89a'), new Uint8Array()]) assert.equal(lib.sniffFile(bad), null);
});

test('uploads are refused when empty, too large, of another type or the wrong kind', () => {
  assert.match(lib.uploadProblem(new Uint8Array()), /empty/);
  const big = new Uint8Array(lib.LIBRARY_MAX + 1); big.set(ascii('%PDF-'));
  assert.match(lib.uploadProblem(big), /10 MB/);
  assert.match(lib.uploadProblem(ascii('<script>')), /Only PDF, JPEG, PNG or WebP/);
  assert.match(lib.uploadProblem(bytes(0xff, 0xd8, 0xff, 0xe0), 'pdf'), /Choose a PDF/);
  assert.match(lib.uploadProblem(ascii('%PDF-1.4'), 'image'), /Choose a JPEG, PNG or WebP/);
  assert.equal(lib.uploadProblem(ascii('%PDF-1.4'), 'pdf'), null);
  assert.equal(lib.displayName('C:\\Users\\me\\CV\u0007.pdf'), 'CV.pdf');
  assert.equal(lib.displayName('   '), 'Untitled file');
});

test('the same bytes give the same hash (how duplicates are found)', async () => {
  const a = await lib.sha256Hex(ascii('%PDF-1.7 same'));
  assert.equal(a, await lib.sha256Hex(ascii('%PDF-1.7 same')));
  assert.notEqual(a, await lib.sha256Hex(ascii('%PDF-1.7 other')));
  assert.match(a, /^[0-9a-f]{64}$/);
});

async function noMetadata(out, label) {
  const m = await sharp(Buffer.from(out)).metadata();
  assert.equal(m.exif, undefined, `${label}: EXIF removed`);
  assert.equal(m.xmp, undefined, `${label}: XMP removed`);
  assert.equal(m.iptc, undefined, `${label}: IPTC removed`);
  assert.equal(m.icc, undefined, `${label}: ICC profile removed`);
  assert.ok(!Buffer.from(out).includes('Ada Secret'), `${label}: no hidden text left in the bytes`);
  return m;
}
const XMP = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description>Ada Secret 35.82N</rdf:Description></rdf:RDF></x:xmpmeta>';
const canvas = (width = 40, height = 20) => sharp({ create: { width, height, channels: 3, background: '#c33' } });

test('a phone-style JPEG loses GPS, camera details and colour profile, and comes out upright', async () => {
  const input = await canvas().jpeg()
    .withExif({ IFD0: { Artist: 'Ada Secret', Make: 'PhoneCo' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '35/1 49/1 0/1' } })
    .withIccProfile('p3').withMetadata({ orientation: 6 }).toBuffer();
  const before = await sharp(input).metadata();
  assert.ok(before.exif && before.icc && before.orientation === 6, 'fixture really carries metadata');
  const out = await pub.cleanImage(new Uint8Array(input), 'image/jpeg');
  const m = await noMetadata(out, 'JPEG');
  assert.equal(m.format, 'jpeg');
  assert.equal(m.orientation, undefined);
  assert.deepEqual([m.width, m.height], [20, 40], 'rotated by its orientation tag');
});

test('PNG and WebP lose XMP and EXIF too, and keep their format', async () => {
  const png = await canvas().png().withXmp(XMP).toBuffer();
  assert.ok((await sharp(png).metadata()).xmp, 'fixture PNG carries XMP');
  assert.equal((await noMetadata(await pub.cleanImage(new Uint8Array(png), 'image/png'), 'PNG')).format, 'png');
  const webp = await canvas().webp().withXmp(XMP).withExif({ IFD0: { Artist: 'Ada Secret' } }).toBuffer();
  assert.ok((await sharp(webp).metadata()).exif, 'fixture WebP carries EXIF');
  assert.equal((await noMetadata(await pub.cleanImage(new Uint8Array(webp), 'image/webp'), 'WebP')).format, 'webp');
});

test('large images are scaled to 2400 px on the long edge; small ones are not enlarged', async () => {
  const big = await canvas(3000, 1500).jpeg().toBuffer();
  const m = await sharp(Buffer.from(await pub.cleanImage(new Uint8Array(big), 'image/jpeg'))).metadata();
  assert.deepEqual([m.width, m.height], [2400, 1200]);
  const small = await sharp(Buffer.from(await pub.cleanImage(new Uint8Array(await canvas(30, 10).png().toBuffer()), 'image/png'))).metadata();
  assert.deepEqual([small.width, small.height], [30, 10]);
});

test('bytes that only look like an image are refused, not published', async () => {
  await assert.rejects(pub.cleanImage(bytes(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3), 'image/jpeg'), (e) => e instanceof pub.PublicFileError && /couldn't be read/.test(e.message));
});

test('showcase images (Phase 4A) go through the same clean-up before upload', () => {
  const src = read('src/lib/showcase-images.ts');
  const clean = src.indexOf('await cleanImage(bytes');
  const upload = src.indexOf('.upload(path, clean');
  assert.ok(clean > 0 && upload > clean, 'copyImage uploads the cleaned bytes, never the original');
  assert.ok(!/\.upload\(path, bytes/.test(src));
});

test('résumé and photo fields: empty by default, checked before publishing, ids and names only', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(pf.SEED.resume)), { file: '', name: '' });
  assert.deepEqual(JSON.parse(JSON.stringify(pf.SEED.photo)), { file: '', alt: '' });
  const id = 'aaaaaaaa-0000-4000-8000-000000000001';
  const c = pf.normalize({ ...pf.SEED, resume: { file: ` ${id} `, name: ' Ada-Resume.pdf ' }, photo: { file: '../../etc/passwd', alt: 'x' } });
  assert.equal(c.resume.file, id);
  assert.equal(c.resume.name, 'Ada-Resume.pdf');
  assert.equal(c.photo.file, '', 'anything that is not a library id or public copy name is dropped');
  assert.equal(pf.normalize({ ...pf.SEED, photo: { file: 'cccccccc-0000-4000-8000-000000000002.jpg', alt: 'Me' } }).photo.file, 'cccccccc-0000-4000-8000-000000000002.jpg');
  assert.deepEqual(JSON.parse(JSON.stringify(pf.filesUsed(c))), [{ part: 'resume', id }]);

  const withName = (name) => pf.publishProblems(pf.normalize({ ...pf.SEED, resume: { file: id, name } }));
  assert.deepEqual(JSON.parse(JSON.stringify(withName('MD-Kaushik-Kamal-Resume.pdf'))), []);
  for (const bad of ['', 'resume.exe', 'résumé.pdf', '../x.pdf', '.pdf']) assert.ok(withName(bad).some((p) => /download name/.test(p)), bad);
  assert.ok(pf.publishProblems(pf.normalize({ ...pf.SEED, photo: { file: id, alt: '' } })).some((p) => /Describe the photo/.test(p)));
  assert.deepEqual(JSON.parse(JSON.stringify(pf.publishProblems(pf.normalize({ ...pf.SEED, resume: { file: '', name: 'anything' } })))), [], 'a name without a file is ignored');
  assert.ok(pf.changedSections(pf.normalize({ ...pf.SEED, resume: { file: id, name: 'a.pdf' } }), pf.SEED).includes('Résumé and photo'));
  assert.deepEqual(JSON.parse(JSON.stringify(pf.changedSections(pf.SEED, pf.SEED))), []);
});

test('the app and migration 015 agree on names, types, sizes and buckets', () => {
  assert.ok(sql.includes(String(lib.LIBRARY_MAX)), 'size limit');
  // The same regular expressions, character for character.
  assert.ok(sql.includes(`'${pf.RESUME_NAME.source}'`), 'download-name rule');
  assert.ok(sql.includes(`'${pf.PUBLIC_NAME.source}'`), 'public copy names');
  assert.ok(sql.includes(`'${pf.LIBRARY_ID.source}'`), 'library ids');
  for (const type of Object.keys(lib.LIBRARY_TYPES)) assert.ok(sql.includes(`'${type}'`), type);
  assert.ok(sql.includes(`'${lib.LIBRARY_BUCKET}', '${lib.LIBRARY_BUCKET}', false`), 'library bucket is private');
  assert.ok(sql.includes(`'${lib.PUBLIC_BUCKET}', '${lib.PUBLIC_BUCKET}', true`), 'public copies bucket');
  assert.ok(sql.includes(`, ${pf.PHOTO_ALT_MAX}, true)`), 'photo description limit');
});

test('the résumé address and homepage never expose library ids or private links', () => {
  const route = read('src/app/resume/route.ts');
  assert.ok(route.includes('await connection()'), '/resume runs per request, so it follows the homepage cache');
  assert.ok(/Cache-Control": "no-store"/.test(route));
  const home = read('src/app/page.tsx');
  assert.ok(home.includes('"/resume"') && home.includes('publicFileUrl(content.photo.file)'));
  assert.ok(!/createSignedUrl|LIBRARY_BUCKET/.test(home), 'the public page never signs library links');
  const url = load('src/lib/profile-public.ts');
  assert.equal(typeof url.publicFileUrl, 'function');
});
