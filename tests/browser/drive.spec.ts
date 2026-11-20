import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Phase 3A (Connect Google Drive) against the synthetic fixture and synthetic Google. Not live Google or Supabase.
const API = "http://127.0.0.1:4317";
const APP = "http://127.0.0.1:4318";
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };
type DriveRow = Record<string, string | null>;
type GoogleFile = { id: string; name: string; created?: boolean };
type State = { drive: DriveRow[]; google: { revoked: string[]; calls: string[]; files: GoogleFile[] } };

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
const appAlert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
const card = (page: Page) => page.getByRole("heading", { name: "Google Drive" }).locator("..");

async function connect(page: Page) {
  await page.goto("/vault/settings");
  await page.getByRole("link", { name: "Connect Google Drive" }).click();
  await expect(page).toHaveURL(/\/vault\/settings\?drive=/);
}
async function api(page: Page, path: string, init: { method?: string; body?: unknown } = {}) {
  return page.evaluate(async ({ path, init }) => {
    const response = await fetch(path, { method: init.method ?? "GET", cache: "no-store",
      headers: init.body ? { "Content-Type": "application/json" } : {}, body: init.body ? JSON.stringify(init.body) : undefined });
    return { status: response.status, text: await response.text() };
  }, { path, init });
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

test("connecting stores only sealed tokens for the owner and shows the account", async ({ page, request }) => {
  await login(page);
  await page.getByRole("link", { name: "Settings" }).first().click();
  await expect(page.getByRole("heading", { name: "Settings", level: 2 })).toBeVisible();
  await expect(card(page).getByText("Not connected.")).toBeVisible();
  await connect(page);
  await expect(page).toHaveURL(/drive=connected/);
  await expect(page.getByRole("status").filter({ hasText: "Google Drive is connected." })).toBeVisible();
  await expect(card(page).getByText("owner@fixture.invalid")).toBeVisible();
  await expect(card(page).getByText("Not chosen yet")).toBeVisible();

  const { drive, google } = await state(request);
  expect(drive).toHaveLength(1);
  expect(drive[0].user_id).toBe("11111111-1111-4111-8111-111111111111");
  expect(drive[0].scope).toBe("https://www.googleapis.com/auth/drive.file");
  expect(drive[0].refresh_token_enc).toMatch(/^v1\./);
  expect(drive[0].access_token_enc).toMatch(/^v1\./);
  // No issued token appears in the stored row, the status response or the page.
  const issued = /fixture-[0-9a-f]{8}-[0-9a-f]{4}-/;
  expect(JSON.stringify(drive)).not.toMatch(issued);
  const status = await api(page, "/api/drive/status");
  expect(status.status).toBe(200);
  expect(status.text).not.toMatch(issued);
  expect(await page.content()).not.toMatch(issued);
  expect(google.revoked).toEqual([]);
  // The one-time state cookie is gone after the callback.
  expect((await page.context().cookies()).some((c) => c.name === "vault_drive_oauth")).toBe(false);
});

test("a different Google account or a broader scope is refused, revoked and not stored", async ({ page, request }) => {
  await login(page);
  await control(request, { google: { email: "someone-else@fixture.invalid" } });
  await connect(page);
  await expect(appAlert(page).filter({ hasText: "isn't the one allowed" })).toBeVisible();
  let s = await state(request);
  expect(s.drive).toEqual([]);
  expect(s.google.revoked).toHaveLength(1);

  await control(request, { google: { email: "owner@fixture.invalid", scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive" } });
  await connect(page);
  await expect(appAlert(page).filter({ hasText: "exactly the" })).toBeVisible();
  s = await state(request);
  expect(s.drive).toEqual([]);
  expect(s.google.revoked).toHaveLength(2);

  await control(request, { google: { scope: "https://www.googleapis.com/auth/drive.file", deny: true } });
  await connect(page);
  await expect(appAlert(page).filter({ hasText: "Connection cancelled" })).toBeVisible();
  expect((await state(request)).drive).toEqual([]);
});

test("a callback without this session's one-time state is rejected", async ({ page, request }) => {
  await login(page);
  await page.goto("/api/drive/callback?code=forged&state=forged");
  await expect(page).toHaveURL(/drive=state/);
  await expect(appAlert(page).filter({ hasText: "couldn't be verified" })).toBeVisible();
  const s = await state(request);
  expect(s.drive).toEqual([]);
  expect(s.google.calls.filter((c) => c.startsWith("POST /token"))).toEqual([]);
});

test("choosing a folder proves write access with a removed probe and rejects other items", async ({ page, request }) => {
  await login(page);
  await connect(page);
  const saved = await api(page, "/api/drive/folder", { method: "POST", body: { id: "fixture-folder-0001" } });
  expect(saved.status).toBe(200);
  expect(JSON.parse(saved.text)).toEqual({ ok: true, folder: { id: "fixture-folder-0001", name: "Vault Files" }, probeLeft: false });
  let s = await state(request);
  expect(s.drive[0].folder_id).toBe("fixture-folder-0001");
  expect(s.drive[0].folder_name).toBe("Vault Files");
  expect(s.google.files.filter((f) => f.created)).toEqual([]);
  expect(s.google.calls).toEqual(expect.arrayContaining(["POST /drive/v3/files", expect.stringMatching(/^DELETE \/drive\/v3\/files\/fixture-new-/)]));

  expect(JSON.parse((await api(page, "/api/drive/folder", { method: "POST", body: { id: "fixture-doc-000001" } })).text).error).toBe("not_a_folder");
  expect(JSON.parse((await api(page, "/api/drive/folder", { method: "POST", body: { id: "never-granted-0001" } })).text).error).toBe("not_granted");
  expect((await api(page, "/api/drive/folder", { method: "POST", body: { id: "../../x" } })).status).toBe(400);
  s = await state(request);
  expect(s.drive[0].folder_id).toBe("fixture-folder-0001");

  await page.reload();
  await expect(card(page).getByText("Vault Files")).toBeVisible();
  // Google's picker script is an external host, blocked here: the page says so instead of failing silently.
  await page.getByRole("button", { name: "Change folder" }).click();
  await expect(appAlert(page).filter({ hasText: "picker couldn't be loaded" })).toBeVisible();
});

test("disconnecting revokes the grant at Google and removes the stored connection", async ({ page, request }) => {
  await login(page);
  await connect(page);
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("status").filter({ hasText: "disconnected and the Vault's access was revoked" })).toBeVisible();
  await expect(card(page).getByRole("link", { name: "Connect Google Drive" })).toBeVisible();
  const s = await state(request);
  expect(s.drive).toEqual([]);
  expect(s.google.revoked).toHaveLength(1);
  expect(s.google.revoked[0]).toMatch(/^fixture-/);
});

test("an expired grant shows reconnect, and reconnecting replaces it", async ({ page, request }) => {
  await login(page);
  await control(request, { google: { expiresIn: 1, refreshFail: true } });
  await connect(page);
  await expect(card(page).getByText("Needs reconnecting")).toBeVisible();
  const before = (await state(request)).drive[0].refresh_token_enc;
  const token = await api(page, "/api/drive/picker-token", { method: "POST" });
  expect(token.status).toBe(409);
  expect(JSON.parse(token.text).error).toBe("reconnect");

  await control(request, { google: { expiresIn: 3599, refreshFail: false } });
  await card(page).getByRole("link", { name: "Reconnect Google Drive" }).click();
  await expect(page).toHaveURL(/drive=connected/);
  await expect(card(page).getByText("Connected", { exact: true })).toBeVisible();
  const after = (await state(request)).drive;
  expect(after).toHaveLength(1);
  expect(after[0].refresh_token_enc).not.toBe(before);
});

test("Drive routes deny logged-out visitors, other accounts and cross-site requests", async ({ page, playwright }) => {
  const anonymous = await playwright.request.newContext({ baseURL: APP });
  expect((await anonymous.get("/api/drive/status")).status()).toBe(401);
  const start = await anonymous.get("/api/drive/connect", { maxRedirects: 0 });
  expect(start.status()).toBe(303);
  expect(start.headers().location).toContain("/login");
  for (const path of ["/api/drive/disconnect", "/api/drive/picker-token", "/api/drive/folder"]) {
    expect((await anonymous.post(path, { headers: { Origin: APP }, data: { id: "fixture-folder-0001" } })).status(), path).toBe(401);
  }
  await anonymous.dispose();

  await login(page, "other");
  expect((await api(page, "/api/drive/status")).status).toBe(401);
  expect((await api(page, "/api/drive/picker-token", { method: "POST" })).status).toBe(401);

  await login(page);
  for (const path of ["/api/drive/disconnect", "/api/drive/picker-token", "/api/drive/folder"]) {
    const response = await page.request.post(path, { headers: { Origin: "https://attacker.invalid" }, data: {} });
    expect(response.status(), path).toBe(403);
  }
});

test("the Settings page fits phone, tablet and desktop widths", async ({ page }) => {
  await login(page);
  await connect(page);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `settings at ${width}px`).toBeLessThanOrEqual(width);
    await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();
  }
});
