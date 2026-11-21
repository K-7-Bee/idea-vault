import { test, expect, type Page, type APIRequestContext, type Browser } from "@playwright/test";
import { createHash } from "node:crypto";
import sharp from "sharp";

// Phase 4C (files library, résumé and photo) against the synthetic fixture, which imitates
// migration 015 and Supabase Storage. Not live Supabase; the database rules are tested in
// tests/sql/phase4c-behaviour.sql. Runs after profile.spec.ts (file order), whose first test needs
// the untouched homepage; the homepage cache lives for the whole run, so each test publishes what it checks.
const API = "http://127.0.0.1:4317";
const APP = "http://127.0.0.1:4318";
const OWNER = "11111111-1111-4111-8111-111111111111";
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };
type Row = { id: string; name: string; public_path: string | null };
type State = {
  library: { rows: Row[]; objects: { path: string }[]; public: { name: string; type: string; sha: string }[] };
  profile: { published: { content: { resume: { file: string; name: string }; photo: { file: string; alt: string } } } | null; versions: { content: { resume: { file: string } } }[] };
};

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n", "latin1");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function control(request: APIRequestContext, data: object) {
  expect((await request.post(`${API}/_test/control`, { headers: controlHeaders, data })).ok()).toBeTruthy();
}
async function state(request: APIRequestContext): Promise<State> {
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

async function openEditor(page: Page) {
  await page.goto("/vault/portfolio/profile");
  await expect(page.getByRole("heading", { name: "Profile", level: 2 })).toBeVisible();
}
async function saveDraft(page: Page) {
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(status(page, "Profile draft saved.")).toBeVisible();
}
async function publish(page: Page, expectChanged: string[] = []) {
  await page.getByRole("button", { name: "Review and publish" }).click();
  const confirm = page.getByRole("group", { name: "Confirm what changes on your homepage" });
  for (const section of expectChanged) await expect(confirm.getByRole("listitem").filter({ hasText: section })).toBeVisible();
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(status(page, "Published. Your homepage shows it now.")).toBeVisible();
}
// Uploads through the picker of the given group ("Résumé" or "Photo") and returns to the editor.
async function chooseUpload(page: Page, part: "Résumé" | "Photo", file: { name: string; mimeType: string; buffer: Buffer }) {
  await group(page, part).getByRole("button", { name: part === "Résumé" ? /Choose (a résumé|another) PDF/ : /Choose (a photo|another image)/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(part === "Résumé" ? "Upload a new PDF" : "Upload a new image").setInputFiles(file);
  await expect(dialog).toBeHidden();
}
async function visitor(browser: Browser) {
  const context = await browser.newContext({ baseURL: APP });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port)) await route.continue();
    else await route.abort("blockedbyclient");
  });
  return context;
}
// Publishes a résumé from a fresh upload; returns the uploaded bytes.
async function publishResume(page: Page, request: APIRequestContext, name = "Ada-Example-Resume.pdf", bytes = PDF) {
  await login(page);
  await openEditor(page);
  await chooseUpload(page, "Résumé", { name: "My CV.pdf", mimeType: "application/pdf", buffer: bytes });
  await expect(group(page, "Résumé").getByText(/^PDF: My CV.pdf/)).toBeVisible();
  await expect(group(page, "Résumé").getByRole("textbox", { name: /Download file name/ })).toHaveValue(/-Resume\.pdf$/);
  await group(page, "Résumé").getByRole("textbox", { name: /Download file name/ }).fill(name);
  await saveDraft(page);
  await publish(page, ["Résumé and photo"]);
  expect((await state(request)).library.public).toHaveLength(1);
}

test.beforeEach(async ({ request, context, page }) => {
  expect((await request.post(`${API}/_test/reset`, { headers: controlHeaders })).ok()).toBeTruthy();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port)) await route.continue();
    else await route.abort("blockedbyclient");
  });
  page.on("dialog", (dialog) => dialog.accept());
});

test("résumé: upload privately, preview, publish; the homepage and /resume serve exactly that file and nothing private", async ({ page, request, browser }) => {
  await login(page);
  await openEditor(page);
  await chooseUpload(page, "Résumé", { name: "My CV.pdf", mimeType: "application/pdf", buffer: PDF });
  await group(page, "Résumé").getByRole("textbox", { name: /Download file name/ }).fill("Ada-Example-Resume.pdf");
  await expect(group(page, "Résumé").getByText(/Everything inside the PDF becomes public/)).toBeVisible();
  await saveDraft(page);

  let s = await state(request);
  expect(s.library.rows).toHaveLength(1);
  expect(s.library.public, "nothing is public before publishing").toHaveLength(0);
  const libraryId = s.library.rows[0].id;

  // The preview links the private library file through a signed link; visitors still see no résumé.
  await page.goto("/vault/portfolio/profile/preview");
  const previewLink = page.getByRole("link", { name: "Résumé (PDF)", exact: true });
  await expect(previewLink).toHaveAttribute("href", /\/object\/sign\/library\//);
  expect((await request.get(`${APP}/resume`, { maxRedirects: 0 })).status()).toBe(404);

  await openEditor(page);
  await publish(page, ["Résumé and photo"]);
  s = await state(request);
  expect(s.library.public).toHaveLength(1);
  expect(s.library.public[0].sha, "the PDF is published byte for byte").toBe(sha(PDF));
  const copy = s.library.public[0].name;
  expect(copy).toMatch(/^[0-9a-f-]{36}\.pdf$/);
  expect(s.profile.published!.content.resume).toEqual({ file: copy, name: "Ada-Example-Resume.pdf" });
  expect(s.profile.versions.at(-1)!.content.resume.file, "history keeps the library id for restore").toBe(libraryId);

  const anon = await visitor(browser);
  const v = await anon.newPage();
  await v.goto("/");
  await expect(v.getByRole("link", { name: "Résumé (PDF)", exact: true })).toHaveAttribute("href", "/resume");
  await expect(v.getByRole("link", { name: "Download my résumé (PDF)" })).toHaveAttribute("href", "/resume");
  const html = await (await v.request.get("/")).text();
  for (const secret of [libraryId, OWNER, "/library/", "/object/sign/"]) expect(html).not.toContain(secret);
  const redirect = await v.request.get("/resume", { maxRedirects: 0 });
  expect(redirect.status()).toBe(307);
  expect(redirect.headers()["cache-control"]).toBe("no-store");
  expect(redirect.headers().location).toBe(`${API}/storage/v1/object/public/profile-files/${copy}?download=Ada-Example-Resume.pdf`);
  const file = await v.request.get("/resume");
  expect(file.status()).toBe(200);
  expect(file.headers()["content-disposition"]).toContain('filename="Ada-Example-Resume.pdf"');
  expect(Buffer.from(await file.body()).equals(PDF)).toBe(true);
  await anon.close();
});

test("the same file uploaded twice is stored once; a second publish reuses the public copy", async ({ page, request }) => {
  await publishResume(page, request);
  await page.goto("/vault/portfolio/files");
  await page.getByLabel("Upload from this device").setInputFiles({ name: "copy of CV.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(status(page, /already in your library; nothing was stored twice/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Library files" }).getByRole("listitem").filter({ hasText: "My CV.pdf" })).toHaveCount(1);
  const s = await state(request);
  expect(s.library.rows).toHaveLength(1);
  expect(s.library.objects).toHaveLength(1);

  // Republishing with only a text change keeps the same single public copy.
  await openEditor(page);
  await group(page, "Current focus").getByRole("textbox").fill("Circuits");
  await saveDraft(page);
  await publish(page, ["Current focus"]);
  const after = await state(request);
  expect(after.library.public.map((p) => p.name)).toEqual(s.library.public.map((p) => p.name));
});

test("photo: needs a description, and its public copy is upright with GPS and camera details removed", async ({ page, request, browser }) => {
  const photo = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#3a6" } }).jpeg()
    .withExif({ IFD0: { Artist: "Ada Secret", Make: "PhoneCo" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "35/1 49/1 0/1" } })
    .withMetadata({ orientation: 6 }).toBuffer();
  expect((await sharp(photo).metadata()).exif, "the fixture photo carries EXIF").toBeTruthy();

  await login(page);
  await openEditor(page);
  await chooseUpload(page, "Photo", { name: "me.jpg", mimeType: "image/jpeg", buffer: photo });
  await saveDraft(page);
  await expect(page.getByRole("list", { name: "Before you can publish" }).getByText("Describe the photo for people who can't see it.")).toBeVisible();
  await group(page, "Photo").getByRole("textbox", { name: /Describe the photo/ }).fill("Ada at a workbench");
  await saveDraft(page);
  await publish(page, ["Résumé and photo"]);

  const s = await state(request);
  const copy = s.library.public[0];
  expect(copy.type).toBe("image/jpeg");
  const anon = await visitor(browser);
  const v = await anon.newPage();
  await v.goto("/");
  const img = v.getByRole("img", { name: "Ada at a workbench" });
  await expect(img).toHaveAttribute("src", `${API}/storage/v1/object/public/profile-files/${copy.name}`);
  await expect(v.getByRole("link", { name: "Résumé (PDF)", exact: true })).toHaveCount(0);
  const served = Buffer.from(await (await v.request.get(`${API}/storage/v1/object/public/profile-files/${copy.name}`)).body());
  const m = await sharp(served).metadata();
  expect(m.exif).toBeUndefined();
  expect(m.xmp).toBeUndefined();
  expect(m.orientation).toBeUndefined();
  expect([m.width, m.height]).toEqual([20, 40]);
  expect(served.includes("Ada Secret")).toBe(false);
  await anon.close();
});

test("taking the résumé off: /resume stops, the public copy is removed, then the file can be deleted; old versions can't bring it back", async ({ page, request }) => {
  await publishResume(page, request);
  await openEditor(page);
  await group(page, "Résumé").getByRole("button", { name: "Remove résumé" }).click();
  await saveDraft(page);
  await publish(page, ["Résumé and photo"]);
  expect((await request.get(`${APP}/resume`, { maxRedirects: 0 })).status()).toBe(404);

  // The copy was made seconds ago, so it is kept a few minutes for a publish in progress elsewhere.
  await page.goto("/vault/portfolio/files");
  const item = page.getByRole("list", { name: "Library files" }).getByRole("listitem").filter({ hasText: "My CV.pdf" });
  await expect(item.getByRole("listitem").filter({ hasText: "On your public site" })).toBeVisible();
  await expect(item.getByRole("button", { name: /Delete/ })).toHaveCount(0);
  expect((await state(request)).library.public).toHaveLength(1);

  await control(request, { publicFileAge: 10 * 60_000 });
  await page.reload();
  await expect(item.getByRole("listitem").filter({ hasText: "On your public site" })).toHaveCount(0);
  let s = await state(request);
  expect(s.library.public, "the unused public copy is gone").toHaveLength(0);
  expect(s.library.rows[0].public_path).toBeNull();

  await item.getByRole("button", { name: "Delete My CV.pdf" }).click();
  await page.getByRole("group", { name: "Confirm deleting My CV.pdf" }).getByRole("button", { name: "Delete permanently" }).click();
  await expect(status(page, '"My CV.pdf" deleted from your library.')).toBeVisible();
  s = await state(request);
  expect(s.library.rows).toHaveLength(0);
  expect(s.library.objects).toHaveLength(0);

  // Version 1 had that résumé: restoring it is allowed, but publishing is blocked with a clear reason.
  await openEditor(page);
  await page.getByRole("button", { name: "Restore to draft (version 1)" }).click();
  await expect(status(page, "Version 1 copied into the draft.")).toBeVisible();
  await expect(group(page, "Résumé").getByText("The chosen PDF is no longer in your library. Choose another.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Before you can publish" }).getByText(/résumé file is no longer in your library/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Review and publish" })).toHaveCount(0);
});

test("a file the draft uses can't be deleted, and the library is private to its owner", async ({ page, request, browser }) => {
  await login(page);
  await openEditor(page);
  await chooseUpload(page, "Résumé", { name: "Draft CV.pdf", mimeType: "application/pdf", buffer: Buffer.concat([PDF, Buffer.from("draft")]) });
  await saveDraft(page);
  await page.goto("/vault/portfolio/files");
  const item = page.getByRole("list", { name: "Library files" }).getByRole("listitem").filter({ hasText: "Draft CV.pdf" });
  await expect(item.getByText("Résumé in the draft")).toBeVisible();
  await expect(item.getByText("Remove it from the draft to delete it.")).toBeVisible();

  // Wrong type through the picker is refused before anything is stored.
  await page.getByLabel("Upload from this device").setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html>not a pdf</html>") });
  await expect(status(page, "Only PDF, JPEG, PNG or WebP files can go in the library.")).toBeVisible();
  expect((await state(request)).library.rows).toHaveLength(1);

  const anon = await visitor(browser);
  const v = await anon.newPage();
  for (const path of ["/vault/portfolio/files", "/vault/portfolio/profile/preview"]) {
    await v.goto(path);
    await expect(v).toHaveURL(/\/login/);
  }
  expect((await v.request.post("/api/profile/cleanup", { headers: { Origin: APP } })).status()).toBe(401);
  expect((await v.request.post("/api/profile/cleanup", { headers: { Origin: "https://evil.example" } })).status()).toBe(403);
  expect((await v.request.get(`${API}/rest/v1/library_files?select=*`)).status()).toBe(401);
  const listed = await v.request.post(`${API}/storage/v1/object/list/profile-files`, { data: { prefix: "" } });
  expect(await listed.json()).toEqual([]);
  await anon.close();
});
