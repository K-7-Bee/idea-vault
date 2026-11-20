import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Phase 3D (Story Studio images) against the synthetic fixture and synthetic Google. Picker results
// are sent through the same link route the real Picker uses (its script is external and blocked).
const API = "http://127.0.0.1:4317";
const FOLDER = "fixture-folder-0001";
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };
type PF = { id: string; name: string; character_id: string | null; unit_id: string | null; is_main: boolean; state: string; drive_file_id: string };
type State = { simple: { project_files: PF[] }; google: { calls: string[]; files: { id: string; parents?: string[] }[] };
  work: Record<string, { id: string; name?: string; title?: string; kind?: string }[]> };

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function control(request: APIRequestContext, data: object) {
  expect((await request.post(`${API}/_test/control`, { headers: controlHeaders, data })).ok()).toBeTruthy();
}
async function state(request: APIRequestContext): Promise<State> {
  return (await request.get(`${API}/_test/state`, { headers: controlHeaders })).json();
}
async function login(page: Page, account = "owner") {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(`${account}@fixture.invalid`);
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  if (account === "owner") await expect(page.getByRole("heading", { name: "Workspace overview" })).toBeVisible();
  else await expect(page).toHaveURL(/denied=1/);
}
async function connectDrive(page: Page) {
  await page.goto("/vault/settings");
  await page.getByRole("link", { name: "Connect Google Drive" }).click();
  await expect(page).toHaveURL(/drive=connected/);
  const status = await page.evaluate(async (id) => (await fetch("/api/drive/folder", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })).status, FOLDER);
  expect(status).toBe(200);
}
const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const tabs = (page: Page) => page.getByRole("navigation", { name: "Project sections" });
const status = (page: Page, text: string | RegExp) => page.locator('[role="status"], [role="alert"]:not(#__next-route-announcer__)').filter({ hasText: text });
async function storyProject(page: Page, title: string) {
  await page.goto("/vault/story");
  await page.getByRole("button", { name: "+ New project" }).click();
  await page.getByRole("textbox", { name: "Project title" }).fill(title);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();
  return page.url().split("/").pop()!.split("#")[0];
}
async function addRecord(page: Page, region: string, button: string, fill: Record<string, string>, selects: Record<string, string> = {}) {
  const area = section(page, region);
  await area.getByRole("button", { name: button }).click();
  for (const [label, value] of Object.entries(selects)) await area.getByRole("combobox", { name: label }).first().selectOption({ label: value });
  for (const [label, value] of Object.entries(fill)) await area.getByLabel(label, { exact: true }).first().fill(value);
  await area.getByRole("button", { name: button.replace("+ ", "") }).last().click();
  await expect(page.getByRole("status").filter({ hasText: "Added" })).toBeVisible();
}
async function link(page: Page, body: object) {
  return page.evaluate(async (data) => {
    const r = await fetch("/api/drive/project-files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    return { status: r.status, body: await r.json() };
  }, body);
}
async function patch(page: Page, id: string, body: object, origin?: string) {
  return page.evaluate(async ({ id, body }) => {
    const r = await fetch(`/api/drive/project-files/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, { id, body, origin });
}
const thumbs = (s: State) => s.google.calls.filter((c) => c.startsWith("GET /thumb/")).length;

test.beforeEach(async ({ request, context, page }) => {
  expect((await request.post(`${API}/_test/reset`, { headers: controlHeaders })).ok()).toBeTruthy();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port)) await route.continue();
    else await route.abort("blockedbyclient");
  });
  page.on("dialog", (dialog) => dialog.accept());
});

test("a character gets a portrait by upload and by link; the first image is main, Make main swaps, previews are Drive thumbnails", async ({ page, request }) => {
  await login(page);
  await connectDrive(page);
  const projectId = await storyProject(page, "Storm Road");
  await tabs(page).getByRole("button", { name: "Characters" }).click();
  await addRecord(page, "Characters", "+ Add character", { Name: "Mira" });
  const card = page.locator("li", { has: page.getByRole("heading", { name: "Mira" }) });

  await card.getByLabel("Images for Mira").setInputFiles([{ name: "mira.png", mimeType: "image/png", buffer: PNG }]);
  await expect(status(page, "Uploaded to Google Drive: mira.png")).toBeVisible();
  let s = await state(request);
  const mira = s.work.story_characters[0];
  const uploaded = s.simple.project_files.find((f) => f.name === "mira.png")!;
  expect(uploaded.character_id).toBe(mira.id);
  const folder = s.google.files.find((g) => g.id === uploaded.drive_file_id)!.parents![0];
  expect(s.google.files.some((g) => g.id === folder)).toBe(true); // uploaded into the project folder, as in 3C

  const portrait = card.getByRole("img", { name: "Mira: mira.png" });
  await expect(portrait).toBeVisible();
  await expect(portrait).toHaveAttribute("src", `/api/drive/file/${uploaded.id}?size=thumb`);
  await expect.poll(async () => thumbs(await state(request))).toBeGreaterThan(0);
  const thumb = await page.request.get(`/api/drive/file/${uploaded.id}?size=thumb`);
  expect(thumb.headers()["content-type"]).toBe("image/png");
  // Previews stay only in the owner's own browser, for 5 minutes; never in a shared cache.
  expect(thumb.headers()["cache-control"]).toBe("private, max-age=300");
  const missing = await page.request.get(`/api/drive/file/00000000-0000-4000-8000-000000000000?size=thumb`);
  expect(missing.status()).toBe(404);
  expect(missing.headers()["cache-control"]).toContain("no-store");

  // A second image, linked from Drive (as the Picker would), goes in the strip.
  const linked = await link(page, { projectId, characterId: mira.id, driveFileIds: ["fixture-img-000001"] });
  expect(linked.status).toBe(200);
  await page.reload();
  await tabs(page).getByRole("button", { name: "Characters" }).click();
  await expect(card.getByRole("img", { name: "Mira: mira.png" })).toBeVisible();
  const strip = card.getByRole("list", { name: "More images of Mira" });
  await expect(strip.getByRole("img", { name: "Mira: castle.png" })).toBeVisible();

  await strip.getByRole("button", { name: "Make castle.png the main image of Mira" }).click();
  await expect(status(page, '"castle.png" is now the main image.')).toBeVisible();
  await expect(card.getByRole("list", { name: "More images of Mira" }).getByRole("img", { name: "Mira: mira.png" })).toBeVisible();
  s = await state(request);
  expect(s.simple.project_files.filter((f) => f.is_main).map((f) => f.name)).toEqual(["castle.png"]);
});

test("a shot shows its frame inside its scene; the Gallery filters by character and by shot", async ({ page, request }) => {
  await login(page);
  await connectDrive(page);
  const projectId = await storyProject(page, "Gallery saga");
  await tabs(page).getByRole("button", { name: "Characters" }).click();
  await addRecord(page, "Characters", "+ Add character", { Name: "Oren" });
  await tabs(page).getByRole("button", { name: "Structure" }).click();
  await addRecord(page, "Structure", "+ Add item", { Title: "The market" }, { Level: "Scene" });
  await page.locator("li", { hasText: "The market" }).last().getByRole("button", { name: "+ Add inside" }).click();
  const structure = section(page, "Structure");
  await structure.getByLabel("Title", { exact: true }).fill("Close on Oren");
  await structure.getByRole("button", { name: "Add item" }).last().click();
  await expect(page.getByRole("heading", { name: /Shot\s*Close on Oren/ })).toBeVisible();

  const s = await state(request);
  const shot = s.work.story_units.find((u) => u.kind === "shot")!;
  const oren = s.work.story_characters[0];
  expect((await link(page, { projectId, unitId: shot.id, driveFileIds: ["fixture-img-000002"] })).status).toBe(200);
  expect((await link(page, { projectId, characterId: oren.id, driveFileIds: ["fixture-img-000001"] })).status).toBe(200);
  expect((await link(page, { projectId, driveFileIds: ["fixture-doc-000001"] })).status).toBe(200); // not an image

  await page.reload();
  await tabs(page).getByRole("button", { name: "Structure" }).click();
  const scene = page.locator("li", { has: page.getByRole("heading", { name: /Scene\s*The market/ }) });
  await expect(scene.getByRole("img", { name: "Close on Oren: forest.png" })).toBeVisible();

  await tabs(page).getByRole("button", { name: /^Files/ }).click();
  await page.getByRole("group", { name: "Files view" }).getByRole("button", { name: "Gallery" }).click();
  const gallery = page.getByRole("region", { name: "Gallery" });
  await expect(gallery.getByRole("img")).toHaveCount(2); // the text file is not in the gallery
  await gallery.getByRole("combobox", { name: "Gallery filter" }).selectOption({ label: "Character: Oren" });
  await expect(gallery.getByRole("img")).toHaveCount(1);
  await expect(gallery.getByRole("img", { name: "castle.png" })).toBeVisible();
  await gallery.getByRole("combobox", { name: "Gallery filter" }).selectOption({ label: "Shot: Close on Oren" });
  await expect(gallery.getByRole("img", { name: "forest.png" })).toBeVisible();
  await expect(gallery.getByText("Shot: Close on Oren · Main image")).toHaveCount(0); // main is implicit until chosen
});

test("a trashed image shows a placeholder and the card text stays; deleting the character keeps the file", async ({ page, request }) => {
  await login(page);
  await connectDrive(page);
  const projectId = await storyProject(page, "Placeholder saga");
  await tabs(page).getByRole("button", { name: "Characters" }).click();
  await addRecord(page, "Characters", "+ Add character", { Name: "Ash", "Role (optional)": "Mentor" });
  const ash = (await state(request)).work.story_characters[0];
  expect((await link(page, { projectId, characterId: ash.id, driveFileIds: ["fixture-img-000001"] })).status).toBe(200);
  await control(request, { googleFile: { id: "fixture-img-000001", changes: { trashed: true } } });

  // Before Check files: the preview fails to load and falls back to the placeholder.
  await page.reload();
  await tabs(page).getByRole("button", { name: "Characters" }).click();
  const card = page.locator("li", { has: page.getByRole("heading", { name: "Ash" }) });
  await expect(card.getByRole("img", { name: "Image unavailable: castle.png" })).toBeVisible();
  await expect(card.getByText("Mentor")).toBeVisible();
  const file = (await state(request)).simple.project_files[0];
  expect((await page.request.get(`/api/drive/file/${file.id}?size=thumb`)).status()).toBe(404);

  // After Check files: the stored state explains why.
  await tabs(page).getByRole("button", { name: /^Files/ }).click();
  await page.getByRole("button", { name: "Check files" }).click();
  await expect(status(page, "1 unavailable")).toBeVisible();
  await tabs(page).getByRole("button", { name: "Characters" }).click();
  await expect(card.getByText("In the Drive trash")).toBeVisible();

  await card.getByRole("button", { name: "Delete" }).click();
  await expect(status(page, "Deleted character.")).toBeVisible();
  const after = (await state(request)).simple.project_files;
  expect(after).toHaveLength(1);
  expect(after[0]).toMatchObject({ character_id: null, is_main: false });
});

test("story image routes refuse other records, two records at once, anon, other accounts and cross-origin requests", async ({ page, request, browser }) => {
  await login(page);
  await connectDrive(page);
  const projectId = await storyProject(page, "Guarded saga");
  await tabs(page).getByRole("button", { name: "Characters" }).click();
  await addRecord(page, "Characters", "+ Add character", { Name: "Kai" });
  const kai = (await state(request)).work.story_characters[0];
  const loose = await link(page, { projectId, driveFileIds: ["fixture-img-000001"] });
  const fileId = loose.body.linked[0].id as string;

  expect((await patch(page, fileId, { main: true })).body).toEqual({ error: "not_attached" }); // not attached to a card yet
  expect((await patch(page, fileId, { characterId: kai.id, unitId: kai.id })).status).toBe(400);
  expect((await patch(page, fileId, { characterId: "77777777-7777-4777-8777-777777777777" })).status).toBe(404);
  expect((await link(page, { projectId, characterId: kai.id, unitId: kai.id, driveFileIds: ["fixture-img-000002"] })).status).toBe(400);
  expect((await patch(page, fileId, { characterId: kai.id })).status).toBe(200);
  expect((await patch(page, fileId, { main: true })).status).toBe(200);

  const anon = await request.get(`http://127.0.0.1:4318/api/drive/file/${fileId}?size=thumb`);
  expect(anon.status()).toBe(401);
  const cross = await request.patch(`http://127.0.0.1:4318/api/drive/project-files/${fileId}`, {
    headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, data: { main: true } });
  expect(cross.status()).toBe(403);

  const other = await browser.newContext();
  await other.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port)) await route.continue();
    else await route.abort("blockedbyclient");
  });
  const otherPage = await other.newPage();
  await login(otherPage, "other");
  expect((await otherPage.request.get(`/api/drive/file/${fileId}?size=thumb`)).status()).toBeGreaterThanOrEqual(400);
  await other.close();
  expect((await state(request)).simple.project_files[0]).toMatchObject({ character_id: kai.id, is_main: true });
});

test("story image cards and the gallery fit phone, tablet and desktop widths", async ({ page, request }) => {
  await login(page);
  await connectDrive(page);
  const projectId = await storyProject(page, "Wide saga");
  await tabs(page).getByRole("button", { name: "Characters" }).click();
  await addRecord(page, "Characters", "+ Add character", { Name: "Lin" });
  const lin = (await state(request)).work.story_characters[0];
  const linked = await link(page, { projectId, characterId: lin.id, driveFileIds: ["fixture-img-000001", "fixture-img-000002"] });
  expect(linked).toMatchObject({ status: 200, body: { skipped: [] } });
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/vault/projects/${projectId}#characters`);
    await page.reload(); // a hash-only navigation keeps the old page state
    await expect(page.getByRole("img", { name: "Lin: castle.png" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto(`/vault/projects/${projectId}#files`);
    await page.reload();
    await page.getByRole("group", { name: "Files view" }).getByRole("button", { name: "Gallery" }).click();
    await expect(page.getByRole("region", { name: "Gallery" }).getByRole("img")).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
