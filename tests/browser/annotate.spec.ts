import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Phase 7B: annotation layers over project images, against the synthetic fixture and synthetic
// Google. The image file is never changed: marks are a separate drawing; export makes a new file.
const API = "http://127.0.0.1:4317";
const FOLDER = "fixture-folder-0001";
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };
const PROJECT = "d7b00000-0000-4000-8000-000000000001";
const CHARACTER = "d7b10000-0000-4000-8000-000000000001";
type PF = { id: string; name: string; md5: string | null; character_id: string | null; drive_file_id: string; size: number | null };
type Item = { t: string; text?: string };
type State = { simple: { project_files: PF[] }; work: { drawings: { id: string; base_file_id: string | null; aspect: string; version: number; data: { w: number; h: number; items: Item[] } }[] };
  google: { calls: string[] } };

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
async function openTab(page: Page, name: string) {
  await page.goto(`/vault/projects/${PROJECT}`);
  await expect(async () => {
    await page.getByRole("navigation", { name: "Project sections" }).getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Project sections" }).getByRole("button", { name, exact: true })).toHaveAttribute("aria-current", /.+/, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}
const canvas = (page: Page) => page.getByRole("img", { name: /canvas/ });
const saveStatus = (page: Page) => page.getByRole("status").filter({ hasText: /^(Saved|Saving…|Unsaved changes|Offline|Not saved)/ });
async function penStroke(page: Page, from: [number, number], to: [number, number]) {
  await canvas(page).evaluate((svg, { from, to }) => {
    const box = svg.getBoundingClientRect();
    const at = (t: number) => ({ clientX: box.left + box.width * (from[0] + (to[0] - from[0]) * t), clientY: box.top + box.height * (from[1] + (to[1] - from[1]) * t) });
    const fire = (type: string, t: number) => svg.dispatchEvent(new PointerEvent(type, { pointerId: 51, pointerType: "pen", isPrimary: true, bubbles: true, cancelable: true, pressure: 0.5, button: 0, buttons: 1, ...at(t) }));
    fire("pointerdown", 0);
    for (let i = 1; i <= 8; i++) fire("pointermove", i / 8);
    fire("pointerup", 1);
  }, { from, to });
}

test.beforeEach(async ({ request, context, page }) => {
  expect((await request.post(`${API}/_test/reset`, { headers: controlHeaders })).ok()).toBeTruthy();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    // blob: and data: are in-page images (the PNG export); WebKit routes them, Chromium doesn't.
    if (["blob:", "data:"].includes(url.protocol) || (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port))) await route.continue();
    else await route.abort("blockedbyclient");
  });
  page.on("dialog", (dialog) => dialog.accept());
  await control(request, { seed: {
    projects: [{ id: PROJECT, title: "Harbour story", project_type: "story", stage: "exploring" }],
    story_characters: [{ id: CHARACTER, project_id: PROJECT, name: "Mira", role: "Lead", description: "", traits: "", arc: "", position: 1 }],
  } });
  await login(page);
  // The Settings page tidies "?drive=connected" out of the address quickly (WebKit before a later
  // check could see it), so wait for the navigation itself.
  await page.goto("/vault/settings");
  await page.waitForLoadState("networkidle");
  await Promise.all([page.waitForURL(/drive=connected/), page.getByRole("link", { name: "Connect Google Drive" }).click()]);
  expect(await page.evaluate(async (id) => (await fetch("/api/drive/folder", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }) })).status, FOLDER)).toBe(200);
  const linked = await page.evaluate(async (body) => (await fetch("/api/drive/project-files", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json(), { projectId: PROJECT, driveFileIds: ["fixture-img-000001"], characterId: CHARACTER });
  expect(linked.linked.length).toBe(1);
});

test("annotate a character image: pen, arrow and label over it; reload identical; the original is untouched; export is a new file", async ({ page, request }) => {
  const before = (await state(request)).simple.project_files[0];
  await openTab(page, "Files");
  await page.getByRole("button", { name: "Annotate castle.png" }).click();
  await expect(page).toHaveURL(/\/drawings\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("castle.png");
  await expect(canvas(page).locator("image")).toHaveAttribute("href", `/api/drive/file/${before.id}`);
  // Annotations have no shape picker or background: the image sets the shape.
  await expect(page.getByRole("combobox", { name: "Shape" })).toHaveCount(0);
  const layer = (await state(request)).work.drawings.find((d) => d.id === id)!;
  expect([layer.aspect, layer.base_file_id, layer.data.w, layer.data.h]).toEqual(["image", before.id, 1600, 1600]); // the fixture PNG is square

  await penStroke(page, [0.2, 0.2], [0.6, 0.4]);
  await page.getByRole("button", { name: "Arrow" }).click();
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Label" }).click();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.8);
  await page.getByRole("textbox", { name: "Label text" }).fill("Gate <b>& tower</b>");
  await page.getByRole("button", { name: "Add label" }).click();
  await expect(canvas(page)).toHaveAttribute("aria-label", /: 3 marks\./);
  await expect(saveStatus(page)).toHaveText("Saved");
  await expect.poll(async () => (await state(request)).work.drawings.find((d) => d.id === id)!.data.items.map((i) => i.t)).toEqual(["pen", "arrow", "label"]);
  // Label text is stored and shown as text, never as markup.
  await expect(canvas(page).locator("text")).toHaveText("Gate <b>& tower</b>");

  await page.reload();
  await expect(canvas(page)).toHaveAttribute("aria-label", /: 3 marks\./);

  await page.getByRole("button", { name: "Export PNG to Drive" }).click();
  await expect(page.getByRole("status").filter({ hasText: 'Exported "castle (annotated).png"' })).toBeVisible();
  const after = await state(request);
  const original = after.simple.project_files.find((f) => f.id === before.id)!;
  expect(original).toEqual(before);
  const exported = after.simple.project_files.find((f) => f.name === "castle (annotated).png")!;
  expect(exported.character_id).toBe(CHARACTER);
  expect(exported.drive_file_id).not.toBe(before.drive_file_id);
  // Nothing wrote to the original Drive file.
  expect(after.google.calls.filter((c) => c.includes(before.drive_file_id) && !c.startsWith("GET"))).toEqual([]);
});

test("annotated images show their marks with a toggle, open for editing, and can't be removed until the annotations are deleted", async ({ page, request }) => {
  await openTab(page, "Files");
  await page.getByRole("button", { name: "Annotate castle.png" }).click();
  await expect(saveStatus(page)).toHaveText("Saved");
  const id = page.url().split("/").pop()!;
  await penStroke(page, [0.1, 0.5], [0.9, 0.5]);
  await expect(saveStatus(page)).toHaveText("Saved");

  await openTab(page, "Files");
  await page.getByRole("group", { name: "Files view" }).getByRole("button", { name: "Gallery" }).click();
  const gallery = page.getByRole("region", { name: "Gallery" });
  await expect(gallery.getByRole("img", { name: /Annotations: castle\.png \(1 stroke\)/ })).toBeVisible();
  await gallery.getByRole("button", { name: "Hide annotations on castle.png" }).click();
  await expect(gallery.getByRole("img", { name: /Annotations:/ })).toHaveCount(0);
  await gallery.getByRole("button", { name: "Show annotations on castle.png" }).click();
  await expect(gallery.getByRole("img", { name: /Annotations:/ })).toBeVisible();

  await gallery.getByRole("button", { name: "Remove castle.png from this project" }).click();
  await expect(page.getByRole("alert").or(page.getByRole("status")).filter({ hasText: '"castle.png" has annotations' })).toBeVisible();
  expect((await state(request)).simple.project_files.length).toBe(1);

  await gallery.getByRole("link", { name: "Edit annotations on castle.png" }).click();
  await expect(page).toHaveURL(new RegExp(`/drawings/${id}$`));
  await page.getByRole("button", { name: "Delete annotations" }).click();
  await expect(page).toHaveURL(new RegExp(`/vault/projects/${PROJECT}$`));
  expect((await state(request)).work.drawings.length).toBe(0);
  await openTab(page, "Files");
  await page.getByRole("button", { name: "Remove castle.png from this project" }).click();
  await expect(page.getByRole("status").filter({ hasText: 'Removed "castle.png"' })).toBeVisible();
});
