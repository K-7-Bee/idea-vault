import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Phase 3B (attachments in Google Drive) against the synthetic fixture and synthetic Google.
// The test app runs with DRIVE_UPLOADS_ENABLED=1. Not live Google or Supabase.
const API = "http://127.0.0.1:4317";
const APP = "http://127.0.0.1:4318";
const FOLDER = "fixture-folder-0001";
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };
type FileRecord = { id: string; idea_id: string; name: string; size: number; provider?: string; drive_file_id?: string; md5?: string; path: string };
type GoogleFile = { id: string; name: string; parents?: string[]; appProperties?: Record<string, string>; uploaded?: boolean; stored: number };
type State = { files: FileRecord[]; objects: { path: string; size: number }[]; google: { calls: string[]; files: GoogleFile[] } };

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const MB = 1024 * 1024;
const bytes = (size: number, seed = 7) => { const b = Buffer.alloc(size); for (let i = 0; i < size; i += 4096) b[i] = (i / 4096 + seed) % 251; return b; };
const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");

async function control(request: APIRequestContext, data: object) {
  expect((await request.post(`${API}/_test/control`, { headers: controlHeaders, data })).ok()).toBeTruthy();
}
async function state(request: APIRequestContext): Promise<State> {
  return (await request.get(`${API}/_test/state`, { headers: controlHeaders })).json();
}
const driveRows = async (request: APIRequestContext) => (await state(request)).files.filter((f) => f.provider === "drive");
const uploadedFiles = async (request: APIRequestContext) => (await state(request)).google.files.filter((f) => f.uploaded);

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill("owner@fixture.invalid");
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workspace overview" })).toBeVisible();
}
async function connectDrive(page: Page) {
  await page.goto("/vault/settings");
  await page.getByRole("link", { name: "Connect Google Drive" }).click();
  await expect(page).toHaveURL(/drive=connected/);
  const status = await page.evaluate(async (id) => (await fetch("/api/drive/folder", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })).status, FOLDER);
  expect(status).toBe(200);
}
async function capture(page: Page, text: string, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.goto("/vault");
  await expect(page.getByRole("heading", { name: "Workspace overview" })).toBeVisible();
  await page.getByRole("textbox", { name: "New idea", exact: true }).fill(text);
  await page.locator('input[type="file"]').first().setInputFiles(files);
  await page.getByRole("button", { name: "Save idea", exact: true }).click();
}
const card = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text });

test.beforeEach(async ({ request, context, page }) => {
  expect((await request.post(`${API}/_test/reset`, { headers: controlHeaders })).ok()).toBeTruthy();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port)) await route.continue();
    else await route.abort("blockedbyclient");
  });
  page.on("dialog", (dialog) => dialog.accept());
});

test("new files go to the chosen Drive folder, are verified and recorded, and preview from the Vault", async ({ page, request }) => {
  test.setTimeout(90_000);
  await login(page);
  await connectDrive(page);
  const before = await state(request);
  const video = bytes(9 * MB + 5);
  await capture(page, "Drive photo and clip #drive", [
    { name: "pixel.png", mimeType: "image/png", buffer: PNG },
    { name: "clip.mp4", mimeType: "video/mp4", buffer: video },
  ]);
  await expect.poll(async () => (await driveRows(request)).length, { timeout: 30_000 }).toBe(2);

  const s = await state(request);
  expect(s.objects).toEqual(before.objects); // nothing went to Vault storage
  for (const [row, buffer] of [[s.files.find((f) => f.name === "pixel.png")!, PNG], [s.files.find((f) => f.name === "clip.mp4")!, video]] as const) {
    const file = s.google.files.find((f) => f.id === row.drive_file_id)!;
    expect(file.parents).toEqual([FOLDER]);
    expect(file.appProperties).toEqual({ vaultFileId: row.id, vaultIdeaId: row.idea_id });
    expect(row.path).toBe(`drive/${row.drive_file_id}`);
    expect(row.size).toBe(buffer.length);
    expect(file.stored).toBe(buffer.length);
    expect(row.md5).toBe(md5(buffer));
  }
  // Resumable: one session per file, the clip in two 256 KiB-aligned chunks.
  expect(s.google.calls.filter((c) => c === "POST /upload/drive/v3/files")).toHaveLength(2);

  const pngRow = s.files.find((f) => f.name === "pixel.png")!;
  await expect(card(page, "Drive photo and clip").locator(`img[src="/api/drive/file/${pngRow.id}"]`)).toBeVisible();
  const image = await page.request.get(`/api/drive/file/${pngRow.id}`);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
  expect(image.headers()["content-security-policy"]).toContain("sandbox");
  expect(image.headers()["cache-control"]).toContain("no-store");
  expect(Buffer.from(await image.body()).equals(PNG)).toBe(true);
  const clipRow = s.files.find((f) => f.name === "clip.mp4")!;
  const part = await page.request.get(`/api/drive/file/${clipRow.id}`, { headers: { Range: "bytes=0-9" } });
  expect(part.status()).toBe(206);
  expect(part.headers()["content-range"]).toBe(`bytes 0-9/${video.length}`);
  expect(Buffer.from(await part.body()).equals(video.subarray(0, 10))).toBe(true);
});

test("an interrupted upload resumes from the confirmed byte after a reload, without a second copy", async ({ page, request }) => {
  test.setTimeout(90_000);
  await login(page);
  await connectDrive(page);
  await control(request, { google: { dropAfterChunk: 1 } });
  const big = bytes(20 * MB, 3);
  await capture(page, "Interrupted upload", [{ name: "long.mp4", mimeType: "video/mp4", buffer: big }]);
  await expect.poll(async () => (await state(request)).google.calls.filter((c) => c === "PUT /upload/drive/v3/files").length).toBeGreaterThan(0);
  expect(await driveRows(request)).toEqual([]);

  await control(request, { google: { dropAfterChunk: 0 } });
  await page.reload();
  await expect.poll(async () => (await driveRows(request)).length, { timeout: 40_000 }).toBe(1);
  const s = await state(request);
  expect(s.google.calls.filter((c) => c === "POST /upload/drive/v3/files")).toHaveLength(1);
  expect(await uploadedFiles(request)).toHaveLength(1);
  expect((await driveRows(request))[0].md5).toBe(md5(big));
  await expect(card(page, "Interrupted upload")).not.toHaveClass(/border-dashed/);
});

test("without Drive, a small file falls back to Vault storage and a large one waits until Drive is connected", async ({ page, request }) => {
  test.setTimeout(90_000);
  await login(page);
  const large = bytes(30 * MB, 5);
  await capture(page, "Fallback and wait", [
    { name: "small.txt", mimeType: "text/plain", buffer: Buffer.from("small attachment") },
    { name: "big.bin", mimeType: "application/octet-stream", buffer: large },
  ]);
  await expect(page.getByRole("status").filter({ hasText: "Waiting for Google Drive: big.bin" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "small.txt was saved in Vault storage instead" })).toBeVisible();
  let s = await state(request);
  expect(s.files.filter((f) => f.name === "small.txt" && f.provider !== "drive")).toHaveLength(1);
  expect(s.objects.some((o) => o.path.endsWith("small.txt"))).toBe(true);
  expect(s.files.some((f) => f.name === "big.bin")).toBe(false);
  expect(s.objects.some((o) => o.size === large.length)).toBe(false);

  await connectDrive(page);
  await page.goto("/vault");
  await expect.poll(async () => (await driveRows(request)).map((f) => f.name), { timeout: 40_000 }).toEqual(["big.bin"]);
  s = await state(request);
  expect(s.files.filter((f) => f.name === "small.txt")).toHaveLength(1); // not copied again
  expect(await uploadedFiles(request)).toHaveLength(1);
});

test("large Drive files open in Google Drive; a file removed from Drive shows as unavailable", async ({ page, request, context }, testInfo) => {
  test.setTimeout(120_000);
  await login(page);
  await connectDrive(page);
  // Playwright passes buffers only up to 50 MB; a larger file goes through disk.
  const renderPath = testInfo.outputPath("render.mp4");
  writeFileSync(renderPath, bytes(51 * MB, 9));
  await page.goto("/vault");
  await page.getByRole("textbox", { name: "New idea", exact: true }).fill("Large render");
  await page.locator('input[type="file"]').first().setInputFiles(renderPath);
  await page.getByRole("button", { name: "Save idea", exact: true }).click();
  await expect.poll(async () => (await driveRows(request)).length, { timeout: 60_000 }).toBe(1);
  const [row] = await driveRows(request);
  await page.reload();
  const link = card(page, "Large render").getByRole("link", { name: /render\.mp4.*Open in Google Drive/ });
  await expect(link).toHaveAttribute("href", `/api/drive/file/${row.id}?open=drive`);
  const [viewer] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await expect(viewer).toHaveURL(`${API}/google/view/${row.drive_file_id}`);
  await viewer.close();

  await control(request, { googleDelete: row.drive_file_id });
  const gone = await page.request.get(`/api/drive/file/${row.id}`);
  expect(gone.status()).toBe(404);
  expect(await gone.text()).toContain("Attachment unavailable");
  expect((await state(request)).files.find((f) => f.id === row.id)).toBeTruthy(); // record kept
});

test("removing a Drive attachment only unlinks it; restore re-links the same Drive file", async ({ page, request }) => {
  await login(page);
  await connectDrive(page);
  await capture(page, "Unlink me", [{ name: "pixel.png", mimeType: "image/png", buffer: PNG }]);
  await expect.poll(async () => (await driveRows(request)).length, { timeout: 30_000 }).toBe(1);
  const [row] = await driveRows(request);
  await page.reload();
  const idea = card(page, "Unlink me");
  await idea.getByRole("button", { name: "Edit", exact: true }).click();
  await idea.getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(async () => (await driveRows(request)).length).toBe(0);
  expect((await state(request)).google.files.some((f) => f.id === row.drive_file_id)).toBe(true); // still in Drive
  await page.getByText(/Recovery on this device/).click();
  await page.getByRole("button", { name: "Restore", exact: true }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Restored." })).toBeVisible();
  const restored = await driveRows(request);
  expect(restored.map((f) => [f.id, f.drive_file_id, f.path, f.md5])).toEqual([[row.id, row.drive_file_id, row.path, row.md5]]);
});

test("adding a file to an existing idea uploads it to Drive", async ({ page, request }) => {
  await login(page);
  await connectDrive(page);
  await page.goto("/vault");
  const idea = card(page, "Fixture original");
  await idea.getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator('input[type="file"]').nth(1).setInputFiles({ name: "later.png", mimeType: "image/png", buffer: PNG });
  await expect.poll(async () => (await driveRows(request)).map((f) => [f.name, f.idea_id])).toEqual([["later.png", "33333333-3333-4333-8333-333333333333"]]);
});

test("upload routes deny logged-out visitors, other accounts and cross-site requests", async ({ page, playwright, request }) => {
  await login(page);
  await connectDrive(page);
  await capture(page, "Private file", [{ name: "pixel.png", mimeType: "image/png", buffer: PNG }]);
  await expect.poll(async () => (await driveRows(request)).length, { timeout: 30_000 }).toBe(1);
  const [row] = await driveRows(request);
  const body = { ideaId: row.idea_id, fileId: "55555555-5555-4555-8555-555555555555", name: "x.png", mimeType: "image/png", size: 10 };

  for (const path of ["/api/drive/upload-session", "/api/drive/upload-complete"]) {
    expect((await page.request.post(path, { headers: { Origin: "https://attacker.invalid" }, data: body })).status(), path).toBe(403);
  }
  // The owner cannot attach to an idea that isn't theirs or doesn't exist.
  const foreign = await page.request.post("/api/drive/upload-session", { headers: { Origin: APP }, data: { ...body, ideaId: "66666666-6666-4666-8666-666666666666" } });
  expect(foreign.status()).toBe(404);

  const anonymous = await playwright.request.newContext({ baseURL: APP });
  for (const path of ["/api/drive/upload-session", "/api/drive/upload-complete"]) {
    expect((await anonymous.post(path, { headers: { Origin: APP }, data: body })).status(), path).toBe(401);
  }
  expect((await anonymous.get(`/api/drive/file/${row.id}`)).status()).toBe(401);
  await anonymous.dispose();

  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill("other@fixture.invalid");
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/denied=1/);
  expect((await page.request.get(`/api/drive/file/${row.id}`)).status()).toBe(401);
});
