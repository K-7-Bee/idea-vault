import { test, expect, type Page, type APIRequestContext, type Browser } from "@playwright/test";

// Phase 4A (publishing projects to the public site) against the synthetic fixture, which imitates
// migration 013's tables, functions and triggers and the public "showcase" bucket. Not live
// Supabase or Google; the real database rules are tested in tests/sql/phase4a-behaviour.sql.
const API = "http://127.0.0.1:4317";
const APP = "http://127.0.0.1:4318";
const FOLDER = "fixture-folder-0001";
const OWNER = "11111111-1111-4111-8111-111111111111";
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };
type Live = { project_id: string; slug: string; title: string; images: { path: string; alt: string }[]; sections: { key: string; body: string }[] };
type State = {
  showcase: { drafts: { project_id: string; version: number }[]; live: Live[]; objects: { path: string; size: number; type: string }[] };
  work: { projects: { id: string; stage: string; publication_status: string }[] };
  simple: { project_files: { id: string; drive_file_id: string }[] };
};

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
const tabs = (page: Page) => page.getByRole("navigation", { name: "Project sections" });
const status = (page: Page, text: string | RegExp) => page.locator('[role="status"], [role="alert"]:not(#__next-route-announcer__)').filter({ hasText: text });
async function post(page: Page, path: string, body: object) {
  return page.evaluate(async ({ path, body }) => {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, { path, body });
}

// A completed engineering project with private text and one linked Drive image.
async function completedProject(page: Page, title: string, images = ["fixture-img-000001"]) {
  await page.goto("/vault/projects");
  await page.getByRole("button", { name: "+ New project" }).click();
  await page.getByRole("textbox", { name: "Project title" }).fill(title);
  await page.getByRole("combobox", { name: "Type" }).selectOption("engineering");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();
  const projectId = page.url().split("/").pop()!.split("#")[0];
  if (images.length) expect((await post(page, "/api/drive/project-files", { projectId, driveFileIds: images })).status).toBe(200);
  await page.reload();
  await setStage(page, "completed", "PRIVATE-SUMMARY supplier quote and internal notes");
  return projectId;
}
async function setStage(page: Page, stage: string, summary?: string) {
  await tabs(page).getByRole("button", { name: "Overview" }).click();
  await page.getByRole("button", { name: "Edit project" }).click();
  await page.getByRole("combobox", { name: "Stage" }).selectOption(stage);
  if (summary) await page.getByRole("textbox", { name: "Summary" }).fill(summary);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(status(page, "Saved.")).toBeVisible();
}
async function fillShowcase(page: Page, slug: string, title: string) {
  await tabs(page).getByRole("button", { name: "Showcase" }).click();
  await page.getByRole("textbox", { name: "Public title" }).fill(title);
  await page.getByRole("textbox", { name: "Web address" }).fill(slug);
  await page.getByRole("textbox", { name: /Category/ }).fill("Robotics");
  await page.getByRole("textbox", { name: /Tools and topics/ }).fill("Arduino, C++, arduino");
  await page.getByRole("textbox", { name: /Public summary/ }).fill("A small rover that follows a taped line.");
  await page.getByText("Case study sections").click();
  await page.getByRole("textbox", { name: "The problem" }).fill("Follow a line on a classroom floor.");
  await page.getByRole("textbox", { name: "Lessons learned" }).fill("Tune the controller slowly.");
  await page.getByRole("button", { name: "Add link" }).click();
  await page.getByRole("textbox", { name: "Link 1 label" }).fill("Source code");
  await page.getByRole("textbox", { name: "Link 1 address" }).fill("https://example.com/rover");
}
async function addFirstImage(page: Page, alt: string) {
  await page.getByRole("list", { name: "Project images you can add" }).getByRole("button").first().click();
  await page.getByRole("textbox", { name: "Description of image 1" }).fill(alt);
}
async function saveDraft(page: Page) {
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(status(page, "Showcase draft saved")).toBeVisible();
}
async function publish(page: Page) {
  await page.getByRole("button", { name: /^Review and publish/ }).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(status(page, "Published. It's on your public site now.")).toBeVisible();
}
// With Cache Components a request-time page always starts with HTTP 200, so "gone" means the
// not-found page, a noindex tag and none of the project's text: a soft 404.
async function expectGone(v: Page, slug: string) {
  const response = await v.goto(`/projects/${slug}`);
  expect(response!.headers()["cache-control"] ?? "").not.toMatch(/public|s-maxage/);
  await expect(v.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  await expect(v.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  expect(await v.locator("main, body").first().innerText()).not.toMatch(/Explore project|Lessons learned|The problem/);
}
async function expectLive(v: Page, slug: string) {
  await v.goto(`/projects/${slug}`);
  await expect(v.getByRole("heading", { level: 1 })).not.toHaveText("This page could not be found.");
  await expect(v.getByRole("link", { name: "← All projects" })).toBeVisible();
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

test.beforeEach(async ({ request, context, page }) => {
  expect((await request.post(`${API}/_test/reset`, { headers: controlHeaders })).ok()).toBeTruthy();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port)) await route.continue();
    else await route.abort("blockedbyclient");
  });
  page.on("dialog", (dialog) => dialog.accept());
});

test("an image without a description is marked, can be saved, and blocks publishing until described", async ({ page, request }) => {
  await login(page);
  await connectDrive(page);
  await completedProject(page, "Rover internal codename");
  await fillShowcase(page, "line-rover", "Line-following rover");
  await page.getByRole("list", { name: "Project images you can add" }).getByRole("button").first().click();
  const description = page.getByRole("textbox", { name: "Description of image 1" });
  await expect(description).toHaveAttribute("aria-invalid", "true");
  await expect(description).toHaveAccessibleDescription(/Description needed to publish/);
  await expect(page.getByText("1 image still needs a description.")).toBeVisible();

  // An incomplete draft still saves; publishing stays blocked and says why.
  await saveDraft(page);
  await expect(page.getByText(/Not ready to publish yet/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Before you can publish" })).toContainText("Describe image 1");
  await expect(page.getByRole("button", { name: /^Review and publish/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Go to image 1's description" }).click();
  await expect(description).toBeFocused();

  await description.fill("The rover on its test track");
  await expect(description).toHaveAttribute("aria-invalid", "false");
  await expect(page.getByText("1 image still needs a description.")).toHaveCount(0);
  await saveDraft(page);
  await publish(page);
  expect((await state(request)).showcase.live[0].images[0].alt).toBe("The rover on its test track");
});

test("draft, preview, confirm and publish: visitors see only the chosen fields; unpublish takes it down", async ({ page, request, browser }) => {
  await login(page);
  await connectDrive(page);
  const projectId = await completedProject(page, "Rover internal codename");
  await fillShowcase(page, "line-rover", "Line-following rover");
  await addFirstImage(page, "The rover on its test track");
  // Publishing needs a saved draft; the preview shows the saved draft.
  await expect(page.getByText("Unsaved changes. Save to preview or publish.")).toBeVisible();
  await saveDraft(page);

  const [preview] = await Promise.all([page.waitForEvent("popup"), page.getByRole("link", { name: /Preview/ }).click()]);
  await expect(preview.getByRole("heading", { name: "Line-following rover", level: 1 })).toBeVisible();
  await expect(preview.getByText("Preview of the saved draft")).toBeVisible();
  await expect(preview.getByRole("img", { name: "The rover on its test track" })).toHaveAttribute("src", /\/api\/drive\/file\/.+\?size=thumb/);
  await expect(preview.getByRole("heading", { name: "The problem" })).toBeVisible();
  await expect(preview.getByRole("heading", { name: "Objective" })).toHaveCount(0);
  await preview.close();

  // Nothing is public before confirming.
  const anon = await visitor(browser);
  const v = await anon.newPage();
  await expectGone(v, "line-rover");

  await page.getByRole("button", { name: "Review and publish" }).click();
  const confirm = page.getByRole("group", { name: "Confirm what becomes public" });
  await expect(confirm).toContainText("/projects/line-rover");
  await expect(confirm).toContainText("Section: The problem");
  await expect(confirm).toContainText("1 image: “The rover on its test track”");
  await expect(confirm).toContainText("Link: Source code (https://example.com/rover)");
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(status(page, "Published. It's on your public site now.")).toBeVisible();
  await expect(page.getByText("On your public site", { exact: true })).toBeVisible();

  let s = await state(request);
  expect(s.work.projects.find((p) => p.id === projectId)!.publication_status).toBe("published");
  expect(s.showcase.objects).toHaveLength(1);
  const copy = s.showcase.objects[0];
  expect(copy.path).toMatch(new RegExp(`^${OWNER}/[0-9a-f-]{36}\\.png$`));
  expect(copy.type).toBe("image/png");

  // The visitor's view: the list, the page, the public image copy.
  await v.goto("/projects");
  await expect(v.getByRole("link", { name: /Line-following rover/ })).toBeVisible();
  await expect(v.getByRole("link", { name: /Waste-to-Energy Lighting/ })).toBeVisible();
  const response = await v.goto("/projects/line-rover");
  expect(response!.headers()["cache-control"] ?? "").not.toMatch(/public|s-maxage/);
  await expect(v.getByRole("heading", { name: "Line-following rover", level: 1 })).toBeVisible();
  await expect(v.getByText("Robotics")).toBeVisible();
  await expect(v.getByRole("list", { name: "Project topics and technologies" }).getByRole("listitem")).toHaveText(["Arduino", "C++"]);
  await expect(v.getByRole("heading", { name: "Lessons learned" })).toBeVisible();
  const img = v.getByRole("img", { name: "The rover on its test track" });
  await expect(img).toHaveAttribute("src", `${API}/storage/v1/object/public/showcase/${copy.path}`);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
  await expect(v.getByRole("link", { name: /Source code/ })).toHaveAttribute("href", "https://example.com/rover");
  const html = await v.content();
  for (const secret of ["PRIVATE-SUMMARY", "Rover internal codename", projectId, "fixture-img-000001", "/api/drive/"]) expect(html).not.toContain(secret);

  // Unpublish: gone on the next request, image copy removed, draft kept.
  await page.getByRole("button", { name: "Unpublish" }).click();
  await expect(status(page, "Unpublished.")).toBeVisible();
  await expectGone(v, "line-rover");
  await v.goto("/projects");
  await expect(v.getByRole("link", { name: /Line-following rover/ })).toHaveCount(0);
  expect((await anon.request.get(`${API}/storage/v1/object/public/showcase/${copy.path}`)).status()).not.toBe(200);
  s = await state(request);
  expect(s.showcase.objects).toHaveLength(0);
  expect(s.showcase.drafts).toHaveLength(1);
  expect(s.work.projects.find((p) => p.id === projectId)!.publication_status).toBe("ready");
  await anon.close();
});

test("leaving Completed, archiving, or setting Ready in the editor takes the page down at once", async ({ page, request, browser }) => {
  await login(page);
  await connectDrive(page);
  await completedProject(page, "Weather station");
  await fillShowcase(page, "weather-station", "Weather station");
  await addFirstImage(page, "Sensor board");
  await saveDraft(page);
  await publish(page);
  const anon = await visitor(browser);
  const v = await anon.newPage();
  await expectLive(v, "weather-station");

  // 1. Stage back to Building.
  await setStage(page, "building");
  await expectGone(v, "weather-station");
  await tabs(page).getByRole("button", { name: "Showcase" }).click();
  await expect(page.getByText("Not on your public site.")).toBeVisible();
  await expect(page.getByText("Set the project's stage to Completed first.")).toBeVisible();
  // Completing it again does not republish by itself.
  await setStage(page, "completed");
  await expectGone(v, "weather-station");

  // 2. Archive.
  await tabs(page).getByRole("button", { name: "Showcase" }).click();
  await publish(page);
  await expectLive(v, "weather-station");
  await tabs(page).getByRole("button", { name: "Overview" }).click();
  await page.getByRole("button", { name: "Archive project" }).click();
  await expect(status(page, /Archived/)).toBeVisible();
  await expectGone(v, "weather-station");
  await page.getByRole("button", { name: "Restore project" }).click();
  await expect(status(page, "Restored.")).toBeVisible();
  await expectGone(v, "weather-station");

  // 3. Showcase set back to Ready in the Overview form.
  await tabs(page).getByRole("button", { name: "Showcase" }).click();
  await publish(page);
  await tabs(page).getByRole("button", { name: "Overview" }).click();
  await page.getByRole("button", { name: "Edit project" }).click();
  await page.getByRole("combobox", { name: "Showcase" }).selectOption("ready");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(status(page, "Saved.")).toBeVisible();
  await expectGone(v, "weather-station");
  expect((await state(request)).showcase.live).toHaveLength(0);

  // Leftover public copies (made more than a few minutes ago) are removed when the Portfolio page opens.
  await control(request, { showcaseObjectAge: 10 * 60_000 });
  expect((await state(request)).showcase.objects.length).toBeGreaterThan(0);
  await page.goto("/vault/portfolio");
  await expect(page.getByRole("heading", { name: "Portfolio", level: 2 })).toBeVisible();
  await expect.poll(async () => (await state(request)).showcase.objects.length).toBe(0);
  await expect(page.getByRole("region", { name: "Ready to showcase" }).getByRole("link", { name: "Weather station" })).toBeVisible();
  await anon.close();
});

test("refusals: not completed, stale draft, reserved or taken address, mislabelled image, and direct publishing", async ({ page, request }) => {
  await login(page);
  await connectDrive(page);
  const projectId = await completedProject(page, "Clock", ["fixture-img-000001", "fixture-img-000002"]);
  await tabs(page).getByRole("button", { name: "Showcase" }).click();
  await page.getByRole("textbox", { name: "Web address" }).fill("idea-vault");
  await page.getByRole("textbox", { name: /Public summary/ }).fill("A clock.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(status(page, "That address belongs to one of the existing case studies.")).toBeVisible();
  await page.getByRole("textbox", { name: "Web address" }).fill("desk-clock");
  await saveDraft(page);
  const version = (await state(request)).showcase.drafts[0].version;

  // The draft changed after the owner reviewed it.
  expect((await post(page, "/api/showcase/publish", { projectId, draftVersion: version - 1 })).status).toBe(409);
  // A project can't be marked published without going through the Showcase tab.
  const signIn = await request.post(`${API}/auth/v1/token?grant_type=password`, { data: { email: "owner@fixture.invalid", password: "synthetic-test-password" } });
  const token = (await signIn.json()).access_token as string;
  const direct = await request.patch(`${API}/rest/v1/projects?id=eq.${projectId}`, {
    headers: { apikey: "fixture-public-key-not-a-real-credential", Authorization: `Bearer ${token}` }, data: { publication_status: "published" } });
  expect(direct.status()).toBe(400);
  expect((await direct.json()).message).toMatch(/Showcase tab/);
  expect((await state(request)).work.projects.find((p) => p.id === projectId)!.publication_status).not.toBe("published");

  // Bytes that aren't really an image are never published, and nothing is left behind.
  await control(request, { googleBytes: { id: "fixture-img-000002", text: "<svg onload=alert(1)></svg>" } });
  await page.getByRole("list", { name: "Project images you can add" }).getByRole("button", { name: /forest\.png/ }).click();
  await page.getByRole("textbox", { name: "Description of image 1" }).fill("Forest");
  await saveDraft(page);
  await page.getByRole("button", { name: "Review and publish" }).click();
  await page.getByRole("button", { name: "Publish now" }).click();
  await expect(status(page, /isn't a JPEG, PNG or WebP image/)).toBeVisible();
  let s = await state(request);
  expect(s.showcase.objects).toHaveLength(0);
  expect(s.showcase.live).toHaveLength(0);

  // Back to a real image, then a second project can't take the same address.
  await page.getByRole("button", { name: "Remove" }).first().click();
  await saveDraft(page);
  await publish(page);
  const other = await completedProject(page, "Clock two", []);
  await fillShowcase(page, "desk-clock", "Clock two");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(status(page, "Another project's showcase already uses that address.")).toBeVisible();

  // Not completed: refused by the route even if called directly.
  await setStage(page, "analyzing");
  await tabs(page).getByRole("button", { name: "Showcase" }).click();
  await page.getByRole("textbox", { name: "Web address" }).fill("clock-two");
  await saveDraft(page);
  const draft = (await state(request)).showcase.drafts.find((d) => d.project_id === other)!;
  const refused = await post(page, "/api/showcase/publish", { projectId: other, draftVersion: draft.version });
  expect(refused.status).toBe(409);
  expect(refused.body.message).toMatch(/Completed/);
  s = await state(request);
  expect(s.showcase.live.map((l) => l.slug)).toEqual(["desk-clock"]);
});

test("anonymous, other-account and cross-origin requests are denied; visitors can't read private tables", async ({ page, request, browser }) => {
  await login(page);
  await connectDrive(page);
  const projectId = await completedProject(page, "Private rover");
  await fillShowcase(page, "private-rover", "Public rover");
  await saveDraft(page);
  await publish(page);

  for (const path of ["/api/showcase/publish", "/api/showcase/unpublish", "/api/showcase/cleanup"]) {
    expect((await request.post(`${APP}${path}`, { headers: { Origin: APP }, data: { projectId, draftVersion: 1 } })).status()).toBe(401);
    expect((await page.request.post(`${APP}${path}`, { headers: { Origin: "https://evil.example" }, data: { projectId } })).status()).toBe(403);
    expect((await page.request.post(`${APP}${path}`, { data: { projectId } })).status()).toBe(403);
  }
  const anon = await visitor(browser);
  const v = await anon.newPage();
  expect((await v.goto("/vault/portfolio"))!.url()).toContain("/login");
  expect((await v.goto(`/vault/portfolio/preview/${projectId}`))!.url()).toContain("/login");
  const headers = { apikey: "fixture-public-key-not-a-real-credential" };
  for (const table of ["projects", "project_showcases", "project_files", "ideas"]) {
    expect((await anon.request.get(`${API}/rest/v1/${table}?select=*`, { headers })).status()).toBe(401);
  }
  expect((await anon.request.get(`${API}/rest/v1/showcases?select=user_id`, { headers })).status()).toBe(401);
  expect((await anon.request.get(`${API}/rest/v1/showcases?select=project_id`, { headers })).status()).toBe(401);
  expect((await anon.request.post(`${API}/storage/v1/object/list/showcase`, { headers, data: { prefix: OWNER } })).status()).toBe(401);
  await anon.close();

  // Another signed-in account can't reach the Vault or publish anything.
  const second = await browser.newContext({ baseURL: APP });
  const otherPage = await second.newPage();
  await login(otherPage, "other");
  expect((await otherPage.request.post(`${APP}/api/showcase/unpublish`, { headers: { Origin: APP }, data: { projectId } })).status()).toBe(401);
  await second.close();
  expect((await state(request)).showcase.live).toHaveLength(1);
});

test("the hand-written case studies are unchanged and the Showcase tab fits 320-1280 px", async ({ page }) => {
  for (const slug of ["waste-to-energy-lighting", "cha-restaurant", "idea-vault"]) {
    const r = await page.goto(`/projects/${slug}`);
    expect(r!.status()).toBe(200);
    await expect(page.getByRole("complementary", { name: "Other projects" })).toBeVisible();
  }
  await login(page);
  await connectDrive(page);
  await completedProject(page, "Narrow screen check");
  await fillShowcase(page, "narrow-check", "Narrow screen check");
  await addFirstImage(page, "Board");
  await saveDraft(page);
  await publish(page);
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [page.url(), "/vault/portfolio", "/projects/narrow-check"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
});
