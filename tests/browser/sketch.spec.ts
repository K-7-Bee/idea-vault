import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Phase 7A: sketches on storyboard shots, against the synthetic fixture (not Supabase or Google).
// Pen input is sent as real PointerEvents with pointerType "pen" and changing pressure, the same
// events iPad Safari sends for Apple Pencil; mouse input goes through Playwright's mouse.
const API = "http://127.0.0.1:4317";
const FOLDER = "fixture-folder-0001";
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };
const PROJECT = "d7a00000-0000-4000-8000-000000000001";
const SCENE = "d7a10000-0000-4000-8000-000000000001";
const SHOTS = ["d7a10000-0000-4000-8000-000000000002", "d7a10000-0000-4000-8000-000000000003", "d7a10000-0000-4000-8000-000000000004"];
type Item = { t: string; pr?: boolean; p?: number[]; text?: string };
type Drawing = { id: string; unit_id: string | null; title: string; version: number; data: { w: number; h: number; bg?: string; items: Item[] } };
type State = { work: { drawings: Drawing[]; story_units: { id: string; position: number; title: string }[] };
  simple: { project_files: { id: string; name: string; unit_id: string | null; md5: string | null; drive_file_id: string }[] } };

async function control(request: APIRequestContext, data: object) {
  expect((await request.post(`${API}/_test/control`, { headers: controlHeaders, data })).ok()).toBeTruthy();
}
async function state(request: APIRequestContext): Promise<State> {
  return (await request.get(`${API}/_test/state`, { headers: controlHeaders })).json();
}
async function login(page: Page) {
  await page.goto("/login");
  // WebKit can take a click before React has attached the form handler; retry until it logs in.
  const overview = page.getByRole("heading", { name: "Workspace overview" });
  await expect(async () => {
    if (await overview.isVisible()) return; // a slow earlier click already logged in
    if (!page.url().includes("/login")) await page.goto("/login");
    await page.getByRole("textbox", { name: "Email address" }).fill("owner@fixture.invalid");
    await page.getByRole("textbox", { name: "Password" }).fill("synthetic-test-password");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(overview).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 30_000 });
}
async function seedStoryboard(request: APIRequestContext) {
  await control(request, { seed: {
    projects: [{ id: PROJECT, title: "Night market", project_type: "story", stage: "exploring" }],
    story_units: [
      { id: SCENE, project_id: PROJECT, parent_id: null, kind: "scene", title: "Market at dusk", summary: "", location: "", time_of_day: "", camera: "", duration_seconds: null, position: 1 },
      ...SHOTS.map((id, i) => ({ id, project_id: PROJECT, parent_id: SCENE, kind: "shot", title: `Shot ${i + 1}`, summary: "", location: "", time_of_day: "", camera: "", duration_seconds: null, position: i + 1 })),
    ],
  } });
}
async function openStory(page: Page) {
  await page.goto(`/vault/projects/${PROJECT}`);
  await expect(async () => {
    await page.getByRole("navigation", { name: "Project sections" }).getByRole("button", { name: "Structure", exact: true }).click();
    await expect(page.getByRole("region", { name: "Structure" })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}
const canvas = (page: Page) => page.getByRole("img", { name: /canvas/ });
const saveStatus = (page: Page) => page.getByRole("status").filter({ hasText: /^(Saved|Saving…|Unsaved changes|Offline|Not saved)/ });

async function mouseStroke(page: Page, from: [number, number], to: [number, number]) {
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + box.width * (from[0] + ((to[0] - from[0]) * i) / 10), box.y + box.height * (from[1] + ((to[1] - from[1]) * i) / 10));
  }
  await page.mouse.up();
}
async function penStroke(page: Page, from: [number, number], to: [number, number], pointerType = "pen") {
  await canvas(page).evaluate((svg, { from, to, pointerType }) => {
    const box = svg.getBoundingClientRect();
    const at = (t: number) => ({ clientX: box.left + box.width * (from[0] + (to[0] - from[0]) * t), clientY: box.top + box.height * (from[1] + (to[1] - from[1]) * t) });
    const fire = (type: string, t: number, pressure: number) => svg.dispatchEvent(new PointerEvent(type, { pointerId: 41, pointerType, isPrimary: true, bubbles: true, cancelable: true, pressure, button: 0, buttons: type === "pointerup" ? 0 : 1, ...at(t) }));
    fire("pointerdown", 0, 0.2);
    for (let i = 1; i <= 12; i++) fire("pointermove", i / 12, 0.2 + 0.6 * Math.sin((Math.PI * i) / 12));
    fire("pointerup", 1, 0);
  }, { from, to, pointerType });
}
async function savedDrawing(request: APIRequestContext, id: string) {
  await expect.poll(async () => (await state(request)).work.drawings.find((d) => d.id === id)?.version ?? 0).toBeGreaterThan(1);
  return (await state(request)).work.drawings.find((d) => d.id === id)!;
}

test.beforeEach(async ({ request, context, page }) => {
  expect((await request.post(`${API}/_test/reset`, { headers: controlHeaders })).ok()).toBeTruthy();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port)) await route.continue();
    else await route.abort("blockedbyclient");
  });
  page.on("dialog", (dialog) => dialog.accept());
  await seedStoryboard(request);
  await login(page);
});

test("sketch a shot with pen and mouse: pressure, eraser, undo, redo, clear; it autosaves and reloads identical", async ({ page, request }) => {
  await openStory(page);
  await page.getByRole("button", { name: "Add a sketch to Shot 1" }).click();
  await expect(page).toHaveURL(/\/drawings\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Scene: Market at dusk › Shot: Shot 1");
  await expect(saveStatus(page)).toHaveText("Saved");

  await penStroke(page, [0.1, 0.2], [0.6, 0.3]);
  await mouseStroke(page, [0.1, 0.7], [0.8, 0.7]);
  await expect(saveStatus(page)).toHaveText("Saved");
  let saved = await savedDrawing(request, id);
  expect(saved.data.items.map((i) => [i.t, i.pr])).toEqual([["pen", true], ["pen", false]]);
  expect(saved.data.items[0].p!.length % 3).toBe(0);
  // Real pressure was kept (0-1000) and varies along the Pencil stroke; the mouse stroke has none.
  const pressures = saved.data.items[0].p!.filter((_, i) => i % 3 === 2);
  expect(Math.max(...pressures) - Math.min(...pressures)).toBeGreaterThan(200);

  // Eraser removes the stroke it touches; undo brings it back, redo removes it again.
  await page.getByRole("button", { name: "Eraser" }).click();
  await mouseStroke(page, [0.45, 0.6], [0.45, 0.8]);
  await expect(canvas(page)).toHaveAttribute("aria-label", /: 1 mark\./);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(canvas(page)).toHaveAttribute("aria-label", /: 2 marks\./);
  await page.keyboard.press("Control+Shift+Z");
  await expect(canvas(page)).toHaveAttribute("aria-label", /: 1 mark\./);
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(canvas(page)).toHaveAttribute("aria-label", /: 0 marks\./);
  await page.keyboard.press("Control+Z");
  await expect(canvas(page)).toHaveAttribute("aria-label", /: 1 mark\./);
  await page.getByRole("textbox", { name: "Title" }).fill("Lanterns");
  await expect(saveStatus(page)).toHaveText("Saved");
  await expect.poll(async () => (await state(request)).work.drawings.find((d) => d.id === id)?.title).toBe("Lanterns");
  saved = (await state(request)).work.drawings.find((d) => d.id === id)!;
  expect(saved.data.items.length).toBe(1);

  await page.reload();
  await expect(canvas(page)).toHaveAttribute("aria-label", /: 1 mark\./);
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("Lanterns");
  const pathsBefore = await canvas(page).locator("[data-drawing-items] path").evaluateAll((els) => els.map((e) => e.getAttribute("d")));
  expect(pathsBefore.length).toBe(1);

  // The shot card shows the sketch as a thumbnail that opens it.
  await openStory(page);
  await page.getByRole("link", { name: /Open Lanterns \(1 stroke\)/ }).click();
  await expect(page).toHaveURL(new RegExp(`/drawings/${id}$`));
});

test("once the Pencil is used, finger touches stop drawing (palm) until finger drawing is turned back on", async ({ page }) => {
  await openStory(page);
  await page.getByRole("button", { name: "Add a sketch to Shot 2" }).click();
  await expect(saveStatus(page)).toHaveText("Saved");
  const finger = page.getByRole("checkbox", { name: "Draw with finger" });
  await expect(finger).toBeChecked();
  await penStroke(page, [0.1, 0.1], [0.5, 0.1]);
  await expect(finger).not.toBeChecked();
  await penStroke(page, [0.1, 0.5], [0.5, 0.5], "touch");
  await expect(canvas(page)).toHaveAttribute("aria-label", /: 1 mark\./);
  await finger.check();
  await penStroke(page, [0.1, 0.8], [0.5, 0.8], "touch");
  await expect(canvas(page)).toHaveAttribute("aria-label", /: 2 marks\./);
});

test("an unsaved sketch survives a reload: kept on the device, offered back, then saved", async ({ page, request }) => {
  await openStory(page);
  await page.getByRole("button", { name: "Add a sketch to Shot 1" }).click();
  await expect(saveStatus(page)).toHaveText("Saved");
  const id = page.url().split("/").pop()!;
  // The Vault refuses saves for now (as if the connection dropped).
  await page.route("**/rest/v1/drawings**", (route) => (route.request().method() === "PATCH" ? route.abort("failed") : route.continue()));
  await penStroke(page, [0.2, 0.2], [0.8, 0.8]);
  await expect(saveStatus(page)).toHaveText(/Not saved: kept on this device|Offline/);
  expect((await state(request)).work.drawings.find((d) => d.id === id)!.data.items.length).toBe(0);
  await page.unroute("**/rest/v1/drawings**");
  page.removeAllListeners("dialog");
  page.on("dialog", (dialog) => dialog.accept()); // the "leave with unsaved changes?" prompt
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "This device has unsaved changes" })).toBeVisible();
  await page.getByRole("button", { name: "Restore unsaved changes" }).click();
  await expect(canvas(page)).toHaveAttribute("aria-label", /: 1 mark\./);
  await expect(saveStatus(page)).toHaveText("Saved");
  expect((await savedDrawing(request, id)).data.items.length).toBe(1);
});

test("two tabs editing one sketch: the second save becomes a copy, nothing is overwritten", async ({ page, request, context }) => {
  await openStory(page);
  await page.getByRole("button", { name: "Add a sketch to Shot 3" }).click();
  await expect(saveStatus(page)).toHaveText("Saved");
  const url = page.url();
  const id = url.split("/").pop()!;
  const other = await context.newPage();
  other.on("dialog", (dialog) => dialog.accept());
  await other.goto(url);
  await expect(saveStatus(other)).toHaveText("Saved");

  await penStroke(page, [0.1, 0.1], [0.9, 0.1]);
  await expect(saveStatus(page)).toHaveText("Saved");
  await penStroke(other, [0.1, 0.9], [0.9, 0.9]);
  await expect(other.getByRole("alert").filter({ hasText: "was changed somewhere else" })).toBeVisible();
  await other.getByRole("button", { name: "Save mine as a copy" }).click();
  await expect(other).not.toHaveURL(url);
  await expect(saveStatus(other)).toHaveText("Saved");
  const drawings = (await state(request)).work.drawings.filter((d) => d.unit_id === SHOTS[2]);
  expect(drawings.length).toBe(2);
  const original = drawings.find((d) => d.id === id)!;
  const copy = drawings.find((d) => d.id !== id)!;
  expect(original.data.items.length).toBe(1);
  expect(copy.data.items.length).toBe(1);
  expect(copy.title).toMatch(/copy from this device/);
  await other.close();
});

test("storyboard: drag a shot to reorder (persists), arrows still work, a shot with sketches can't be deleted", async ({ page, request }) => {
  await openStory(page);
  const structure = page.getByRole("region", { name: "Structure" });
  const shotTitles = async () => structure.locator("[data-reorder-id] h4").allInnerTexts();
  await expect.poll(shotTitles).toEqual(["SHOT\nShot 1", "SHOT\nShot 2", "SHOT\nShot 3"].map((t) => t.replace("SHOT\n", "Shot")));
  const drag = async (from: string, to: string) => {
    const handle = structure.getByRole("button", { name: `Drag ${from} to reorder; the up and down buttons do the same` });
    const target = structure.locator(`[data-reorder-id="${to}"]`);
    await target.scrollIntoViewIfNeeded();
    await handle.scrollIntoViewIfNeeded();
    const a = (await handle.boundingBox())!, b = (await target.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole("status").filter({ hasText: "Moved." })).toBeVisible();
  };
  await drag("Shot 1", SHOTS[2]);
  await page.reload();
  await page.getByRole("navigation", { name: "Project sections" }).getByRole("button", { name: "Structure", exact: true }).click();
  const order = async () => (await state(request)).work.story_units.filter((u) => SHOTS.includes(u.id)).sort((a, b) => a.position - b.position).map((u) => u.title);
  await expect.poll(order).toEqual(["Shot 2", "Shot 3", "Shot 1"]);
  await structure.getByRole("button", { name: "Move Shot 1 up" }).click();
  await expect.poll(order).toEqual(["Shot 2", "Shot 1", "Shot 3"]);

  await structure.getByRole("button", { name: "Add a sketch to Shot 2" }).click();
  await expect(saveStatus(page)).toHaveText("Saved");
  await openStory(page);
  const card = structure.locator(`[data-reorder-id="${SHOTS[1]}"]`);
  await card.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("alert").or(page.getByRole("status")).filter({ hasText: "still contains or is linked" })).toBeVisible();
  expect((await state(request)).work.story_units.some((u) => u.id === SHOTS[1])).toBe(true);
});

test("a background image sits under the strokes and export makes a new PNG on the shot; the image is unchanged", async ({ page, request }) => {
  await page.goto("/vault/settings");
  await page.getByRole("link", { name: "Connect Google Drive" }).click();
  await expect(page).toHaveURL(/drive=connected/);
  expect(await page.evaluate(async (id) => (await fetch("/api/drive/folder", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }) })).status, FOLDER)).toBe(200);
  const linked = await page.evaluate(async (body) => (await fetch("/api/drive/project-files", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json(), { projectId: PROJECT, driveFileIds: ["fixture-img-000001"] });
  const image = linked.linked[0] as { id: string; md5: string | null; name: string };

  await openStory(page);
  await page.getByRole("button", { name: "Add a sketch to Shot 1" }).click();
  await expect(saveStatus(page)).toHaveText("Saved");
  const id = page.url().split("/").pop()!;
  await page.getByRole("combobox", { name: "Background" }).selectOption({ label: "castle.png" });
  await expect(canvas(page).locator("image")).toHaveAttribute("href", `/api/drive/file/${image.id}`);
  await penStroke(page, [0.2, 0.5], [0.8, 0.5]);
  await expect(saveStatus(page)).toHaveText("Saved");
  expect((await savedDrawing(request, id)).data.bg).toBe(image.id);

  await page.getByRole("button", { name: "Export PNG to Drive" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Exported ".+ sketch\.png" to Google Drive/ })).toBeVisible();
  const files = (await state(request)).simple.project_files;
  const exported = files.find((f) => f.name.endsWith("sketch.png"))!;
  expect(exported.unit_id).toBe(SHOTS[0]);
  const original = files.find((f) => f.id === image.id)!;
  expect([original.name, original.md5, original.unit_id]).toEqual([image.name, image.md5, null]);
});

test("drawings can't be read or written without the owner's session", async ({ page, request }) => {
  await openStory(page);
  await page.getByRole("button", { name: "Add a sketch to Shot 1" }).click();
  await expect(saveStatus(page)).toHaveText("Saved");
  const drawingUrl = page.url();
  await page.context().clearCookies();
  const anonymous = await request.get(drawingUrl, { maxRedirects: 0 });
  expect([302, 303, 307]).toContain(anonymous.status());
  expect(anonymous.headers().location).toMatch(/\/login/);
  const rest = await request.get(`${API}/rest/v1/drawings?select=*`, { headers: { apikey: "synthetic-publishable-key" } });
  expect(rest.status() >= 400 || (await rest.json()).length === 0).toBe(true);
});
