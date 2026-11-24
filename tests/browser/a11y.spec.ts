import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Phase 6C: automated accessibility rules (axe-core, WCAG 2.0–2.2 A and AA) on the public pages
// and the Vault's main screens at 320, 768 and 1280 px, against the synthetic fixture. Any
// violation fails. axe finds roughly a third to a half of real issues; keyboard and screen-reader
// checks by hand still matter.
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
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const PUBLIC = ["/", "/projects", "/projects/waste-to-energy-lighting", "/journal", "/login", "/privacy", "/no-such-page"];
const VAULT = ["/vault", `/vault/ideas/${IDEA}`, "/vault/projects", `/vault/projects/${PROJECT}`, "/vault/archive",
  "/vault/lab", "/vault/story", "/vault/portfolio", "/vault/settings", `/vault/projects/${STORY}/drawings/${DRAWING}`];

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

// One readable line per failing element, so a CI log says what to fix and where.
async function violations(page: Page, path: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(path);
  // `main`, or the h1 of Next's built-in 404 page (which has no main landmark; /journal shows it
  // while nothing is published).
  await expect(page.locator("main:visible, h1:visible").first()).toBeVisible();
  // Settled data, but bounded: the Portfolio screen keeps checking the homepage in the background.
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.flatMap((v) => v.nodes.map((n) =>
    `${path} @${width}px  ${v.id} (${v.impact}): ${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1]?.trim() ?? v.help}`));
}

test.beforeEach(async ({ request, context }) => {
  expect((await request.post(`${API}/_test/reset`, { headers: controlHeaders })).ok()).toBeTruthy();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port)) await route.continue();
    else await route.abort("blockedbyclient");
  });
});

test("public pages have no axe violations at 320, 768 and 1280 px", async ({ page }) => {
  const found: string[] = [];
  for (const path of PUBLIC) for (const width of WIDTHS) found.push(...await violations(page, path, width));
  expect(found, found.join("\n")).toEqual([]);
});

test("the Vault's main screens have no axe violations at 320, 768 and 1280 px", async ({ page, request }) => {
  test.setTimeout(180_000);
  await control(request, { seed: { projects: [{ id: PROJECT, title: "Accessibility check", summary: "A seeded project." }, { id: STORY, title: "Story check", project_type: "story" }], ...STORY_SEED } });
  await login(page);
  const found: string[] = [];
  for (const path of VAULT) for (const width of WIDTHS) found.push(...await violations(page, path, width));
  expect(found, found.join("\n")).toEqual([]);
});

test("the check catches real violations (an unlabeled button, an image without alt text)", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  // A container of its own after hydration, so React doesn't re-render the planted elements away.
  await page.evaluate(() => {
    const box = document.createElement("div");
    box.innerHTML = '<button id="axe-canary-button"></button><img id="axe-canary-img" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">';
    document.body.append(box);
  });
  await expect(page.locator("#axe-canary-button")).toBeAttached();
  await expect(page.locator("#axe-canary-img")).toBeAttached();
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const ids = violations.map((v) => v.id);
  expect(ids).toContain("button-name");
  expect(ids).toContain("image-alt");
});
