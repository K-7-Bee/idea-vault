// Phase 7: the drawing data format (src/lib/drawing/format.ts).
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
  vm.runInNewContext(source, { exports, require: () => ({}), TextEncoder, Uint8Array, Math, JSON, Number });
  return exports;
}
const d = load('src/lib/drawing/format.ts');
const plain = (v) => JSON.parse(JSON.stringify(v));

test('canvas sizes per shape, and for images by their proportions', () => {
  assert.deepEqual(plain(d.canvasFor('16:9')), { w: 1600, h: 900 });
  assert.deepEqual(plain(d.canvasFor('9:16')), { w: 900, h: 1600 });
  assert.deepEqual(plain(d.canvasFor('1:1')), { w: 1200, h: 1200 });
  assert.deepEqual(plain(d.canvasForImage(4000, 3000)), { w: 1600, h: 1200 });
  assert.deepEqual(plain(d.canvasForImage(500, 1000)), { w: 800, h: 1600 });
  assert.deepEqual(plain(d.canvasForImage(0, 10)), { w: 1600, h: 1200 });
});

test('a valid drawing round-trips through JSON and parseDrawing unchanged', () => {
  const data = { v: 1, w: 1600, h: 900, bg: 'd7200000-0000-4000-8000-000000000001', items: [
    { t: 'pen', c: '#dc2626', s: 6, pr: true, p: [10, 10, 400, 50, 60, 800] },
    { t: 'arrow', c: '#2563eb', s: 6, a: [100, 100, 300, 200] },
    { t: 'label', c: '#111827', s: 40, x: 200, y: 300, text: 'Hero enters' },
  ] };
  assert.deepEqual(plain(d.parseDrawing(JSON.parse(JSON.stringify(data)), { w: 1, h: 1 })), data);
});

test('malformed or hostile items are dropped, never rendered', () => {
  const parsed = d.parseDrawing({ v: 1, w: 1600, h: 900, bg: 'javascript:alert(1)', items: [
    { t: 'pen', c: 'red', s: 6, p: [1, 2, 3] },                                   // colour not #rrggbb
    { t: 'pen', c: '#000000', s: 6, p: [1, 2] },                                  // not triples
    { t: 'pen', c: '#000000', s: 6, p: [1, 'x', 3] },                             // not numbers
    { t: 'arrow', c: '#000000', s: 6, a: [1, 2, 3] },                             // three coordinates
    { t: 'label', c: '#000000', s: 40, x: 1, y: 2, text: '   ' },                 // empty text
    { t: 'script', c: '#000000', s: 1 },                                          // unknown kind
    { t: 'label', c: '#000000" onload="x', s: 40, x: 1, y: 2, text: 'a' },        // attribute injection
    { t: 'label', c: '#00AA00', s: 9999, x: 1e9, y: -1e9, text: 'ok\u0000<b>' },  // clamped, kept as text
  ] }, { w: 1600, h: 900 });
  assert.equal(parsed.bg, undefined);
  assert.equal(parsed.items.length, 1);
  assert.deepEqual(plain(parsed.items[0]), { t: 'label', c: '#00aa00', s: 200, x: 3200, y: -900, text: 'ok <b>' });
});

test('missing or broken data falls back to an empty drawing of the given size', () => {
  assert.deepEqual(plain(d.parseDrawing(null, { w: 1600, h: 900 })), { v: 1, w: 1600, h: 900, items: [] });
  assert.deepEqual(plain(d.parseDrawing({ w: 'x', items: 'no' }, { w: 900, h: 1600 })), { v: 1, w: 900, h: 1600, items: [] });
  const many = { items: Array.from({ length: 5000 }, () => ({ t: 'arrow', c: '#000000', s: 2, a: [0, 0, 1, 1] })) };
  assert.equal(d.parseDrawing(many, { w: 10, h: 10 }).items.length, d.LIMITS.items);
});

test('thinning keeps the shape within tolerance and keeps the ends', () => {
  // A straight line of 200 samples collapses to its two ends; a zigzag keeps its corners.
  const line = []; for (let i = 0; i < 200; i++) line.push(i, 2 * i, 500);
  assert.deepEqual(plain(d.thinPoints(line)), [0, 0, 500, 199, 398, 500]);
  const zig = []; for (let i = 0; i <= 8; i++) zig.push(i * 10, i % 2 ? 10 : 0, i * 100);
  assert.equal(d.thinPoints(zig).length, zig.length);
  // A gentle curve: every original point stays within 0.75 px of the thinned polyline.
  const curve = []; for (let i = 0; i < 300; i++) curve.push(i, Math.round(100 * Math.sin(i / 50)), 500);
  const thin = d.thinPoints(curve);
  assert.ok(thin.length < curve.length / 3, `thinned to ${thin.length / 3} points`);
  for (let i = 0; i < curve.length; i += 3) {
    let best = Infinity;
    for (let j = 0; j + 5 < thin.length; j += 3) {
      const [ax, ay, bx, by] = [thin[j], thin[j + 1], thin[j + 3], thin[j + 4]];
      const t = Math.max(0, Math.min(1, ((curve[i] - ax) * (bx - ax) + (curve[i + 1] - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)));
      best = Math.min(best, Math.hypot(curve[i] - (ax + t * (bx - ax)), curve[i + 1] - (ay + t * (by - ay))));
    }
    assert.ok(best <= 0.75 + 1e-9, `point ${i / 3} is ${best} px away`);
  }
});

test('makePen rounds, scales pressure to 0-1000 and rejects bad colours', () => {
  const pen = d.makePen([0.4, 0.6, 0.25, 10.2, 0.4, 1.4, 20, 0, -1], '#2563EB', 6, true);
  assert.deepEqual(plain(pen), { t: 'pen', c: '#2563eb', s: 6, pr: true, p: [0, 1, 250, 10, 0, 1000, 20, 0, 0] });
  assert.equal(d.makePen([1, 1, 0.5], 'blue', 6, false), null);
  assert.equal(d.makePen([], '#000000', 6, false), null);
});

test('the eraser hits strokes, arrows and labels near the pointer only', () => {
  const pen = { t: 'pen', c: '#000000', s: 6, pr: false, p: [0, 0, 500, 100, 0, 500] };
  assert.equal(d.hits(pen, 50, 4, 2), true);
  assert.equal(d.hits(pen, 50, 20, 2), false);
  const dot = { t: 'pen', c: '#000000', s: 6, pr: false, p: [10, 10, 500] };
  assert.equal(d.hits(dot, 13, 13, 2), true);
  const arrow = { t: 'arrow', c: '#000000', s: 4, a: [0, 0, 0, 100] };
  assert.equal(d.hits(arrow, 3, 50, 2), true);
  assert.equal(d.hits(arrow, 30, 50, 2), false);
  const label = { t: 'label', c: '#000000', s: 40, x: 100, y: 100, text: 'Door' };
  assert.equal(d.hits(label, 120, 80, 5), true);
  assert.equal(d.hits(label, 400, 80, 5), false);
});

test('size states warn before the limit and stop at it', () => {
  const small = d.emptyDrawing({ w: 1600, h: 900 });
  assert.equal(d.sizeState(small), 'ok');
  const points = Array.from({ length: 6000 * 3 }, (_, i) => (i % 3 === 2 ? 1000 : 1599));
  const pen = { t: 'pen', c: '#000000', s: 6, pr: true, p: points };
  const warn = { ...small, items: Array.from({ length: 18 }, () => pen) };
  assert.equal(d.sizeState(warn), 'warn');
  const full = { ...small, items: Array.from({ length: 22 }, () => pen) };
  assert.equal(d.sizeState(full), 'full');
});

test('text alternatives describe what a drawing holds', () => {
  const data = { v: 1, w: 10, h: 10, items: [
    { t: 'pen', c: '#000000', s: 3, pr: false, p: [1, 1, 1] },
    { t: 'label', c: '#000000', s: 28, x: 1, y: 1, text: 'Exit' },
  ] };
  assert.equal(d.describeDrawing(data, 'Shot 3'), 'Shot 3 (1 stroke, 1 label: Exit)');
  assert.equal(d.describeDrawing(d.emptyDrawing({ w: 1, h: 1 }), ''), 'Sketch (empty)');
});

test('thinning keeps the pressure shape of a straight Pencil stroke', () => {
  const p = []; for (let i = 0; i <= 100; i++) p.push(i * 5, 0, Math.round(200 + 600 * Math.sin((Math.PI * i) / 100)));
  const thin = d.thinPoints(p);
  const pressures = thin.filter((_, i) => i % 3 === 2);
  assert.ok(Math.max(...pressures) >= 780, `peak pressure kept (${Math.max(...pressures)})`);
  assert.ok(thin.length / 3 < 40, `still thinned (${thin.length / 3} points)`);
});
