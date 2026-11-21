import { test, expect, type Page, type APIRequestContext, type Browser } from "@playwright/test";
import sharp from "sharp";

// Phase 4D (the Journal) against the synthetic fixture, which imitates migration 016. Not live
// Supabase; the database rules are tested in tests/sql/phase4d-behaviour.sql.
// The homepage's cached Journal count lives for the whole run and earlier spec files never publish
// an entry, so the first test here sees the homepage without a Journal link; it must stay first.
const API = "http://127.0.0.1:4317";
const APP = "http://127.0.0.1:4318";
const OWNER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "dddddddd-0000-4000-8000-000000000001";
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };

async function control(request: APIRequestContext, data: object) {
  expect((await request.post(`${API}/_test/control`, { headers: controlHeaders, data })).ok()).toBeTruthy();
}
async function state(request: APIRequestContext) {
  return (await request.get(`${API}/_test/state`, { headers: controlHeaders })).json();
}
async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill("owner@fixture.invalid");
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workspace overview" })).toBeVisible();
}
const status = (page: Page, text: string | RegExp) => page.locator('[role="status"], [role="alert"]:not(#__next-route-announcer__)').filter({ hasText: text });
const group = (page: Page, name: string | RegExp) => page.getByRole("group", { name });
const nav = (page: Page) => page.getByRole("navigation", { name: "Sections" });

async function visitor(browser: Browser) {
  const context = await browser.newContext({ baseURL: APP });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port)) await route.continue();
    else await route.abort("blockedbyclient");
  });
  return context;
}
async function newEntry(page: Page) {
  await page.goto("/vault/portfolio/journal");
  await page.getByRole("button", { name: "New entry" }).click();
  await expect(page).toHaveURL(/\/vault\/portfolio\/journal\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Untitled entry", level: 2 })).toBeVisible();
  await page.waitForLoadState("networkidle"); // hydrated before typing and picking files
}
async function write(page: Page, title: string, body: string) {
  const entry = group(page, "Entry");
  await entry.getByRole("textbox", { name: "Title" }).fill(title);
  await entry.getByRole("textbox", { name: /^Text/ }).fill(body);
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(status(page, "Entry saved.")).toBeVisible();
}
async function publish(page: Page) {
  await page.getByRole("button", { name: /^Review and publish/ }).click();
  await page.getByRole("group", { name: "Confirm publishing this entry" }).getByRole("button", { name: "Publish now" }).click();
  await expect(status(page, "Published. The entry is on your site now.")).toBeVisible();
}

test.beforeEach(async ({ request, context, page }) => {
  expect((await request.post(`${API}/_test/reset`, { headers: controlHeaders })).ok()).toBeTruthy();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port)) await route.continue();
    else await route.abort("blockedbyclient");
  });
});

test("write, preview and publish an entry: /journal and the homepage link appear; unpublishing removes both", async ({ page, request, browser }) => {
  const anon = await visitor(browser);
  const v = await anon.newPage();
  await v.goto("/");
  await expect(nav(v).getByRole("link", { name: "Projects", exact: true })).toBeAttached();
  await expect(nav(v).getByRole("link", { name: "Journal", exact: true })).toHaveCount(0);
  await v.goto("/journal");
  await expect(v.getByText("This page could not be found.")).toBeVisible();
  await expect(v.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();

  await login(page);
  await page.goto("/vault/portfolio");
  await page.getByRole("link", { name: /^Journal/ }).click();
  await expect(page.getByText("Nothing published; the Journal is hidden on your site.")).toBeVisible();
  await newEntry(page);
  await write(page, "Why my fuse blew", "The supply was fine.\n\nThe inrush current was not.");
  await group(page, "Entry").getByRole("textbox", { name: /^Date/ }).fill("March 2026");
  await group(page, "Entry").getByRole("textbox", { name: /^Summary/ }).fill("A lesson about inrush current.");
  await group(page, "Entry").getByRole("textbox", { name: /^Address/ }).click();
  await expect(group(page, "Entry").getByRole("textbox", { name: /^Address/ })).toHaveValue("why-my-fuse-blew");
  await save(page);
  expect((await state(request)).journal.published).toHaveLength(0);

  const [preview] = await Promise.all([page.waitForEvent("popup"), page.getByRole("link", { name: /Preview/ }).click()]);
  await expect(preview.getByText("Preview of the saved journal entry (version 2)")).toBeVisible();
  await expect(preview.getByRole("heading", { name: "Why my fuse blew", level: 1 })).toBeVisible();
  const previewMain = await preview.locator("main").innerText();
  await preview.close();
  await v.goto("/journal/why-my-fuse-blew");
  await expect(v.getByText("This page could not be found.")).toBeVisible();

  await publish(page);
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await v.goto("/");
  await expect(nav(v).getByRole("link", { name: "Journal", exact: true })).toHaveAttribute("href", "/journal");
  await v.goto("/journal");
  const list = v.getByRole("list", { name: "Journal entries" });
  await expect(list.getByRole("link", { name: "Why my fuse blew" })).toBeVisible();
  await expect(list.getByText("A lesson about inrush current.")).toBeVisible();
  await list.getByRole("link", { name: "Why my fuse blew" }).click();
  await expect(v).toHaveURL(/\/journal\/why-my-fuse-blew$/);
  await expect(v.getByText("The inrush current was not.")).toBeVisible();
  await v.reload(); // a fresh load, so the list page's <main> is gone before comparing
  expect(await v.locator("main").innerText()).toBe(previewMain);

  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await page.getByRole("group", { name: "Confirm unpublishing this entry" }).getByRole("button", { name: "Unpublish now" }).click();
  await expect(status(page, "Unpublished. The entry is off your site.")).toBeVisible();
  await v.goto("/journal/why-my-fuse-blew");
  await expect(v.getByText("This page could not be found.")).toBeVisible();
  await v.goto("/");
  await expect(nav(v).getByRole("link", { name: "Journal", exact: true })).toHaveCount(0);
  expect((await state(request)).journal.entries, "the draft is kept").toHaveLength(1);
  await anon.close();
});

test("a linked private project is never named; it is while its showcase is public, and not after", async ({ page, request, browser }) => {
  await control(request, { seed: {
    projects: [{ id: PROJECT, title: "Secret robot arm" }],
    project_entries: [{ id: "eeeeeeee-0000-4000-8000-0000000000a1", project_id: PROJECT, kind: "lesson", title: "Torque lesson", body: "The gearbox slipped under load." }],
  } });
  await login(page);
  await newEntry(page);
  await group(page, "Project").getByRole("combobox", { name: "Part of" }).selectOption({ label: "Secret robot arm (not public)" });
  await expect(page.getByText("This project isn't on your public site, so the published entry won't name it.")).toBeVisible();
  await page.getByText(/Copy text from one of this project's Lab entries/).click();
  await page.getByRole("button", { name: /^Copy into this entry\s*: Torque lesson$/ }).click();
  await expect(group(page, "Entry").getByRole("textbox", { name: "Title" })).toHaveValue("Torque lesson");
  await expect(group(page, "Entry").getByRole("textbox", { name: /^Text/ })).toHaveValue("The gearbox slipped under load.");
  await group(page, "Entry").getByRole("textbox", { name: /^Address/ }).fill("torque-lesson");
  await save(page);
  await publish(page);

  const anon = await visitor(browser);
  const v = await anon.newPage();
  await v.goto("/journal/torque-lesson");
  await expect(v.getByText("The gearbox slipped under load.")).toBeVisible();
  await expect(v.getByText("Part of")).toHaveCount(0);
  for (const path of ["/journal/torque-lesson", "/journal"]) {
    const html = await (await v.request.get(path)).text();
    for (const secret of ["Secret robot arm", PROJECT, OWNER]) expect(html, `${path} leaks ${secret}`).not.toContain(secret);
  }
  const rows = await (await v.request.post(`${API}/rest/v1/rpc/journal_public`, { data: {} })).json();
  expect(Object.keys(rows[0]).sort()).toEqual(["body", "entry_date", "images", "project_slug", "project_title", "published_at", "slug", "summary", "title", "updated_at"]);

  await control(request, { seed: { showcases: [{ project_id: PROJECT, slug: "robot-arm", title: "Robot arm" }] } });
  await v.reload();
  await expect(v.getByRole("link", { name: "Robot arm" })).toHaveAttribute("href", "/projects/robot-arm");
  await control(request, { unpublishShowcase: PROJECT });
  await v.reload();
  await expect(v.getByText("Part of")).toHaveCount(0);
  await anon.close();
});

test("images: described, published as metadata-free copies, and protected while in use", async ({ page, request, browser }) => {
  const photo = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#36a" } }).jpeg()
    .withExif({ IFD0: { Artist: "Ada Secret" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "35/1 49/1 0/1" } }).toBuffer();
  await login(page);
  await newEntry(page);
  await write(page, "Bench photo", "My bench.");
  await group(page, "Entry").getByRole("textbox", { name: /^Address/ }).fill("bench-photo");
  await group(page, "Images").getByRole("button", { name: "Add an image" }).click();
  await page.getByRole("dialog").getByLabel("Upload a new image").setInputFiles({ name: "bench.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.getByRole("dialog")).toBeHidden();
  await save(page);
  await expect(page.getByRole("list", { name: "Before you can publish" }).getByText("Describe image 1 for people who can't see it.")).toBeVisible();
  await group(page, "Image 1").getByRole("textbox", { name: "Describe the image" }).fill("My workbench");
  await save(page);
  await publish(page);

  const s = await state(request);
  expect(s.library.public).toHaveLength(1);
  const copy = s.library.public[0].name;
  expect(s.journal.published[0].images).toEqual([{ file: copy, alt: "My workbench" }]);
  const anon = await visitor(browser);
  const v = await anon.newPage();
  await v.goto("/journal/bench-photo");
  await expect(v.getByRole("img", { name: "My workbench" })).toHaveAttribute("src", `${API}/storage/v1/object/public/profile-files/${copy}`);
  const served = Buffer.from(await (await v.request.get(`${API}/storage/v1/object/public/profile-files/${copy}`)).body());
  expect((await sharp(served).metadata()).exif).toBeUndefined();
  expect(served.includes("Ada Secret")).toBe(false);
  await anon.close();

  // Clean-up keeps a copy a published entry uses, however old.
  await control(request, { publicFileAge: 10 * 60_000 });
  await page.goto("/vault/portfolio/files");
  await page.waitForLoadState("networkidle");
  const item = page.getByRole("list", { name: "Library files" }).getByRole("listitem").filter({ hasText: "bench.jpg" });
  await expect(item.getByText("On your public site")).toBeVisible();
  await expect(item.getByRole("button", { name: /Delete/ })).toHaveCount(0);
  expect((await state(request)).library.public).toHaveLength(1);
});

test("guards: a published entry keeps its address and can't be deleted; drafts and routes stay private", async ({ page, request, browser }) => {
  await login(page);
  await newEntry(page);
  await write(page, "Guarded", "Text.");
  await group(page, "Entry").getByRole("textbox", { name: /^Address/ }).fill("guarded");
  await save(page);
  await page.getByRole("button", { name: "Delete entry" }).click();
  await expect(page.getByRole("group", { name: "Confirm deleting this entry" })).toBeVisible();
  await page.getByRole("group", { name: "Confirm deleting this entry" }).getByRole("button", { name: "Cancel" }).click();
  await publish(page);
  await expect(group(page, "Entry").getByRole("textbox", { name: /^Address/ })).toBeDisabled();
  await expect(page.getByText("Published entries keep their address. Unpublish to change it.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete entry" })).toHaveCount(0);

  // An edit after publishing shows as unpublished changes until republished.
  await group(page, "Entry").getByRole("textbox", { name: /^Text/ }).fill("Text, revised.");
  await save(page);
  await page.goto("/vault/portfolio/journal");
  await expect(page.getByText("Published, with unpublished changes")).toBeVisible();

  const anon = await visitor(browser);
  const v = await anon.newPage();
  await v.goto("/journal/guarded");
  await expect(v.getByText("Text.", { exact: true })).toBeVisible();
  await expect(v.getByText("Text, revised.")).toHaveCount(0);
  await v.goto("/vault/portfolio/journal");
  await expect(v).toHaveURL(/\/login/);
  const entryId = (await state(request)).journal.entries[0].id;
  for (const route of ["/api/journal/publish", "/api/journal/unpublish"]) {
    expect((await v.request.post(route, { headers: { Origin: APP }, data: { entryId, draftVersion: 1 } })).status()).toBe(401);
    expect((await v.request.post(route, { headers: { Origin: "https://evil.example" }, data: { entryId, draftVersion: 1 } })).status()).toBe(403);
  }
  expect((await v.request.get(`${API}/rest/v1/journal_entries?select=*`)).status()).toBe(401);
  expect((await v.request.get(`${API}/rest/v1/journal_published?select=*`)).status()).toBe(401);
  await anon.close();
});
