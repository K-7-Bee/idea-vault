import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const root = path.join(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function load(file) {
  const source = ts.transpileModule(read(file),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports });
  return exports;
}

const startPage = load('src/lib/start-page.ts');

test('start page searches Google and greets by local hour', () => {
  assert.equal(startPage.SEARCH_URL, 'https://www.google.com/search');
  assert.equal(startPage.greetingFor(4), 'Good night');
  assert.equal(startPage.greetingFor(5), 'Good morning');
  assert.equal(startPage.greetingFor(12), 'Good afternoon');
  assert.equal(startPage.greetingFor(17), 'Good evening');
  assert.equal(startPage.greetingFor(22), 'Good night');
});

test('whitespace-only searches count as blank; real queries do not', () => {
  assert.equal(startPage.isBlankQuery(''), true);
  assert.equal(startPage.isBlankQuery('   '), true);
  assert.equal(startPage.isBlankQuery('\t\n '), true);
  assert.equal(startPage.isBlankQuery(' ohm & law '), false);
});

test('search form is a GET form to the search URL with a required q field', () => {
  const form = read('src/app/start/search-form.tsx');
  assert.match(form, /action=\{SEARCH_URL\}/);
  assert.match(form, /method="get"/);
  assert.match(form, /name="q"/);
  assert.match(form, /\brequired\b/);
  assert.match(form, /isBlankQuery\(input\.value\)/);
});
