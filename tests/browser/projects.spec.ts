import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Phase 2 (projects, Engineering Lab, Story Studio) against the synthetic fixture. Not live Supabase.
const API = "http://127.0.0.1:4317";
const IDEA = "33333333-3333-4333-8333-333333333333";
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };
type Row = Record<string, unknown> & { id: string };
type State = { ideas: Row[]; work: Record<string, Row[]> };

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
const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

async function newProject(page: Page, listPath: string, title: string, type?: string) {
  await page.goto(listPath);
  await page.getByRole("button", { name: "+ New project" }).click();
  await page.getByRole("textbox", { name: "Project title" }).fill(title);
  if (type) await page.getByRole("combobox", { name: "Type" }).selectOption(type);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();
  return page.url().split("/").pop()!.split("#")[0];
}
async function addRecord(page: Page, region: string, button: string, fill: Record<string, string>, selects: Record<string, string> = {}) {
  const area = section(page, region);
  await area.getByRole("button", { name: button }).click();
  for (const [label, value] of Object.entries(selects)) await area.getByRole("combobox", { name: label }).first().selectOption({ label: value });
  for (const [label, value] of Object.entries(fill)) await area.getByLabel(label, { exact: true }).first().fill(value);
  await area.getByRole("button", { name: button.replace("+ ", "") }).last().click();
  await expect(page.getByRole("status").filter({ hasText: "Added" })).toBeVisible();
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

test("an idea becomes one project; converting again opens the same project and the idea is unchanged", async ({ page, request }) => {
  await login(page);
  await page.goto(`/vault/ideas/${IDEA}`);
  await expect(page.getByRole("combobox", { name: "Project type" })).toBeVisible();
  await page.getByRole("combobox", { name: "Project type" }).selectOption("hybrid");
  await page.getByRole("button", { name: "Create or open project" }).click();
  await expect(page).toHaveURL(/\/vault\/projects\/[0-9a-f-]{36}$/);
  const first = page.url();
  await expect(page.getByRole("heading", { name: "Fixture original #test", level: 2 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Fixture original #test" })).toHaveAttribute("href", `/vault/ideas/${IDEA}`);
  // Hybrid shows both workspaces.
  for (const tab of ["Task board", "Lab notebook", "Story Bible", "Structure", "Continuity"]) {
    await expect(page.getByRole("navigation", { name: "Project sections" }).getByRole("button", { name: tab })).toBeVisible();
  }

  await page.goto(`/vault/ideas/${IDEA}`);
  await page.getByRole("button", { name: "Create or open project" }).click();
  await expect(page).toHaveURL(first);
  const current = await state(request);
  expect(current.work.projects).toHaveLength(1);
  expect(current.work.projects[0]).toMatchObject({ project_type: "hybrid", stage: "exploring", publication_status: "private", source_idea_id: IDEA });
  expect(current.ideas[0]).toMatchObject({ content: "Fixture original #test", status: "exploring", updated_at: null });
});

test("Engineering Lab workflow: milestone, task board, next action, notebook, components, links and stale-edit protection", async ({ page, request }) => {
  await login(page);
  const id = await newProject(page, "/vault/lab", "Robot arm");
  await expect(page.getByText("No open tasks. Add one on the task board.")).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Project sections" });
  await expect(tabs.getByRole("button", { name: "Story Bible" })).toHaveCount(0);

  await tabs.getByRole("button", { name: "Milestones" }).click();
  await expect(page).toHaveURL(/#milestones$/);
  await addRecord(page, "Milestones", "+ Add milestone", { Milestone: "First prototype", "Target date (optional)": "2026-12-15" });

  await tabs.getByRole("button", { name: "Task board" }).click();
  await addRecord(page, "Tasks", "+ Add task", { Task: "Wire the base servo" }, { "Milestone (optional)": "First prototype" });
  await addRecord(page, "Tasks", "+ Add task", { Task: "Print the gripper" });
  const todo = section(page, "To do");
  await expect(todo.getByRole("heading", { name: "Wire the base servo" })).toBeVisible();
  await todo.locator("li", { hasText: "Print the gripper" }).getByRole("button", { name: "Doing →" }).click();
  await expect(section(page, "Doing").getByRole("heading", { name: "Print the gripper" })).toBeVisible();

  await tabs.getByRole("button", { name: "Overview" }).click();
  await expect(page.getByText("In progress:")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print the gripper" })).toBeVisible();

  await tabs.getByRole("button", { name: "Lab notebook" }).click();
  await addRecord(page, "Lab notebook", "+ Add entry", { Title: "Servo stall test", "Evidence link (optional)": "https://example.invalid/log.csv" },
    { Type: "Test evidence" });
  await expect(page.getByRole("link", { name: "https://example.invalid/log.csv" })).toHaveAttribute("rel", /noopener/);

  await tabs.getByRole("button", { name: "Components" }).click();
  const comps = section(page, "Components");
  await comps.getByRole("button", { name: "+ Add component" }).click();
  await comps.getByLabel("Component", { exact: true }).fill("MG996R servo");
  await comps.getByLabel("Quantity (optional)").fill("2");
  await comps.getByLabel("Unit (optional)").fill("pcs");
  await comps.getByLabel("Datasheet or source (optional)").fill("javascript:alert(1)");
  await comps.getByRole("button", { name: "Add component" }).last().click();
  // The browser's own URL check or ours refuses it; either way nothing is saved.
  expect((await state(request)).work.project_components).toHaveLength(0);
  await comps.getByLabel("Datasheet or source (optional)").fill("");
  await comps.getByRole("button", { name: "Add component" }).last().click();
  await expect(comps.getByText("2 pcs")).toBeVisible();

  await tabs.getByRole("button", { name: "Code & links" }).click();
  await addRecord(page, "Links & references", "+ Add link", { Name: "Firmware repo", Address: "https://github.com/example/arm" }, { Type: "Repository" });

  // Reload: everything comes back from the server, and the tab is kept.
  await page.reload();
  await expect(page.getByRole("link", { name: "https://github.com/example/arm" })).toBeVisible();
  const saved = await state(request);
  expect(saved.work.project_tasks.map((t) => [t.title, t.status])).toEqual(expect.arrayContaining([["Wire the base servo", "todo"], ["Print the gripper", "doing"]]));
  expect(saved.work.project_tasks.find((t) => t.title === "Wire the base servo")!.milestone_id).toBe(saved.work.project_milestones[0].id);

  // Another device edits the task; this tab must not overwrite it and must keep its edit.
  await page.goto(`/vault/projects/${id}#tasks`);
  const card = page.locator("li", { hasText: "Wire the base servo" }).last();
  await card.getByRole("button", { name: "Edit" }).click();
  await section(page, "Tasks").getByLabel("Task", { exact: true }).fill("Edit from this tab");
  await control(request, { editRow: { table: "project_tasks", id: saved.work.project_tasks.find((t) => t.title === "Wire the base servo")!.id, changes: { title: "Changed elsewhere" } } });
  await section(page, "Tasks").getByRole("button", { name: "Save", exact: true }).click();
  await expect(appAlert(page)).toContainText("changed in another tab or device");
  await expect(section(page, "Tasks").getByLabel("Task", { exact: true })).toHaveValue("Edit from this tab");
  expect((await state(request)).work.project_tasks.some((t) => t.title === "Changed elsewhere")).toBeTruthy();

  // Deleting the milestone keeps its task.
  await page.goto(`/vault/projects/${id}#milestones`);
  await section(page, "Milestones").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Deleted milestone." })).toBeVisible();
  const after = await state(request);
  expect(after.work.project_tasks).toHaveLength(2);
  expect(after.work.project_tasks.every((t) => t.milestone_id === null)).toBeTruthy();
});

test("Story Studio workflow: bible, characters, relationships, nested structure with shot panels, timeline and continuity", async ({ page, request }) => {
  await login(page);
  const id = await newProject(page, "/vault/story", "Storm Road");
  const tabs = page.getByRole("navigation", { name: "Project sections" });
  await expect(tabs.getByRole("button", { name: "Task board" })).toHaveCount(0);

  await tabs.getByRole("button", { name: "Story Bible" }).click();
  await addRecord(page, "Story Bible", "+ Add entry", { Title: "Storms carry memories" }, { Section: "Rules" });
  await expect(section(page, "Rules")).toBeVisible();

  await tabs.getByRole("button", { name: "Characters" }).click();
  await expect(page.getByText("Add at least two characters to record a relationship.")).toBeVisible();
  await addRecord(page, "Characters", "+ Add character", { Name: "Mira", "Role (optional)": "Protagonist" });
  await addRecord(page, "Characters", "+ Add character", { Name: "Oren" });
  await addRecord(page, "Relationships", "+ Add relationship", { Relationship: "sister of" }, { Character: "Mira", To: "Oren" });
  await expect(page.getByRole("heading", { name: "Mira — sister of → Oren" })).toBeVisible();

  await tabs.getByRole("button", { name: "Structure" }).click();
  await addRecord(page, "Structure", "+ Add item", { Title: "Season One" }, { Level: "Season" });
  await page.locator("li", { hasText: "Season One" }).getByRole("button", { name: "+ Add inside" }).first().click();
  const structure = section(page, "Structure");
  await structure.getByRole("combobox", { name: "Level" }).selectOption("scene");
  await structure.getByLabel("Title", { exact: true }).fill("The market");
  await structure.getByRole("button", { name: "Add item" }).last().click();
  await expect(page.getByRole("status").filter({ hasText: "Added" })).toBeVisible();
  await page.locator("li", { hasText: "The market" }).last().getByRole("button", { name: "+ Add inside" }).click();
  await expect(structure.getByRole("combobox", { name: "Level" })).toHaveValue("shot");
  await structure.getByLabel("Title", { exact: true }).fill("Close on Mira");
  await structure.getByLabel("Camera / framing (optional)").fill("85mm, slow push-in");
  await structure.getByRole("button", { name: "Add item" }).last().click();
  await expect(page.getByRole("heading", { name: /Shot\s*Close on Mira/ })).toBeVisible();

  // A scene that still contains a shot cannot be deleted.
  await page.locator("li", { hasText: "The market" }).last().getByRole("button", { name: "Delete" }).first().click();
  await expect(appAlert(page)).toContainText("still contains");
  expect((await state(request)).work.story_units).toHaveLength(3);

  await tabs.getByRole("button", { name: "Continuity" }).click();
  await addRecord(page, "Continuity", "+ Add record", { "What must stay consistent": "Scar on left hand" },
    { "Scene / shot (optional)": "Season: Season One › Scene: The market › Shot: Close on Mira", "Character (optional)": "Mira" });
  await expect(page.getByText("Season: Season One › Scene: The market › Shot: Close on Mira")).toBeVisible();

  await tabs.getByRole("button", { name: "Timeline" }).click();
  await addRecord(page, "Timeline", "+ Add event", { Event: "The storm arrives", "When (in the story) (optional)": "Day 3, dusk" });

  // Deleting the shot keeps the continuity record and clears only its scene/shot link.
  await tabs.getByRole("button", { name: "Structure" }).click();
  await page.locator("li", { hasText: "Close on Mira" }).last().getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Deleted item." })).toBeVisible();
  await tabs.getByRole("button", { name: "Continuity" }).click();
  await expect(page.getByRole("heading", { name: "Scar on left hand" })).toBeVisible();
  await expect(page.getByText("Close on Mira")).toHaveCount(0);
  const saved = await state(request);
  expect(saved.work.story_continuity[0]).toMatchObject({ unit_id: null, subject: "Scar on left hand" });
  expect(saved.work.story_continuity[0].character_id).toBe(saved.work.story_characters.find((c) => c.name === "Mira")!.id);
  expect(saved.work.projects[0]).toMatchObject({ id, project_type: "story" });
});

test("project overview edits stage and showcase separately, cannot publish, and archives without deleting", async ({ page, request }) => {
  await login(page);
  await newProject(page, "/vault/projects", "Showcase check");
  await page.getByRole("button", { name: "Edit project" }).click();
  const showcase = page.getByRole("combobox", { name: "Showcase" });
  await expect(showcase.locator("option")).toHaveText(["Private", "Ready to showcase"]);
  await page.getByRole("combobox", { name: "Stage" }).selectOption("completed");
  await showcase.selectOption("ready");
  await page.getByRole("textbox", { name: "Goals" }).fill("Measure real torque");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Measure real torque")).toBeVisible();
  // The page can show the edit before the save reaches the fixture, so wait for the saved row
  // (6C: this read raced on CI and once locally).
  await expect.poll(async () => (await state(request)).work.projects[0])
    .toMatchObject({ stage: "completed", publication_status: "ready", goals: "Measure real torque", version: 2 });

  await page.getByRole("button", { name: "Archive project" }).click();
  await expect(page.getByRole("button", { name: "Restore project" })).toBeVisible();
  await expect.poll(async () => (await state(request)).work.projects[0].archived_at).not.toBeNull();
  await page.goto("/vault/projects");
  await expect(page.getByText("Archived projects (1)")).toBeVisible();

  // The public portfolio never reads private projects.
  await page.goto("/projects");
  await expect(page.getByText("Showcase check")).toHaveCount(0);
});

test("project pages are denied to other accounts and anonymous visitors, unknown ids are not found", async ({ page, request }) => {
  await login(page);
  const id = await newProject(page, "/vault/projects", "Private project");
  await page.getByRole("button", { name: "Log out", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Vault locked" })).toBeVisible();
  await expect(page.getByText("Private project")).toBeHidden();

  await page.context().clearCookies();
  await page.goto(`/vault/projects/${id}`); await expect(page).toHaveURL(/\/login$/);
  expect((await request.get(`${API}/rest/v1/projects`)).status()).toBe(401);
  await login(page, "other");
  await page.goto(`/vault/projects/${id}`); await expect(page).toHaveURL(/denied=1/);
  const session = await (await request.post(`${API}/auth/v1/token?grant_type=password`, {
    data: { email: "other@fixture.invalid", password: "synthetic-test-password" },
  })).json();
  const headers = { authorization: `Bearer ${session.access_token}` };
  expect(await (await request.get(`${API}/rest/v1/projects`, { headers })).json()).toEqual([]);
  expect(await (await request.patch(`${API}/rest/v1/projects?id=eq.${id}`, { headers, data: { title: "hijack" } })).json()).toEqual([]);

  await login(page);
  await page.goto("/vault/projects/99999999-9999-4999-8999-999999999999");
  await expect(page.getByRole("heading", { name: "Project not found" })).toBeVisible();
  await page.goto("/vault/projects/not-an-id");
  await expect(page.getByRole("heading", { name: "Project not found" })).toBeVisible();
});

test("project lists and workspaces fit phone widths without horizontal scrolling", async ({ page }) => {
  await login(page);
  const id = await newProject(page, "/vault/projects", "A deliberately long project title ".repeat(4).trim(), "hybrid");
  for (const path of ["/vault/projects", "/vault/lab", "/vault/story", `/vault/projects/${id}`, `/vault/projects/${id}#structure`]) {
    await page.goto(path);
    await expect(page.locator("main h2").first()).toBeVisible();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, `${path} at ${width}px`).toBeLessThanOrEqual(width);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});
