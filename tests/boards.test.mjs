// Phase 7C: board layout helpers (src/lib/boards.ts).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';

function load(file) {
  const source = ts.transpileModule(fs.readFileSync(path.join(import.meta.dirname, '..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: () => ({}), Math, Number });
  return exports;
}
const b = load('src/lib/boards.ts');
const plain = (v) => JSON.parse(JSON.stringify(v));

test('cards snap to the 20 px grid and stay on the board', () => {
  assert.deepEqual(plain(b.placeCard(31, 49)), { x: 40, y: 40 });
  assert.deepEqual(plain(b.placeCard(-500, -10)), { x: 0, y: 0 });
  assert.deepEqual(plain(b.placeCard(99999, 99999)), { x: 2400 - 220, y: 1600 - 160 });
  assert.deepEqual(plain(b.placeCard(Number.NaN, 30)), { x: 0, y: 40 });
});

test('a new card goes to a free spot, near the requested point when it is free', () => {
  assert.deepEqual(plain(b.freeSpot([])), { x: 40, y: 40 });
  assert.deepEqual(plain(b.freeSpot([], { x: 600, y: 400 })), { x: 500, y: 320 });
  const taken = [{ x: 40, y: 40, w: 220, h: 160 }];
  const spot = b.freeSpot(taken);
  assert.ok(spot.x >= 40 + 220 + 20 || spot.y >= 40 + 160 + 20, JSON.stringify(spot));
  // Near an occupied point it moves elsewhere rather than stacking.
  const near = b.freeSpot(taken, { x: 150, y: 120 });
  assert.notDeepEqual(plain(near), { x: 40, y: 40 });
});

test('connections meet card edges, not centres', () => {
  const card = { x: 0, y: 0, w: 200, h: 100 };
  const near = (p, x, y) => assert.ok(Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6, JSON.stringify(p));
  near(b.edgePoint(card, 1000, 50), 200, 50);   // straight right
  near(b.edgePoint(card, 100, -1000), 100, 0);  // straight up
  near(b.edgePoint(card, 100, 50), 100, 50);    // target at the centre
  const corner = b.edgePoint(card, 400, 150);   // shallow diagonal: leaves through the right edge
  assert.ok(Math.abs(corner.x - 200) < 1e-6);
  assert.ok(corner.y > 50 && corner.y < 100);
});

test('each linkable kind maps to its own column', () => {
  assert.deepEqual(plain(b.LINK_COLUMN), { file: 'file_id', drawing: 'drawing_id', unit: 'unit_id', character: 'character_id', entry: 'entry_id' });
  assert.deepEqual(plain(b.CARD_KINDS.map((k) => k.value)), ['note', 'file', 'drawing', 'unit', 'character', 'entry']);
});
