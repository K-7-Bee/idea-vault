import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import sharp from "sharp";

// Phase 6D: text contrast measured on rendered pixels (WCAG AA: 4.5:1, or 3:1 for large text).
// axe can't judge text on gradients, so this check does it the way the eye sees it:
//   1. record every visible text's colour (through a canvas, so any CSS colour syntax works);
//   2. make all text transparent and screenshot what is behind it, scrolling a viewport at a time;
//   3. score each text against its background pixels and take a low percentile (near worst case,
//      ignoring a few stray anti-aliased or border pixels).
// Skipped, and counted: text over images, canvases or video (photos and the 3D hero vary), text
// covered by another element at that scroll position, and disabled controls (WCAG exempts them).
const API = "http://127.0.0.1:4317";
const IDEA = "33333333-3333-4333-8333-333333333333";
const PROJECT = "dddddddd-0000-4000-8000-0000000000a1";

// Phase 7: a story project with a sketch, so the drawing editor is checked too.
const STORY = "dddddddd-0000-4000-8000-0000000000b1";
const SHOT = "dddddddd-0000-4000-8000-0000000000b2";
const DRAWING = "dddddddd-0000-4000-8000-0000000000b3";
const STORY_SEED = {
  story_units: [{ id: SHOT, project_id: STORY, parent_id: null, kind: "shot", title: "Opening shot", summary: "", location: "", time_of_day: "", camera: "", duration_seconds: null, position: 1 }],
  drawings: [{ id: DRAWING, project_id: STORY, unit_id: SHOT, base_file_id: null, title: "First pass", aspect: "16:9", position: 1,
    data: { v: 1, w: 1600, h: 900, items: [{ t: "pen", c: "#111827", s: 6, pr: false, p: [100, 100, 500, 800, 400, 500] }, { t: "label", c: "#dc2626", s: 40, x: 200, y: 600, text: "Door" }] } }],
};
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };
const WIDTHS = [320, 768, 1280];
const PUBLIC = ["/", "/projects", "/projects/waste-to-energy-lighting", "/journal", "/login", "/privacy", "/no-such-page"];
const VAULT = ["/vault", `/vault/ideas/${IDEA}`, "/vault/projects", `/vault/projects/${PROJECT}`, "/vault/archive",
  "/vault/lab", "/vault/story", "/vault/portfolio", "/vault/settings", `/vault/projects/${STORY}/drawings/${DRAWING}`];
const PERCENTILE = 0.05;

type Item = { id: string; text: string; fg: number[]; large: boolean };
type Box = { id: string; rects: { x: number; y: number; w: number; h: number }[] };

async function control(request: APIRequestContext, data: object) {
  expect((await request.post(`${API}/_test/control`, { headers: controlHeaders, data })).ok()).toBeTruthy();
}
async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill("owner@fixture.invalid");
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workspace overview" })).toBeVisible();
}

// Step 1, in the page: tag each element that directly holds visible text and record its colour.
function collect(): Item[] {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const rgba = (css: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = "#000"; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
  const owners = new Set<HTMLElement>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.textContent?.trim() && node.parentElement) owners.add(node.parentElement);
  }
  const items: Item[] = [];
  let n = 0;
  for (const el of owners) {
    if (el.closest('svg, script, style, noscript, template, option, select, textarea, title, [aria-hidden="true"], :disabled, [aria-disabled="true"]')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== "visible") continue;
    const size = parseFloat(cs.fontSize), weight = Number(cs.fontWeight) || 400;
    const id = `cc${n++}`;
    el.setAttribute("data-cc", id);
    items.push({ id, text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 50), fg: rgba(cs.color),
      large: size >= 24 || (weight >= 700 && size >= 18.66) });
  }
  return items;
}

// Step 3 helper, in the page: the line boxes of each tagged element's own text that are fully in
// the viewport, visible (opacity) and not covered by something else; plus what was skipped.
function boxes(): { boxes: Box[]; media: number; covered: number } {
  const vw = innerWidth, vh = innerHeight;
  const mediaRects = [...document.querySelectorAll("canvas, video, img, iframe, picture")]
    .map((m) => m.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const out: Box[] = []; let media = 0, covered = 0;
  for (const el of document.querySelectorAll<HTMLElement>("[data-cc]")) {
    let opacity = 1;
    for (let a: HTMLElement | null = el; a; a = a.parentElement) opacity *= Number(getComputedStyle(a).opacity);
    if (opacity < 0.95) continue;
    const rects: DOMRect[] = [];
    for (const child of el.childNodes) {
      if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(child);
      for (const r of range.getClientRects()) if (r.width >= 2 && r.height >= 4) rects.push(r);
    }
    if (!rects.length || rects.some((r) => r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh)) continue;
    if (rects.some((r) => mediaRects.some((m) => overlaps(r, m)))) { media++; continue; }
    const r0 = rects[0], hit = document.elementFromPoint(r0.left + r0.width / 2, r0.top + r0.height / 2);
    if (!hit || !(el === hit || el.contains(hit) || hit.contains(el))) { covered++; continue; }
    out.push({ id: el.dataset.cc!, rects: rects.map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height })) });
  }
  return { boxes: out, media, covered };
}

const lum = (c: number[]) => {
  const f = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** Every text on the current page below AA, as readable lines. */
async function lowContrast(page: Page, label: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const items = new Map((await page.evaluate(collect)).map((i) => [i.id, i]));
  await page.addStyleTag({ content: `*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important;
    text-shadow: none !important; caret-color: transparent !important; text-decoration-color: transparent !important;
    animation-play-state: paused !important; transition: none !important; }` });
  const done = new Set<string>(); const failures: string[] = []; let media = 0, covered = 0;
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const view = page.viewportSize()!;
  for (let y = 0; ; y += Math.floor(view.height * 0.8)) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(150);
    const found = await page.evaluate(boxes);
    media += found.media; covered += found.covered;
    const fresh = found.boxes.filter((b) => !done.has(b.id));
    if (fresh.length) {
      const { data, info } = await sharp(await page.screenshot({ animations: "disabled", caret: "hide" })).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (const box of fresh) {
        done.add(box.id);
        const item = items.get(box.id)!; const alpha = item.fg[3] / 255; const scores: number[] = [];
        for (const r of box.rects) {
          for (let py = Math.ceil(r.y + 1); py < r.y + r.h - 1; py += 2) for (let px = Math.ceil(r.x + 1); px < r.x + r.w - 1; px += 2) {
            if (px >= info.width || py >= info.height) continue;
            const i = (py * info.width + px) * 4, bg = [data[i], data[i + 1], data[i + 2]];
            const fg = [0, 1, 2].map((k) => item.fg[k] * alpha + bg[k] * (1 - alpha));
            scores.push(ratio(fg, bg));
          }
        }
        if (!scores.length) continue;
        scores.sort((a, b) => a - b);
        const measured = scores[Math.floor(scores.length * PERCENTILE)], need = item.large ? 3 : 4.5;
        if (measured < need) failures.push(`${label}  ${measured.toFixed(2)} < ${need}  "${item.text}"  (text rgba(${item.fg.join(",")}))`);
      }
    }
    if (y + view.height >= height) break;
  }
  return { failures, measured: done.size, media, covered };
}

async function check(page: Page, paths: string[], scheme: "light" | "dark") {
  const found: string[] = [];
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  for (const path of paths) for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path);
    await expect(page.locator("main:visible, h1:visible").first()).toBeVisible();
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    const result = await lowContrast(page, `${path} @${width}px ${scheme}`);
    found.push(...result.failures);
  }
  return [...new Set(found)];
}

test.beforeEach(async ({ request, context }) => {
  expect((await request.post(`${API}/_test/reset`, { headers: controlHeaders })).ok()).toBeTruthy();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port)) await route.continue();
    else await route.abort("blockedbyclient");
  });
});

for (const scheme of ["light", "dark"] as const) {
  test(`public pages meet AA text contrast (${scheme} scheme)`, async ({ page }) => {
    test.setTimeout(240_000);
    const found = await check(page, PUBLIC, scheme);
    expect(found, found.join("\n")).toEqual([]);
  });

  test(`the Vault's main screens meet AA text contrast (${scheme} scheme)`, async ({ page, request }) => {
    test.setTimeout(300_000);
    await control(request, { seed: { projects: [{ id: PROJECT, title: "Contrast check", summary: "A seeded project." }, { id: STORY, title: "Story check", project_type: "story" }], ...STORY_SEED } });
    await login(page);
    const found = await check(page, VAULT, scheme);
    expect(found, found.join("\n")).toEqual([]);
  });
}

test("the contrast check catches low-contrast text", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => {
    const box = document.createElement("p");
    box.textContent = "Canary pale text";
    box.setAttribute("style", "position:fixed;top:40px;left:40px;z-index:99999;background:#ffffff;color:#c8c8c8;font-size:16px;padding:8px");
    document.body.append(box);
  });
  const { failures } = await lowContrast(page, "canary");
  expect(failures.some((f) => f.includes("Canary pale text"))).toBe(true);
});
