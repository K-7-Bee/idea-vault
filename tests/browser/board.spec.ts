import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Phase 7C: visual boards against the synthetic fixture (not Supabase).
const API = "http://127.0.0.1:4317";
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };
const PROJECT = "d7c00000-0000-4000-8000-000000000001";
const CHARACTER = "d7c10000-0000-4000-8000-000000000001";
const SHOT = "d7c10000-0000-4000-8000-000000000002";
type CardRow = { id: string; kind: string; text: string; x: number; y: number; character_id: string | null; unit_id: string | null; version: number };
type State = { work: { boards: { id: string; title: string }[]; board_cards: CardRow[]; board_links: { from_card_id: string; to_card_id: string; label: string }[] } };

async function control(request: APIRequestContext, data: object) {
  expect((await request.post(`${API}/_test/control`, { headers: controlHeaders, data })).ok()).toBeTruthy();
}
async function state(request: APIRequestContext): Promise<State> {
  return (await request.get(`${API}/_test/state`, { headers: controlHeaders })).json();
}
async function login(page: Page) {
  await page.goto("/login");
  const overview = page.getByRole("heading", { name: "Workspace overview" });
  await expect(async () => {
    if (await overview.isVisible()) return;
    if (!page.url().includes("/login")) await page.goto("/login");
    await page.getByRole("textbox", { name: "Email address" }).fill("owner@fixture.invalid");
    await page.getByRole("textbox", { name: "Password" }).fill("synthetic-test-password");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(overview).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 30_000 });
}
const status = (page: Page, text: string | RegExp) => page.getByRole("status").or(page.getByRole("alert")).filter({ hasText: text });

test.beforeEach(async ({ request, context, page }) => {
  expect((await request.post(`${API}/_test/reset`, { headers: controlHeaders })).ok()).toBeTruthy();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["blob:", "data:"].includes(url.protocol) || (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port))) await route.continue();
    else await route.abort("blockedbyclient");
  });
  page.on("dialog", (dialog) => dialog.accept());
  await control(request, { seed: {
    projects: [{ id: PROJECT, title: "Lighthouse", project_type: "hybrid", stage: "exploring" }],
    story_characters: [{ id: CHARACTER, project_id: PROJECT, name: "Keeper", role: "", description: "", traits: "", arc: "", position: 1 }],
    story_units: [{ id: SHOT, project_id: PROJECT, parent_id: null, kind: "shot", title: "Storm arrives", summary: "", location: "", time_of_day: "", camera: "", duration_seconds: null, position: 1 }],
  } });
  await login(page);
});

test("create a board, add note and record cards, drag and keyboard-move them, connect them; everything persists", async ({ page, request }) => {
  await page.goto(`/vault/projects/${PROJECT}`);
  await expect(async () => {
    await page.getByRole("textbox", { name: "New board title" }).fill("Plot map");
    await page.getByRole("button", { name: "New board" }).click();
    await expect(page).toHaveURL(/\/boards\/[0-9a-f-]{36}$/, { timeout: 4_000 });
  }).toPass({ timeout: 20_000 });
  const add = page.getByRole("form", { name: "Add a card" });

  await add.getByRole("textbox", { name: "Note" }).fill("The lamp fails at midnight");
  await add.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByRole("article", { name: "Card: The lamp fails at midnight" })).toBeVisible();
  await add.getByRole("combobox", { name: "Card shows" }).selectOption({ label: "Character" });
  await add.getByRole("combobox", { name: "Which one" }).selectOption({ label: "Keeper" });
  await add.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByRole("article", { name: "Card: Keeper" })).toBeVisible();
  await add.getByRole("combobox", { name: "Card shows" }).selectOption({ label: "Scene or shot" });
  await add.getByRole("combobox", { name: "Which one" }).selectOption({ label: "Shot: Storm arrives" });
  await add.getByRole("textbox", { name: "Caption (optional)" }).fill("Wide, rain");
  await add.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByRole("article", { name: "Card: Shot: Storm arrives" })).toContainText("Wide, rain");
  await expect.poll(async () => (await state(request)).work.board_cards.length).toBe(3);

  // Drag the note by its handle.
  const note = () => (async () => (await state(request)).work.board_cards.find((c) => c.kind === "note")!)();
  const before = await note();
  const handle = page.getByRole("button", { name: "Move card The lamp fails at midnight: drag, or use the arrow keys" });
  await handle.scrollIntoViewIfNeeded();
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 300, h.y + h.height / 2 + 200, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await note()).version).toBeGreaterThan(before.version);
  const dragged = await note();
  expect(dragged.x - before.x).toBeGreaterThanOrEqual(280);
  expect(dragged.y - before.y).toBeGreaterThanOrEqual(180);
  expect(dragged.x % 20).toBe(0);

  // Keyboard: arrow keys on the handle move it a grid step at a time.
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(async () => { const n = await note(); return [n.x - dragged.x, n.y - dragged.y]; }).toEqual([40, 100]);

  // Connect the character to the shot with a label.
  await page.getByRole("button", { name: "Connect card Keeper" }).click();
  await page.getByRole("button", { name: "Connect here: Shot: Storm arrives" }).click();
  await page.getByRole("textbox", { name: "Connection label (optional)" }).fill("watches");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(status(page, "Connected.")).toBeVisible();
  const s = await state(request);
  expect(s.work.board_links.map((l) => l.label)).toEqual(["watches"]);

  // List view shows the same cards and connections; everything is there after a reload.
  await page.reload();
  await expect(async () => {
    await page.getByRole("group", { name: "Board view" }).getByRole("button", { name: "List" }).click();
    await expect(page.getByRole("heading", { name: "Cards (3)" })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByRole("listitem").filter({ hasText: /Keeper.*connected to.*Shot: Storm arrives: watches/ })).toBeVisible();
});

test("deleting a card removes its connections; deleting the board removes its cards (after asking)", async ({ page, request }) => {
  await control(request, { seed: {
    boards: [{ id: "d7c20000-0000-4000-8000-000000000001", project_id: PROJECT, title: "Cast", position: 1 }],
    board_cards: [
      { id: "d7c30000-0000-4000-8000-000000000001", project_id: PROJECT, board_id: "d7c20000-0000-4000-8000-000000000001", kind: "character", text: "", colour: "blue",
        character_id: CHARACTER, file_id: null, drawing_id: null, unit_id: null, entry_id: null, x: 40, y: 40, w: 220, h: 160 },
      { id: "d7c30000-0000-4000-8000-000000000002", project_id: PROJECT, board_id: "d7c20000-0000-4000-8000-000000000001", kind: "note", text: "Backstory", colour: "yellow",
        character_id: null, file_id: null, drawing_id: null, unit_id: null, entry_id: null, x: 400, y: 40, w: 220, h: 160 },
    ],
    board_links: [{ id: "d7c40000-0000-4000-8000-000000000001", project_id: PROJECT, board_id: "d7c20000-0000-4000-8000-000000000001",
      from_card_id: "d7c30000-0000-4000-8000-000000000001", to_card_id: "d7c30000-0000-4000-8000-000000000002", label: "" }],
  } });
  await page.goto(`/vault/projects/${PROJECT}/boards/d7c20000-0000-4000-8000-000000000001`);
  await expect(page.getByRole("article", { name: "Card: Keeper" })).toBeVisible();

  await page.getByRole("button", { name: "Delete card Backstory" }).click();
  await expect(status(page, "Card deleted.")).toBeVisible();
  await expect.poll(async () => (await state(request)).work.board_links.length).toBe(0);
  expect((await state(request)).work.board_cards.length).toBe(1);

  await page.getByRole("button", { name: "Delete board" }).click();
  await expect(page).toHaveURL(new RegExp(`/vault/projects/${PROJECT}$`));
  const s = await state(request);
  expect([s.work.boards.length, s.work.board_cards.length]).toEqual([0, 0]);
});

test("a removed record shows as removed on its card, and boards can't be read logged out", async ({ page, request }) => {
  await control(request, { seed: {
    boards: [{ id: "d7c20000-0000-4000-8000-000000000002", project_id: PROJECT, title: "Orphans", position: 1 }],
    board_cards: [{ id: "d7c30000-0000-4000-8000-000000000003", project_id: PROJECT, board_id: "d7c20000-0000-4000-8000-000000000002", kind: "unit", text: "Was the storm shot",
      colour: "grey", character_id: null, file_id: null, drawing_id: null, unit_id: null, entry_id: null, x: 40, y: 40, w: 220, h: 160 }],
  } });
  await page.goto(`/vault/projects/${PROJECT}/boards/d7c20000-0000-4000-8000-000000000002`);
  const card = page.getByRole("article", { name: "Card: Scene or shot (removed)" });
  await expect(card).toContainText("The record this card pointed at was deleted. The card is kept.");
  await expect(card).toContainText("Was the storm shot");
  const url = page.url();
  await page.context().clearCookies();
  const anonymous = await request.get(url, { maxRedirects: 0 });
  expect([302, 303, 307]).toContain(anonymous.status());
});
