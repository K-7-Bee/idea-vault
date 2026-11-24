import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Phase 5B (assistant proposals) against the synthetic fixture and its fake Gemini. Proposals are
// never saved by the route; each Accept is one normal owner insert. No real Gemini call is made.
const API = "http://127.0.0.1:4317";
const PROJECT = "dddddddd-0000-4000-8000-0000000005b1";
const UNIT = "eeeeeeee-0000-4000-8000-0000000005c1";
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };
type Work = { project_tasks: { title: string; status: string; notes: string }[]; project_milestones: { title: string; due_on: string | null }[];
  story_continuity: { subject: string; unit_id: string | null }[] };

async function control(request: APIRequestContext, data: object) {
  expect((await request.post(`${API}/_test/control`, { headers: controlHeaders, data })).ok()).toBeTruthy();
}
async function work(request: APIRequestContext): Promise<Work> {
  return ((await (await request.get(`${API}/_test/state`, { headers: controlHeaders })).json()) as { work: Work }).work;
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
async function openAssistant(page: Page) {
  await page.goto(`/vault/projects/${PROJECT}`);
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Suggest new items" })).toBeVisible();
  await page.waitForLoadState("networkidle");
}
const records = (page: Page) => page.locator("fieldset").filter({ hasText: "Records to send" }).first();
const status = (page: Page, text: string | RegExp) => page.locator('[role="status"], [role="alert"]:not(#__next-route-announcer__)').filter({ hasText: text });

test.beforeEach(async ({ request, context, page }) => {
  expect((await request.post(`${API}/_test/reset`, { headers: controlHeaders })).ok()).toBeTruthy();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port)) await route.continue();
    else await route.abort("blockedbyclient");
  });
  await control(request, { seed: {
    projects: [{ id: PROJECT, title: "Rover", project_type: "hybrid", summary: "A small rover." }],
    project_entries: [{ id: "eeeeeeee-0000-4000-8000-0000000005b1", project_id: PROJECT, kind: "lesson", title: "Torque lesson", body: "The gearbox slipped under load.", link: null, created_at: "2026-02-01T00:00:00Z" }],
    story_units: [{ id: UNIT, project_id: PROJECT, kind: "scene", title: "Market", parent_id: null, summary: "Ada finds the key.", position: 1 }],
  } });
  await login(page);
});

test("engineering proposals: grounded items are listed, nothing is saved until Accept; Reject saves nothing", async ({ page, request }) => {
  await control(request, { gemini: { text: "```json\n" + JSON.stringify({ proposals: [
    { kind: "task", title: "Re-test the gearbox under load", notes: "From the torque lesson [L1].", basis: ["L1"] },
    { kind: "milestone", title: "Gearbox v2 fitted", due_on: "2026-12-20", notes: "", basis: ["L1"] },
    { kind: "task", title: "Ungrounded idea", basis: ["L99"] },
    { kind: "drop_table", title: "x", basis: ["L1"] },
  ] }) + "\n```" } });
  await openAssistant(page);
  await records(page).getByRole("checkbox", { name: /L1 Torque lesson/ }).check();
  await page.getByRole("textbox", { name: "Focus (optional)" }).fill("before the demo");
  await page.getByRole("button", { name: "Suggest items" }).click();
  const list = page.getByRole("list", { name: "Suggestions" });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("2 items were left out: not based on the records you sent, or not in a usable form.")).toBeVisible();
  expect((await work(request)).project_tasks.length).toBe(0); // proposing saved nothing

  await list.getByRole("button", { name: "Reject: Gearbox v2 fitted" }).click();
  await expect(list.getByText("Rejected. Nothing was saved.")).toBeVisible();
  await list.getByRole("button", { name: "Accept: Re-test the gearbox under load" }).click();
  await expect(status(page, "Saved to Tasks.")).toBeVisible();
  const w = await work(request);
  expect(w.project_tasks.map((t) => [t.title, t.status, t.notes])).toEqual([["Re-test the gearbox under load", "todo", "From the torque lesson [L1]."]]);
  expect(w.project_milestones.length).toBe(0);
  // The accepted task is on the Task board straight away.
  await page.getByRole("navigation", { name: "Project sections" }).getByRole("button", { name: "Task board" }).click();
  await expect(page.getByRole("heading", { name: "Re-test the gearbox under load" })).toBeVisible();
});

test("story proposals become continuity notes linked to the cited scene; an unreadable reply shows nothing", async ({ page, request }) => {
  await control(request, { gemini: { text: JSON.stringify({ proposals: [
    { kind: "continuity", subject: "Ada keeps the key in her left pocket", detail: "As in [S1].", unit: "S1", character: null, basis: ["S1"] },
  ] }) } });
  await openAssistant(page);
  await page.locator("label").filter({ has: page.getByRole("radio", { name: /Story memory/ }) }).click();
  await expect(page.getByRole("radio", { name: /Story memory/ })).toBeChecked();
  await records(page).getByRole("checkbox", { name: /S1 .*Market/ }).check();
  await page.getByRole("button", { name: "Suggest items" }).click();
  await page.getByRole("list", { name: "Suggestions" }).getByRole("button", { name: "Accept: Ada keeps the key in her left pocket" }).click();
  await expect(status(page, "Saved to Continuity notes.")).toBeVisible();
  expect((await work(request)).story_continuity.map((c) => [c.subject, c.unit_id])).toEqual([["Ada keeps the key in her left pocket", UNIT]]);

  await control(request, { gemini: { text: "I think you should add a task about the key." } });
  await page.getByRole("button", { name: "Suggest items" }).click();
  await expect(status(page, "couldn't be read as suggestions")).toBeVisible();
});

test("the proposal route refuses visitors, other sites and records outside the mode", async ({ page, request }) => {
  const anonymous = await request.post("/api/ai/propose", { headers: { Origin: "http://127.0.0.1:4318" }, data: { projectId: PROJECT, mode: "engineering", selected: [] } });
  expect(anonymous.status()).toBe(401);
  await openAssistant(page);
  const results = await page.evaluate(async (projectId) => {
    const post = async (body: object, headers: Record<string, string> = {}) =>
      (await fetch("/api/ai/propose", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) })).status;
    return {
      wrongTable: await post({ projectId, mode: "engineering", selected: [{ table: "story_units", id: "eeeeeeee-0000-4000-8000-0000000005c1" }] }),
      tooLongFocus: await post({ projectId, mode: "engineering", focus: "x".repeat(501), selected: [{ table: "project_entries", id: "eeeeeeee-0000-4000-8000-0000000005b1" }] }),
    };
  }, PROJECT);
  expect(results).toEqual({ wrongTable: 400, tooLongFocus: 400 });
  const crossSite = await request.post("/api/ai/propose", { headers: { "sec-fetch-site": "cross-site", origin: "https://example.invalid" }, data: {} });
  expect(crossSite.status()).toBe(403);
});
