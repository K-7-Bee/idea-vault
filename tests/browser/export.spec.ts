import { test, expect, type Page } from "@playwright/test";

// Phase 6A: "Download my data" against the synthetic fixture. Not live Supabase.
const API = "http://127.0.0.1:4317";
const APP = "http://127.0.0.1:4318";
const OWNER = "11111111-1111-4111-8111-111111111111";
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill("owner@fixture.invalid");
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workspace overview" })).toBeVisible();
}

test.beforeEach(async ({ request, context }) => {
  expect((await request.post(`${API}/_test/reset`, { headers: controlHeaders })).ok()).toBeTruthy();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port)) await route.continue();
    else await route.abort("blockedbyclient");
  });
});

test("the owner downloads their data as JSON from Settings; visitors and other sites can't", async ({ page, request, browser }) => {
  await login(page);
  await page.goto("/vault/settings");
  const link = page.getByRole("link", { name: "Download my data" });
  await expect(link).toHaveAttribute("href", "/api/export");
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(download.suggestedFilename()).toMatch(/^idea-vault-export-\d{8}\.json$/);

  const response = await page.request.get("/api/export");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["content-disposition"]).toMatch(/^attachment; filename="idea-vault-export-\d{8}\.json"$/);
  const file = await response.json();
  expect(file.format).toBe("idea-vault-export-v1");
  expect(file.account.id).toBe(OWNER);
  expect(file.counts.ideas).toBe(1);
  expect(file.tables.ideas[0].content).toBe("Fixture original #test");
  expect(file.counts.idea_files).toBe(1);
  expect(file.tables.idea_files[0]).not.toHaveProperty("bytes");
  for (const secret of ["refresh_token", "access_token", "synthetic-test-password", "fixture-gemini-key"]) {
    expect(JSON.stringify(file)).not.toContain(secret);
  }
  // Nothing was changed by exporting.
  const before = await (await request.get(`${API}/_test/state`, { headers: controlHeaders })).json();
  await page.request.get("/api/export");
  const after = await (await request.get(`${API}/_test/state`, { headers: controlHeaders })).json();
  expect(after.ideas).toEqual(before.ideas);
  expect(after.work).toEqual(before.work);

  expect((await page.request.get("/api/export", { headers: { "Sec-Fetch-Site": "cross-site" } })).status()).toBe(403);
  const anon = await browser.newContext({ baseURL: APP });
  expect((await anon.request.get("/api/export")).status()).toBe(401);
  await anon.close();
});
