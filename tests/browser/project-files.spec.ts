import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Phase 3C (project files in Google Drive) against the synthetic fixture and synthetic Google.
// The real Google Picker is an external script (blocked here), so linking is driven through the
// same route the Picker result is sent to. Not live Google or Supabase.
const API = "http://127.0.0.1:4317";
const APP = "http://127.0.0.1:4318";
const FOLDER = "fixture-folder-0001";
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };
type PF = { id: string; project_id: string; entry_id: string | null; component_id: string | null; source: string; drive_file_id: string;
  name: string; size: number | null; state: string; state_reason: string | null };
type GFile = { id: string; name: string; mimeType: string; parents?: string[]; uploaded?: boolean; created?: boolean };
type State = { simple: { project_files: PF[]; drive_folders: { purpose: string; folder_id: string; parent_folder_id: string; project_id?: string }[] };
  google: { files: GFile[] }; work: Record<string, { id: string }[]> };

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

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
async function newProject(page: Page, title: string) {
  await page.goto("/vault/projects");
  await page.getByRole("button", { name: "+ New project" }).click();
  await page.getByRole("textbox", { name: "Project title" }).fill(title);
  await page.getByRole("combobox", { name: "Type" }).selectOption("engineering");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();
  return page.url().split("/").pop()!.split("#")[0];
}
const tabs = (page: Page) => page.getByRole("navigation", { name: "Project sections" });
const section = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const filesTab = async (page: Page) => {
  await tabs(page).getByRole("button", { name: /^Files/ }).click();
  await expect(page.getByRole("heading", { name: "Files", level: 3 })).toBeVisible();
};
const status = (page: Page, text: string | RegExp) => page.locator('[role="status"], [role="alert"]:not(#__next-route-announcer__)').filter({ hasText: text });
async function link(page: Page, body: object) {
  return page.evaluate(async (data) => {
    const r = await fetch("/api/drive/project-files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    return { status: r.status, body: await r.json() };
  }, body);
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

test("uploads go to Projects/<title> in Drive, reuse the folder, and can be attached to a lab entry", async ({ page, request }) => {
  await login(page);
  await connectDrive(page);
  const projectId = await newProject(page, "Robot arm");
  await tabs(page).getByRole("button", { name: "Lab notebook" }).click();
  const notebook = section(page, "Lab notebook");
  await notebook.getByRole("button", { name: "+ Add entry" }).click();
  await notebook.getByLabel("Title", { exact: true }).first().fill("Servo stall test");
  await notebook.getByRole("button", { name: "Add entry" }).last().click();
  await expect(notebook.getByRole("heading", { name: /Servo stall test/ })).toBeVisible();

  await filesTab(page);
  await page.getByRole("combobox", { name: "Attach new files to" }).selectOption({ label: "Notebook: Servo stall test" });
  await page.getByLabel("Files to upload").setInputFiles([{ name: "scope.png", mimeType: "image/png", buffer: PNG }]);
  await expect(status(page, "Uploaded to Google Drive: scope.png")).toBeVisible();
  await page.getByLabel("Files to upload").setInputFiles([{ name: "log.csv", mimeType: "text/csv", buffer: Buffer.from("t,amps\n0,1.2\n") }]);
  await expect(status(page, "Uploaded to Google Drive: log.csv")).toBeVisible();

  const s = await state(request);
  const root = s.simple.drive_folders.find((f) => f.purpose === "projects_root")!;
  const own = s.simple.drive_folders.find((f) => f.purpose === "project")!;
  expect(s.simple.drive_folders).toHaveLength(2); // second upload reused both folders
  expect(root.parent_folder_id).toBe(FOLDER);
  expect(own.parent_folder_id).toBe(root.folder_id);
  expect(own.project_id).toBe(projectId);
  expect(s.google.files.find((f) => f.id === root.folder_id)!.name).toBe("Projects");
  expect(s.google.files.find((f) => f.id === own.folder_id)!.name).toBe("Robot arm");
  const rows = s.simple.project_files;
  expect(rows.map((r) => [r.name, r.source, r.project_id])).toEqual(expect.arrayContaining([["scope.png", "upload", projectId], ["log.csv", "upload", projectId]]));
  for (const r of rows) expect(s.google.files.find((g) => g.id === r.drive_file_id)!.parents).toEqual([own.folder_id]);
  const entry = s.work.project_entries[0];
  expect(rows.filter((r) => r.entry_id === entry.id).map((r) => r.name).sort()).toEqual(["log.csv", "scope.png"]);

  // The image previews from the Vault; the entry lists its files.
  const png = rows.find((r) => r.name === "scope.png")!;
  await expect(page.locator(`img[src="/api/drive/file/${png.id}"]`)).toBeVisible();
  expect((await page.request.get(`/api/drive/file/${png.id}`)).headers()["content-type"]).toBe("image/png");
  await tabs(page).getByRole("button", { name: "Lab notebook" }).click();
  await expect(page.getByRole("list", { name: "Files attached to Servo stall test" }).getByRole("link")).toHaveCount(2);
});

test("existing Drive files are linked in place, duplicates and hidden files are refused, and a Google Doc opens in Drive", async ({ page, request, context }) => {
  await login(page);
  await connectDrive(page);
  const projectId = await newProject(page, "Linked refs");
  const result = await link(page, { projectId, driveFileIds: ["fixture-doc-000001", "fixture-gdoc-00001", "fixture-hidden-001", FOLDER] });
  expect(result.status).toBe(200);
  expect(result.body.linked.map((f: PF) => [f.name, f.source, f.size])).toEqual([["notes.txt", "picked", 15], ["Design brief", "picked", null]]);
  expect(result.body.skipped).toEqual([{ id: "fixture-hidden-001", reason: "not_granted" }, { id: FOLDER, reason: "folder" }]);
  const again = await link(page, { projectId, driveFileIds: ["fixture-doc-000001"] });
  expect(again.body.skipped).toEqual([{ id: "fixture-doc-000001", reason: "already_linked" }]);
  const s = await state(request);
  expect(s.google.files.find((f) => f.id === "fixture-doc-000001")!.parents).toBeUndefined(); // not moved
  expect(s.simple.drive_folders).toEqual([]); // linking creates no folders

  await page.reload();
  await filesTab(page);
  const doc = page.getByRole("link", { name: "Design brief" });
  await expect(doc).toHaveAttribute("href", /\?open=drive$/);
  await expect(page.getByText("Linked from Drive · Google file · Open in Google Drive")).toBeVisible();
  const [viewer] = await Promise.all([context.waitForEvent("page"), doc.click()]);
  await expect(viewer).toHaveURL(`${API}/google/view/fixture-gdoc-00001`);
  await viewer.close();
  // The Picker script itself is external and blocked in tests: the page says so.
  await page.getByRole("button", { name: "Link from Google Drive" }).click();
  await expect(status(page, "picker couldn't be loaded")).toBeVisible();
});

test("Check files refreshes renamed files and flags trashed and deleted ones without removing them", async ({ page, request }) => {
  await login(page);
  await connectDrive(page);
  const projectId = await newProject(page, "Check me");
  await link(page, { projectId, driveFileIds: ["fixture-doc-000001", "fixture-gdoc-00001"] });
  await control(request, { googleFile: { id: "fixture-doc-000001", changes: { name: "notes-v2.txt" } } });
  await control(request, { googleFile: { id: "fixture-gdoc-00001", changes: { trashed: true } } });
  await page.reload();
  await filesTab(page);
  await page.getByRole("button", { name: "Check files" }).click();
  await expect(status(page, "1 unavailable")).toBeVisible();
  await expect(status(page, "1 name updated from Drive.")).toBeVisible();
  await page.waitForTimeout(4500); // the result stays until dismissed
  await expect(status(page, "1 name updated from Drive.")).toBeVisible();
  await expect(page.getByRole("link", { name: "notes-v2.txt" })).toBeVisible();
  await expect(page.getByText("Unavailable in Drive: In the Drive trash")).toBeVisible();

  await control(request, { googleDelete: "fixture-doc-000001" });
  await page.getByRole("button", { name: "Check files" }).click();
  await expect(status(page, "2 unavailable")).toBeVisible();
  await expect(page.getByText("Unavailable in Drive: Deleted from Drive")).toBeVisible();
  const rows = (await state(request)).simple.project_files;
  expect(rows.map((r) => [r.name, r.state, r.state_reason]).sort()).toEqual([["Design brief", "unavailable", "trashed"], ["notes-v2.txt", "unavailable", "missing"]]);
});

test("attaching to a component and unlinking keep the Drive file", async ({ page, request }) => {
  await login(page);
  await connectDrive(page);
  const projectId = await newProject(page, "Parts");
  await tabs(page).getByRole("button", { name: "Components" }).click();
  const comps = section(page, "Components");
  await comps.getByRole("button", { name: "+ Add component" }).click();
  await comps.getByLabel("Component", { exact: true }).fill("MG996R servo");
  await comps.getByRole("button", { name: "Add component" }).last().click();
  await expect(comps.getByRole("heading", { name: /MG996R servo/ })).toBeVisible();
  await link(page, { projectId, driveFileIds: ["fixture-doc-000001"] });
  await page.reload();
  await filesTab(page);
  await page.getByRole("combobox", { name: "Attach notes.txt to" }).selectOption({ label: "Component: MG996R servo" });
  await expect(page.getByText("Attached to Component: MG996R servo")).toBeVisible();
  const component = (await state(request)).work.project_components[0];
  expect((await state(request)).simple.project_files[0].component_id).toBe(component.id);

  // A record from another project is refused.
  const other = await newProject(page, "Other project");
  const fileId = (await state(request)).simple.project_files[0].id;
  const foreign = await page.evaluate(async ({ fileId }) => (await fetch(`/api/drive/project-files/${fileId}`, { method: "PATCH",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId: "88888888-8888-4888-8888-888888888888" }) })).status, { fileId });
  expect(foreign).toBe(404);
  expect(other).not.toBe(projectId);

  await page.goto(`/vault/projects/${projectId}`);
  await filesTab(page);
  await page.getByRole("button", { name: /^Remove .+ from this project$/ }).click();
  await expect(status(page, "It is still in your Google Drive")).toBeVisible();
  const s = await state(request);
  expect(s.simple.project_files).toEqual([]);
  expect(s.google.files.some((f) => f.id === "fixture-doc-000001")).toBe(true);
});

test("without Drive, project uploads are refused with a message and nothing is sent", async ({ page, request }) => {
  await login(page);
  await newProject(page, "No drive yet");
  await filesTab(page);
  await page.getByLabel("Files to upload").setInputFiles([{ name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("a") }]);
  await expect(status(page, "Google Drive isn't connected")).toBeVisible();
  const s = await state(request);
  expect(s.simple.project_files).toEqual([]);
  expect(s.simple.drive_folders).toEqual([]);
  expect(s.google.files.some((f) => f.uploaded)).toBe(false);
});

test("project file routes deny logged-out visitors, other accounts and cross-site requests", async ({ page, playwright }) => {
  await login(page);
  await connectDrive(page);
  const projectId = await newProject(page, "Private");
  const linked = await link(page, { projectId, driveFileIds: ["fixture-doc-000001"] });
  const fileId = linked.body.linked[0].id;

  for (const [method, path] of [["POST", "/api/drive/project-files"], ["POST", "/api/drive/project-files/check"],
    ["PATCH", `/api/drive/project-files/${fileId}`], ["DELETE", `/api/drive/project-files/${fileId}`]] as const) {
    const r = await page.request.fetch(path, { method, headers: { Origin: "https://attacker.invalid" }, data: { projectId } });
    expect(r.status(), `${method} ${path}`).toBe(403);
  }
  const anonymous = await playwright.request.newContext({ baseURL: APP });
  for (const [method, path] of [["POST", "/api/drive/project-files"], ["POST", "/api/drive/project-files/check"],
    ["PATCH", `/api/drive/project-files/${fileId}`], ["DELETE", `/api/drive/project-files/${fileId}`]] as const) {
    const r = await anonymous.fetch(path, { method, headers: { Origin: APP }, data: { projectId } });
    expect(r.status(), `${method} ${path}`).toBe(401);
  }
  expect((await anonymous.get(`/api/drive/file/${fileId}`)).status()).toBe(401);
  await anonymous.dispose();

  await login(page, "other");
  for (const [method, path] of [["PATCH", `/api/drive/project-files/${fileId}`], ["DELETE", `/api/drive/project-files/${fileId}`]] as const) {
    const r = await page.request.fetch(path, { method, headers: { Origin: APP }, data: {} });
    expect(r.status(), `${method} ${path}`).toBe(401);
  }
});

test("the Files tab fits phone, tablet and desktop widths", async ({ page }) => {
  await login(page);
  await connectDrive(page);
  const projectId = await newProject(page, "A project with a fairly long title to test wrapping on small screens");
  await link(page, { projectId, driveFileIds: ["fixture-doc-000001", "fixture-gdoc-00001"] });
  await page.reload();
  await filesTab(page);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `files at ${width}px`).toBeLessThanOrEqual(width);
  }
});
