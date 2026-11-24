// Phase 7: the drawing data format (sketches on shots and scenes, annotation layers on images).
// Pure functions with no imports, so they run in the browser, on the server and in unit tests.
//
// Coordinates are whole numbers on a fixed logical canvas (data.w × data.h), so a drawing looks the
// same at any screen size. Pen points are flat triples [x, y, pressure 0-1000, ...]. Everything read
// back from the database goes through parseDrawing, which drops anything malformed: the editor only
// ever renders validated numbers, colours from a fixed pattern and text as React text nodes.

export const FORMAT_VERSION = 1;
export const ASPECTS = ["16:9", "4:3", "1:1", "9:16"] as const;
export type SketchAspect = (typeof ASPECTS)[number];
export type Aspect = SketchAspect | "image";

export const COLOURS = [
  { value: "#111827", label: "Black" },
  { value: "#dc2626", label: "Red" },
  { value: "#2563eb", label: "Blue" },
  { value: "#16a34a", label: "Green" },
  { value: "#d97706", label: "Orange" },
  { value: "#ffffff", label: "White" },
] as const;
export const PEN_SIZES = [{ value: 3, label: "Fine" }, { value: 6, label: "Medium" }, { value: 12, label: "Broad" }] as const;
export const LABEL_SIZES = [28, 40, 56] as const;

export const LIMITS = {
  items: 4000,
  pointsPerStroke: 6000, // points, not numbers
  labelChars: 200,
  warnBytes: 1_500_000,
  maxBytes: 1_900_000, // the database refuses 2 MB; stay clear of it
  side: 4000,
};

export type Pen = { t: "pen"; c: string; s: number; pr: boolean; p: number[] };
export type Arrow = { t: "arrow"; c: string; s: number; a: [number, number, number, number] };
export type Label = { t: "label"; c: string; s: number; x: number; y: number; text: string };
export type Item = Pen | Arrow | Label;
export type DrawingData = { v: 1; w: number; h: number; bg?: string; items: Item[] };

const COLOUR = /^#[0-9a-f]{6}$/i;
const PRESSURE_TOLERANCE = 60; // of 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The logical canvas for a sketch shape. */
export function canvasFor(aspect: SketchAspect): { w: number; h: number } {
  switch (aspect) {
    case "4:3": return { w: 1600, h: 1200 };
    case "1:1": return { w: 1200, h: 1200 };
    case "9:16": return { w: 900, h: 1600 };
    default: return { w: 1600, h: 900 };
  }
}

/** The logical canvas for an annotation layer over an image of the given pixel size (long side 1600). */
export function canvasForImage(width: number, height: number): { w: number; h: number } {
  if (!(width > 0) || !(height > 0)) return { w: 1600, h: 1200 };
  const scale = 1600 / Math.max(width, height);
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

export function emptyDrawing(size: { w: number; h: number }): DrawingData {
  return { v: 1, w: size.w, h: size.h, items: [] };
}

const int = (n: unknown, min: number, max: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : null;

function parseItem(raw: unknown, w: number, h: number): Item | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const c = typeof o.c === "string" && COLOUR.test(o.c) ? o.c.toLowerCase() : null;
  const s = int(o.s, 1, 200);
  if (!c || s === null) return null;
  const mx = w * 2, my = h * 2; // allow strokes that run slightly off the canvas edge
  if (o.t === "pen" && Array.isArray(o.p)) {
    if (o.p.length < 3 || o.p.length % 3 !== 0 || o.p.length > LIMITS.pointsPerStroke * 3) return null;
    const p: number[] = [];
    for (let i = 0; i < o.p.length; i += 3) {
      const x = int(o.p[i], -w, mx), y = int(o.p[i + 1], -h, my), pr = int(o.p[i + 2], 0, 1000);
      if (x === null || y === null || pr === null) return null;
      p.push(x, y, pr);
    }
    return { t: "pen", c, s, pr: o.pr === true, p };
  }
  if (o.t === "arrow" && Array.isArray(o.a) && o.a.length === 4) {
    const a = [int(o.a[0], -w, mx), int(o.a[1], -h, my), int(o.a[2], -w, mx), int(o.a[3], -h, my)];
    if (a.some((n) => n === null)) return null;
    return { t: "arrow", c, s, a: a as [number, number, number, number] };
  }
  if (o.t === "label" && typeof o.text === "string") {
    const x = int(o.x, -w, mx), y = int(o.y, -h, my);
    const text = o.text.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, LIMITS.labelChars);
    if (x === null || y === null || !text) return null;
    return { t: "label", c, s, x, y, text };
  }
  return null;
}

/** Validates data read from the database or a local draft. Malformed items are dropped, never rendered. */
export function parseDrawing(raw: unknown, fallback: { w: number; h: number }): DrawingData {
  const o = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const w = int(o.w, 1, LIMITS.side) ?? fallback.w;
  const h = int(o.h, 1, LIMITS.side) ?? fallback.h;
  const items = Array.isArray(o.items) ? o.items.slice(0, LIMITS.items).map((i) => parseItem(i, w, h)).filter((i): i is Item => i !== null) : [];
  const out: DrawingData = { v: 1, w, h, items };
  if (typeof o.bg === "string" && UUID.test(o.bg)) out.bg = o.bg.toLowerCase();
  return out;
}

/** Size of the stored JSON in bytes (UTF-8). */
export function byteSize(data: DrawingData): number {
  return new TextEncoder().encode(JSON.stringify(data)).length;
}

export function sizeState(data: DrawingData): "ok" | "warn" | "full" {
  const n = byteSize(data);
  return n > LIMITS.maxBytes ? "full" : n > LIMITS.warnBytes ? "warn" : "ok";
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Thins a stroke's points (Ramer-Douglas-Peucker on x, y and pressure) so the shape stays within
 * `tolerance` logical pixels and the pressure within 6% of what was drawn. Input and output are flat [x, y, pressure] triples.
 */
export function thinPoints(p: number[], tolerance = 0.75): number[] {
  const n = p.length / 3;
  if (n <= 2) return p.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1; keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    // A point matters if it is off the straight line by more than `tolerance`, or if its pressure
    // is off the straight-line estimate by more than PRESSURE_TOLERANCE (so a straight Pencil
    // stroke keeps its thick and thin parts).
    let worst = -1, at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segmentDistance(p[i * 3], p[i * 3 + 1], p[a * 3], p[a * 3 + 1], p[b * 3], p[b * 3 + 1]) / tolerance;
      const expected = p[a * 3 + 2] + ((p[b * 3 + 2] - p[a * 3 + 2]) * (i - a)) / (b - a);
      const score = Math.max(d, Math.abs(p[i * 3 + 2] - expected) / PRESSURE_TOLERANCE);
      if (score > worst) { worst = score; at = i; }
    }
    if (worst > 1) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  return out;
}

/** Whether the eraser (a circle at x, y of radius r) touches an item. Labels use an estimated box. */
export function hits(item: Item, x: number, y: number, r: number): boolean {
  if (item.t === "pen") {
    const reach = r + item.s / 2;
    const p = item.p;
    if (p.length === 3) return Math.hypot(x - p[0], y - p[1]) <= reach;
    for (let i = 0; i + 5 < p.length; i += 3) {
      if (segmentDistance(x, y, p[i], p[i + 1], p[i + 3], p[i + 4]) <= reach) return true;
    }
    return false;
  }
  if (item.t === "arrow") return segmentDistance(x, y, item.a[0], item.a[1], item.a[2], item.a[3]) <= r + item.s;
  const width = item.text.length * item.s * 0.6, height = item.s * 1.2;
  return x >= item.x - r && x <= item.x + width + r && y >= item.y - height - r && y <= item.y + r * 0.5 + item.s * 0.3;
}

/** Turns raw pointer samples into a stored pen stroke: rounded, thinned, capped in length. */
export function makePen(samples: number[], colour: string, size: number, realPressure: boolean): Pen | null {
  if (samples.length < 3 || !COLOUR.test(colour)) return null;
  const rounded: number[] = [];
  for (let i = 0; i + 2 < samples.length; i += 3) {
    rounded.push(Math.round(samples[i]), Math.round(samples[i + 1]), Math.max(0, Math.min(1000, Math.round(samples[i + 2] * 1000))));
  }
  const p = thinPoints(rounded).slice(0, LIMITS.pointsPerStroke * 3);
  return { t: "pen", c: colour.toLowerCase(), s: size, pr: realPressure, p };
}

/** Text alternative for a drawing thumbnail. */
export function describeDrawing(data: DrawingData, title: string): string {
  const counts = { pen: 0, arrow: 0, label: 0 };
  for (const i of data.items) counts[i.t]++;
  const parts = [`${counts.pen} stroke${counts.pen === 1 ? "" : "s"}`];
  if (counts.arrow) parts.push(`${counts.arrow} arrow${counts.arrow === 1 ? "" : "s"}`);
  if (counts.label) parts.push(`${counts.label} label${counts.label === 1 ? "" : "s"}: ${data.items.filter((i): i is Label => i.t === "label").map((l) => l.text).slice(0, 3).join(", ")}`);
  return `${title || "Sketch"} (${data.items.length ? parts.join(", ") : "empty"})`;
}

/**
 * A lighter copy for thumbnails: strokes thinned to about a 400 px wide preview and pressure kept.
 * Pages send this instead of the full drawing, so a storyboard of many sketches stays small.
 */
export function previewOf(data: DrawingData): DrawingData {
  const tolerance = Math.max(1, data.w / 400);
  return { ...data, items: data.items.map((i) => (i.t === "pen" ? { ...i, p: thinPoints(i.p, tolerance) } : i)) };
}
