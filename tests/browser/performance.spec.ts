import { test, expect, type Page } from "@playwright/test";

// Phase 6C: a byte budget for the public homepage. Loads `/` at 1280 × 900 without scrolling and
// adds up what it downloads, by type (encoded sizes, as the fixture build serves them; Vercel's
// compression differs, so these are relative numbers, not live ones). Fails if any type grows more
// than 10% over the baseline measured on 2026-11-23. Raising a budget is a deliberate change here.
const BASELINE: Record<string, number> = {
  document: 9_910,
  script: 145_052,
  stylesheet: 16_085,
  font: 136_516,
  image: 135_634,
};
const ALLOWANCE = 1.1;

async function homepageBytes(page: Page) {
  const totals: Record<string, number> = Object.fromEntries(Object.keys(BASELINE).map((k) => [k, 0]));
  const pending: Promise<void>[] = [];
  page.on("requestfinished", (request) => {
    const type = request.resourceType();
    if (!(type in totals)) return;
    pending.push(request.sizes().then((s) => { totals[type] += s.responseBodySize; }).catch(() => {}));
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await Promise.all(pending);
  return totals;
}

test.beforeEach(async ({ context }) => {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port)) await route.continue();
    else await route.abort("blockedbyclient");
  });
});

test("the homepage stays within its download budget", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const totals = await homepageBytes(page);
  console.log(`homepage bytes: ${JSON.stringify(totals)}`);
  const over = Object.entries(totals).filter(([type, bytes]) => bytes > Math.ceil(BASELINE[type] * ALLOWANCE))
    .map(([type, bytes]) => `${type}: ${bytes} B, budget ${Math.ceil(BASELINE[type] * ALLOWANCE)} B (baseline ${BASELINE[type]} B)`);
  expect(over, over.join("\n")).toEqual([]);
});
