import { test, expect, type Page, type APIRequestContext, type Browser } from "@playwright/test";

// Phase 4B (the homepage text, edited in the Vault) against the synthetic fixture, which imitates
// migration 014's tables and publish_profile. Not live Supabase; the real database rules are tested
// in tests/sql/phase4b-behaviour.sql.
//
// The homepage is a cached static page inside the one app server for the whole run. Fixture resets
// don't clear that cache, so each test publishes what it then checks, and the first test (which
// checks the untouched page) must stay first.
const API = "http://127.0.0.1:4317";
const APP = "http://127.0.0.1:4318";
const OWNER = "11111111-1111-4111-8111-111111111111";
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };
type State = { profile: { drafts: { version: number }[]; published: { version: number; content: { focus: string[] } } | null; versions: { version: number }[] } };

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
const status = (page: Page, text: string | RegExp) => page.locator('[role="status"], [role="alert"]:not(#__next-route-announcer__)').filter({ hasText: text });
const group = (page: Page, name: string | RegExp) => page.getByRole("group", { name });

async function openEditor(page: Page) {
  await page.goto("/vault/portfolio");
  await page.getByRole("link", { name: /Homepage text/ }).click();
  await expect(page.getByRole("heading", { name: "Profile", level: 2 })).toBeVisible();
}
async function saveDraft(page: Page) {
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(status(page, "Profile draft saved.")).toBeVisible();
}
async function setFocus(page: Page, items: string[]) {
  await group(page, "Current focus").getByRole("textbox").fill(items.join("\n"));
}
async function publish(page: Page, expectChanged: string[] = []) {
  await page.getByRole("button", { name: "Review and publish" }).click();
  const confirm = page.getByRole("group", { name: "Confirm what changes on your homepage" });
  for (const section of expectChanged) await expect(confirm.getByRole("listitem").filter({ hasText: section })).toBeVisible();
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(status(page, "Published. Your homepage shows it now.")).toBeVisible();
}
// A visitor with no session at all.
async function visitor(browser: Browser) {
  const context = await browser.newContext({ baseURL: APP });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port)) await route.continue();
    else await route.abort("blockedbyclient");
  });
  return context;
}
async function homeHtml(request: APIRequestContext) {
  const response = await request.get(`${APP}/`);
  expect(response.status()).toBe(200);
  return response.text();
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

test("before anything is published the homepage shows its original text, and the editor starts from it", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Curiosity meetsengineering.");
  await expect(page.getByText("I'm MD Kaushik Kamal, an engineering science student at Jeonbuk National University")).toBeVisible();
  await expect(page.getByRole("heading", { name: "I build what I'm learning." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Current focus" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Certificates" })).toHaveCount(0);
  await expect(page.getByText("What I did")).toHaveCount(0);
  for (const name of ["About", "Experience", "Projects", "Contact"]) {
    await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name, exact: true })).toBeAttached();
  }
  const html = await homeHtml(request);
  expect(html).not.toMatch(/koushikkamal6@gmail\.com/);
  expect(html).not.toContain(OWNER);

  await login(page);
  await openEditor(page);
  await expect(page.getByText("Nothing published from here yet.")).toBeVisible();
  await expect(group(page, "Introduction").getByRole("textbox", { name: "Your name" })).toHaveValue("MD Kaushik Kamal");
  await expect(group(page, "Contact and links").getByRole("textbox", { name: /Email address/ })).toHaveValue("koushikkamal6@gmail.com");
  await expect(group(page, "Experience and education").getByRole("group")).toHaveCount(5);
  expect((await state(request)).profile.drafts).toHaveLength(0);
});

test("edit, save, preview, confirm and publish: the very next homepage request shows exactly the preview", async ({ page, request, browser }) => {
  await login(page);
  await openEditor(page);
  await setFocus(page, ["Robotics", "Power electronics"]);
  const altech = group(page, /Altech Aluminum/);
  await altech.getByRole("textbox", { name: /Tools/ }).fill("Multimeter, AutoCAD, multimeter");
  await altech.getByRole("textbox", { name: /What you did/ }).fill("Checked panel wiring against drawings\n\nLogged faults");
  await page.getByRole("button", { name: "Add certificate" }).click();
  const cert = group(page, "Certificate 1");
  await cert.getByRole("textbox", { name: "Name" }).fill("Industrial safety course");
  await cert.getByRole("textbox", { name: "Issued by" }).fill("Training centre");
  await cert.getByRole("textbox", { name: "When" }).fill("2024");
  await expect(page.getByRole("link", { name: /Preview/ })).toHaveCount(0);
  await saveDraft(page);
  expect((await state(request)).profile.published).toBeNull();

  const [preview] = await Promise.all([page.waitForEvent("popup"), page.getByRole("link", { name: /Preview/ }).click()]);
  await expect(preview.getByText("Preview of the saved profile draft (version 1)")).toBeVisible();
  await expect(preview.getByText("Robotics")).toBeVisible();
  await expect(preview.getByRole("heading", { name: "Certificates" })).toBeVisible();
  const previewMain = await preview.locator("main").innerText();
  await preview.close();

  // Still the original text for visitors until publishing.
  expect(await homeHtml(request)).not.toContain("Robotics");
  await publish(page, ["Experience and education", "Certificates", "Current focus"]);
  await expect(page.getByText(/Version 1 is on your homepage/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "History" }).locator("..").getByText("On your homepage")).toBeVisible();

  const anon = await visitor(browser);
  const v = await anon.newPage();
  await v.goto("/");
  await expect(v.getByText("Robotics")).toBeVisible();
  await expect(v.getByText("Industrial safety course")).toBeVisible();
  await expect(v.getByText("Training centre · 2024")).toBeVisible();
  await expect(v.getByRole("list", { name: "Tools" }).getByRole("listitem")).toHaveText(["Multimeter", "AutoCAD"]);
  await expect(v.getByText("Logged faults")).toBeVisible();
  expect(await v.locator("main").innerText()).toBe(previewMain);
  await anon.close();
  const html = await homeHtml(request);
  expect(html).not.toContain(OWNER);
  expect(html).not.toMatch(/koushikkamal6@gmail\.com/);

  await page.goto("/vault/portfolio");
  await expect(page.getByText(/Version 1 is on your homepage/)).toBeVisible();
});

test("history and rollback: an earlier version restored into the draft and published again", async ({ page, request }) => {
  await login(page);
  await openEditor(page);
  await setFocus(page, ["First version focus"]);
  await saveDraft(page);
  await publish(page);
  await setFocus(page, ["Second version focus"]);
  await saveDraft(page);
  await publish(page, ["Current focus"]);
  expect(await homeHtml(request)).toContain("Second version focus");

  const history = page.getByRole("heading", { name: "History" }).locator("..");
  await expect(history.getByRole("listitem")).toHaveCount(2);
  await history.getByRole("button", { name: "Restore to draft (version 1)" }).click();
  await expect(status(page, "Version 1 copied into the draft.")).toBeVisible();
  await expect(group(page, "Current focus").getByRole("textbox")).toHaveValue("First version focus");
  expect(await homeHtml(request)).toContain("Second version focus");
  await publish(page, ["Current focus"]);
  const html = await homeHtml(request);
  expect(html).toContain("First version focus");
  expect(html).not.toContain("Second version focus");
  await expect(history.getByRole("listitem")).toHaveCount(3);
  const s = await state(request);
  expect(s.profile.versions.map((x) => x.version).sort()).toEqual([1, 2, 3]);
  expect(s.profile.published!.version).toBe(3);

  // Nothing to publish when the draft already matches the homepage.
  await expect(page.getByText("The saved draft matches what is on your homepage. Nothing to publish.")).toBeVisible();
});

test("refusals: unsafe links, HTML and a stale draft leave the homepage unchanged", async ({ page, request }) => {
  await login(page);
  await openEditor(page);
  await setFocus(page, ["Refusal check baseline"]);
  await saveDraft(page);
  await publish(page);

  const links = group(page, "Contact and links");
  await links.getByRole("textbox", { name: "Link 1 address" }).fill("javascript:alert(1)");
  await group(page, "About").getByRole("textbox", { name: /Text/ }).fill("Hello <script>alert(1)</script>");
  await saveDraft(page);
  const blockers = page.getByRole("list", { name: "Before you can publish" });
  await expect(blockers.getByRole("listitem").filter({ hasText: '"GitHub" must be a full address starting with https://.' })).toBeVisible();
  await expect(blockers.getByRole("listitem").filter({ hasText: "Remove the HTML tag" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review and publish" })).toHaveCount(0);

  // The route refuses the same draft, and a stale version, without touching the public copy.
  const post = (body: object) => page.evaluate(async (b) => {
    const r = await fetch("/api/profile/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, body);
  const draftVersion = (await state(request)).profile.drafts[0].version;
  expect((await post({ draftVersion })).status).toBe(409);
  expect((await post({ draftVersion: draftVersion - 1 })).body.error).toBe("changed");
  expect((await post({ draftVersion: "1" })).status).toBe(400);
  const s = await state(request);
  expect(s.profile.published!.version).toBe(1);
  expect(s.profile.versions).toHaveLength(1);
  const html = await homeHtml(request);
  expect(html).toContain("Refusal check baseline");
  expect(html).not.toContain("javascript:alert");
  // Direct writes to profile_published and profile_versions are refused by the database itself;
  // see tests/sql/phase4b-behaviour.sql (the fixture is not PostgreSQL).
});

test("a failed database read while the homepage refreshes keeps the last good page", async ({ page, request }) => {
  await login(page);
  await openEditor(page);
  await setFocus(page, ["Last good version"]);
  await saveDraft(page);
  await publish(page);
  expect(await homeHtml(request)).toContain("Last good version");

  await setFocus(page, ["Unreadable version"]);
  await saveDraft(page);
  // Every read of the published profile fails, including the rebuild the publish route starts.
  await control(request, { rules: [{ method: "GET", path: "/rest/v1/profile_published", remaining: 100, mode: "error" }] });
  await page.getByRole("button", { name: "Review and publish" }).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(status(page, "it will show the new version within a minute")).toBeVisible();
  expect((await state(request)).profile.published!.content.focus).toEqual(["Unreadable version"]);
  for (let i = 0; i < 3; i++) {
    const during = await request.get(`${APP}/`);
    expect(during.status()).toBe(200);
    const body = await during.text();
    expect(body).toContain("Last good version");
    expect(body).not.toContain("Engineering science coursework"); // the seed must never come back as a fallback
  }

  // Once the database answers again, the next requests catch up to the published version.
  await control(request, { rules: [] });
  await expect.poll(async () => (await homeHtml(request)).includes("Unreadable version"), { timeout: 15_000 }).toBe(true);
});

test("anonymous, other-account and cross-origin requests are denied", async ({ page, request, browser }) => {
  expect((await request.post(`${APP}/api/profile/publish`, { headers: { Origin: APP }, data: { draftVersion: 1 } })).status()).toBe(401);
  await login(page);
  expect((await page.request.post(`${APP}/api/profile/publish`, { headers: { Origin: "https://evil.example" }, data: { draftVersion: 1 } })).status()).toBe(403);
  expect((await page.request.post(`${APP}/api/profile/publish`, { data: { draftVersion: 1 } })).status()).toBe(403);

  const anon = await visitor(browser);
  const v = await anon.newPage();
  expect((await v.goto("/vault/portfolio/profile"))!.url()).toContain("/login");
  expect((await v.goto("/vault/portfolio/profile/preview"))!.url()).toContain("/login");
  const headers = { apikey: "fixture-public-key-not-a-real-credential" };
  for (const table of ["profile_drafts", "profile_versions"]) {
    expect((await anon.request.get(`${API}/rest/v1/${table}?select=*`, { headers })).status()).toBe(401);
  }
  for (const column of ["user_id", "version", "*"]) {
    expect((await anon.request.get(`${API}/rest/v1/profile_published?select=${column}`, { headers })).status()).toBe(401);
  }
  expect((await anon.request.get(`${API}/rest/v1/profile_published?select=content,published_at`, { headers })).status()).toBe(200);
  await anon.close();

  const second = await browser.newContext({ baseURL: APP });
  const otherPage = await second.newPage();
  await login(otherPage, "other");
  expect((await otherPage.request.post(`${APP}/api/profile/publish`, { headers: { Origin: APP }, data: { draftVersion: 1 } })).status()).toBe(401);
  expect((await otherPage.goto("/vault/portfolio/profile"))!.url()).not.toMatch(/\/vault\/portfolio\/profile$/);
  await second.close();
  expect((await state(request)).profile.published).toBeNull();
});

test("the homepage with every optional section, the editor and the preview fit 320-1280 px", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await openEditor(page);
  const entry = group(page, /Altech Aluminum/);
  await entry.getByRole("textbox", { name: /Tools/ }).fill("Multimeter, AutoCAD, PLC ladder logic, Thermal camera");
  await entry.getByRole("textbox", { name: /What you learned/ }).fill("A very long learning outcome that should wrap neatly on a narrow phone screen without pushing the layout sideways");
  await page.getByRole("button", { name: "Add certificate" }).click();
  await group(page, "Certificate 1").getByRole("textbox", { name: "Name" }).fill("A certificate with a fairly long name for wrapping");
  await group(page, "Certificate 1").getByRole("textbox", { name: /Link/ }).fill("https://example.com/certificates/very/long/path/to/check/wrapping");
  await saveDraft(page);
  await publish(page);
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/vault/portfolio/profile", "/vault/portfolio/profile/preview", "/vault/portfolio"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
});
