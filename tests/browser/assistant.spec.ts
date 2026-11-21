import { test, expect, type Page, type APIRequestContext, type Browser } from "@playwright/test";

// Phase 5A (the read-only assistant) against the synthetic fixture: migration 017 imitated, and a
// fake Gemini that records exactly what it was sent. No real Gemini call is ever made in tests.
const API = "http://127.0.0.1:4317";
const APP = "http://127.0.0.1:4318";
const OWNER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "dddddddd-0000-4000-8000-0000000000b1";
const KEY = "fixture-gemini-key-never-in-the-browser";
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };
type AiState = {
  requests: { key: string | null; query: string; model: string; body: Record<string, unknown> & { contents: { role: string; parts: { text: string }[] }[] } }[];
  conversations: { id: string; title: string }[]; messages: { role: string; text: string }[];
  usage: { cost_usd: number; outcome: string; input_tokens: number; output_tokens: number }[];
};

async function control(request: APIRequestContext, data: object) {
  expect((await request.post(`${API}/_test/control`, { headers: controlHeaders, data })).ok()).toBeTruthy();
}
async function state(request: APIRequestContext): Promise<{ ai: AiState; work: Record<string, unknown[]> }> {
  return (await request.get(`${API}/_test/state`, { headers: controlHeaders })).json();
}
async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill("owner@fixture.invalid");
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workspace overview" })).toBeVisible();
}
async function seed(request: APIRequestContext) {
  await control(request, { seed: {
    projects: [{ id: PROJECT, title: "Rover", project_type: "hybrid", summary: "A small rover." }],
    project_entries: [
      { id: "eeeeeeee-0000-4000-8000-0000000000b1", project_id: PROJECT, kind: "result", title: "Battery test", body: "Ran 40 minutes.", link: null, created_at: "2026-01-01T00:00:00Z" },
      { id: "eeeeeeee-0000-4000-8000-0000000000b2", project_id: PROJECT, kind: "lesson", title: "Torque lesson", body: "The gearbox slipped under load.", link: null, created_at: "2026-02-01T00:00:00Z" },
    ],
    story_units: [{ id: "eeeeeeee-0000-4000-8000-0000000000c1", project_id: PROJECT, kind: "scene", title: "Market", parent_id: null, summary: "Ada finds the key.", position: 1 }],
  } });
}
async function openAssistant(page: Page) {
  await page.goto(`/vault/projects/${PROJECT}`);
  await page.getByRole("button", { name: "Assistant", exact: true }).or(page.getByRole("tab", { name: "Assistant" })).first().click();
  await expect(page.getByRole("region", { name: "Ask the assistant" }).or(page.getByLabel("Ask the assistant")).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
}
const records = (page: Page) => page.getByRole("group", { name: "Records to send" }).or(page.locator("fieldset").filter({ hasText: "Records to send" })).first();
async function ask(page: Page, question: string) {
  await page.getByRole("textbox", { name: /Your question|Ask a follow-up/ }).fill(question);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
}
const status = (page: Page, text: string | RegExp) => page.locator('[role="status"], [role="alert"]:not(#__next-route-announcer__)').filter({ hasText: text });
async function visitor(browser: Browser) {
  const context = await browser.newContext({ baseURL: APP });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port)) await route.continue();
    else await route.abort("blockedbyclient");
  });
  return context;
}

test.beforeEach(async ({ request, context }) => {
  expect((await request.post(`${API}/_test/reset`, { headers: controlHeaders })).ok()).toBeTruthy();
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && ["4317", "4318"].includes(url.port)) await route.continue();
    else await route.abort("blockedbyclient");
  });
  await seed(request);
});

test("sends exactly the ticked records, shows a cited answer, saves it, and changes nothing", async ({ page, request }) => {
  await login(page);
  const before = (await state(request)).work;
  await openAssistant(page);
  await expect(page.getByText("Tick at least one record to send.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeDisabled();
  await records(page).getByRole("checkbox", { name: /L2 Torque lesson/ }).check();
  await expect(page.getByText(/Sends 1 record \(about [\d,]+ tokens, roughly (under \$0\.01|\$[\d.]+)\) to Google Gemini\./)).toBeVisible();
  await ask(page, "Why did the rover stop climbing?");

  const answer = page.getByRole("list", { name: "Conversation" });
  await expect(answer.getByText("According to the records, this comes from")).toBeVisible();
  await expect(answer.getByRole("link", { name: "[L2]" })).toHaveAttribute("href", "#notebook");
  await expect(answer.getByRole("link", { name: "[L2]" })).toHaveAttribute("title", "Torque lesson");

  const s = await state(request);
  expect(s.ai.requests).toHaveLength(1);
  const sent = s.ai.requests[0];
  expect(sent.key, "key in the header").toBe(KEY);
  expect(sent.query, "never in the address").toBe("");
  expect(sent.model).toBe("gemini-3.8-flash");
  expect(Object.keys(sent.body).sort()).toEqual(["contents", "generationConfig", "systemInstruction"]);
  const text = JSON.stringify(sent.body);
  expect(text).toContain("[L2] Lab entry: Torque lesson\\nType: Lesson\\nDetails: The gearbox slipped under load.");
  for (const absent of ["Battery test", "Ran 40 minutes", "Ada finds the key", "A small rover", OWNER, PROJECT, "owner@fixture.invalid"]) expect(text, absent).not.toContain(absent);
  expect(s.ai.usage).toHaveLength(1);
  expect(s.ai.usage[0].outcome).toBe("ok");
  expect(s.ai.usage[0].cost_usd).toBeGreaterThan(0);
  expect(s.ai.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  expect(s.work, "no project data changed").toEqual(before);

  // A follow-up carries the earlier turn; the saved conversation reopens after a reload.
  await ask(page, "And what should I test next?");
  await expect(answer.getByRole("listitem")).toHaveCount(4);
  const follow = (await state(request)).ai.requests[1].body.contents;
  expect(follow.map((c) => c.role)).toEqual(["user", "model", "user"]);
  expect(follow[0].parts[0].text).toBe("Why did the rover stop climbing?");
  await page.reload();
  await page.getByRole("button", { name: "Why did the rover stop climbing?", exact: true }).click();
  await expect(page.getByRole("list", { name: "Conversation" }).getByRole("listitem")).toHaveCount(4);

  // The key never reaches the browser.
  const scripts = await page.locator("script[src]").evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).src));
  for (const src of scripts) expect(await (await page.request.get(src)).text(), src).not.toContain(KEY);
  expect(await page.content()).not.toContain(KEY);
});

test("an invented citation is flagged and HTML in an answer stays text", async ({ page, request }) => {
  await control(request, { gemini: { text: "It is <b>bold</b> [L1] and also [L9]." } });
  await login(page);
  await openAssistant(page);
  await records(page).getByRole("checkbox", { name: /L1 Battery test/ }).check();
  await ask(page, "How long did it run?");
  const answer = page.getByRole("list", { name: "Conversation" });
  await expect(answer.getByText("It is <b>bold</b>")).toBeVisible();
  await expect(answer.locator("b")).toHaveCount(0);
  await expect(answer.getByText("[L9: not in the records sent]")).toBeVisible();
  await expect(status(page, /cites L9, which wasn't among the records sent/)).toBeVisible();
});

test("limits: the monthly ceiling and daily cap refuse before anything is sent", async ({ page, request }) => {
  await control(request, { aiUsage: { cost_usd: 4.999 } });
  await login(page);
  await openAssistant(page);
  await records(page).getByRole("checkbox", { name: /L2 Torque lesson/ }).check();
  await ask(page, "Anything?");
  await expect(status(page, /spending limit \(\$5\.00\) is reached or this question could pass it.*Nothing was sent\./)).toBeVisible();
  expect((await state(request)).ai.requests).toHaveLength(0);

  for (let i = 0; i < 40; i++) await control(request, { aiUsage: { cost_usd: 0 } });
  await page.reload();
  await expect(page.getByText(/Today's question limit is reached\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeDisabled();
  await page.goto("/vault/settings");
  await expect(page.getByText("Paused (limit reached)")).toBeVisible();
});

test("a Gemini failure shows a clear message, saves nothing and costs nothing", async ({ page, request }) => {
  await control(request, { gemini: { status: 500 } });
  await login(page);
  await openAssistant(page);
  await records(page).getByRole("checkbox", { name: /L2 Torque lesson/ }).check();
  await ask(page, "Why?");
  await expect(status(page, "Gemini couldn't answer (500). Try again.")).toBeVisible();
  const s = await state(request);
  expect(s.ai.conversations).toHaveLength(0);
  expect(s.ai.usage).toEqual([expect.objectContaining({ outcome: "error", cost_usd: 0 })]);
});

test("guards and Settings: visitors can't use the assistant; conversations can be deleted, usage stays", async ({ page, request, browser }) => {
  const anon = await visitor(browser);
  const v = await anon.newPage();
  const body = { projectId: PROJECT, mode: "engineering", question: "x", selected: [{ table: "overview", id: PROJECT }] };
  expect((await v.request.post("/api/ai/ask", { headers: { Origin: APP }, data: body })).status()).toBe(401);
  expect((await v.request.post("/api/ai/ask", { headers: { Origin: "https://evil.example" }, data: body })).status()).toBe(403);
  expect((await v.request.get(`${API}/rest/v1/ai_conversations?select=*`)).status()).toBe(401);
  expect((await v.request.post(`${API}/rest/v1/rpc/record_ai_usage`, { data: { p_model: "m", p_input: 0, p_output: 0, p_cost: 0, p_outcome: "ok" } })).status()).toBe(401);
  await anon.close();
  expect((await state(request)).ai.requests).toHaveLength(0);

  await login(page);
  await openAssistant(page);
  // Records from another mode can't be slipped in.
  const wrong = await page.request.post("/api/ai/ask", { headers: { Origin: APP },
    data: { ...body, selected: [{ table: "story_units", id: "eeeeeeee-0000-4000-8000-0000000000c1" }] } });
  expect(wrong.status()).toBe(400);
  await records(page).getByRole("checkbox", { name: /P1 Project overview/ }).check();
  await ask(page, "Summarise the project.");
  await expect(page.getByRole("list", { name: "Conversation" }).getByRole("link", { name: "[P1]" })).toBeVisible();

  await page.goto("/vault/settings");
  const section = page.getByRole("region", { name: "Assistant (Gemini)" });
  await expect(section.getByText("On", { exact: true })).toBeVisible();
  await expect(section.getByText("gemini-3.8-flash (paid tier)")).toBeVisible();
  await section.getByRole("button", { name: "Delete all conversations" }).click();
  await page.getByRole("group", { name: "Confirm deleting all conversations" }).getByRole("button", { name: "Delete all" }).click();
  await expect(status(page, "1 conversation deleted.")).toBeVisible();
  const s = await state(request);
  expect(s.ai.conversations).toHaveLength(0);
  expect(s.ai.messages).toHaveLength(0);
  expect(s.ai.usage, "usage totals are kept").toHaveLength(1);
});
