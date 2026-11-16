import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const API = "http://127.0.0.1:4317";
const OWNER = "11111111-1111-4111-8111-111111111111";
const IDEA = "33333333-3333-4333-8333-333333333333";
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };
async function control(request: APIRequestContext, data: object) {
  const response = await request.post(`${API}/_test/control`, { headers: controlHeaders, data });
  expect(response.ok()).toBeTruthy();
}
async function state(request: APIRequestContext) {
  return (await request.get(`${API}/_test/state`, { headers: controlHeaders })).json();
}
async function login(page: Page, account = "owner") {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email address" }).fill(`${account}@fixture.invalid`);
  await page.getByRole("textbox", { name: "Password" }).fill("synthetic-test-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  if (account === "owner") {
    await expect(page.getByRole("heading", { name: "Workspace overview" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "New idea", exact: true })).toBeVisible();
  } else await expect(page).toHaveURL(/denied=1/);
}
// Next.js renders its own role="alert" route announcer; match only the application's alerts.
const appAlert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
async function records(page: Page, name: string, store: string) {
  return page.evaluate(({ name, store }) => new Promise<unknown[]>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => { request.transaction!.abort(); };
    request.onerror = () => reject(new Error("Test database missing"));
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(store, "readonly");
      const all = tx.objectStore(store).getAll();
      tx.oncomplete = () => { db.close(); resolve(all.result); };
    };
  }), { name, store });
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

test("anonymous and other-owner navigation is denied; fixture API does not return owner rows or files", async ({ page, request }) => {
  await page.goto("/vault"); await expect(page).toHaveURL(/\/login$/);
  expect((await request.get(`${API}/rest/v1/ideas`)).status()).toBe(401);
  await login(page, "other");
  const session = await (await request.post(`${API}/auth/v1/token?grant_type=password`, {
    data: { email: "other@fixture.invalid", password: "synthetic-test-password" },
  })).json();
  const headers = { authorization: `Bearer ${session.access_token}` };
  expect(await (await request.get(`${API}/rest/v1/ideas?id=eq.${IDEA}`, { headers })).json()).toEqual([]);
  expect(await (await request.patch(`${API}/rest/v1/ideas?id=eq.${IDEA}`, { headers, data: { content: "forbidden" } })).json()).toEqual([]);
  expect((await state(request)).ideas[0].content).toBe("Fixture original #test");
  const paths = [(await state(request)).files[0].path];
  expect((await (await request.post(`${API}/storage/v1/object/sign/attachments`, { headers, data: { paths } })).json())[0].signedURL).toBeNull();
});

test("logout retains draft, edit, file and actual MediaRecorder bytes through new-tab login", async ({ page, context, request }) => {
  await login(page);
  await page.getByRole("textbox", { name: "New idea", exact: true }).fill("Unsaved fixture draft");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "pending.txt", mimeType: "text/plain", buffer: Buffer.from("retained upload bytes") });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "Edit idea", exact: true }).fill("Unsaved fixture edit");
  await page.getByTitle("Record a voice note", { exact: true }).click();
  await expect(page.getByText(/Recording 0:0[1-9]/)).toBeVisible();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Vault locked" })).toBeVisible();
  await expect(page.locator("#overview")).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Edit idea", exact: true })).toBeHidden();
  expect(new URL(page.url()).pathname).toBe("/vault");
  expect((await state(request)).ideas).toHaveLength(1);
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("link", { name: "Log in in a new tab" }).click();
  const popup = await popupPromise;
  await login(popup);
  await expect(page.getByRole("heading", { name: "Workspace overview" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Edit idea", exact: true })).toHaveValue("Unsaved fixture edit");
  await expect(page.getByRole("textbox", { name: "New idea", exact: true })).toHaveValue("Unsaved fixture draft");
  await expect(page.getByRole("button", { name: /^Remove Voice note/ })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Save idea", exact: true }).click();
  await expect.poll(async () => (await records(page, "idea-vault", "outbox")).length).toBe(1);
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open("idea-vault"); req.onsuccess = () => resolve(req.result); });
    const queued = await new Promise<{ files: { file: File }[]; owner_id: string }[]>((resolve) => { const req = db.transaction("outbox").objectStore("outbox").getAll(); req.onsuccess = () => resolve(req.result); });
    db.close();
    return { owner: queued[0].owner_id, files: await Promise.all(queued[0].files.map(async ({ file }) => ({ name: file.name, size: file.size, text: file.type === "text/plain" ? await file.text() : undefined }))) };
  });
  expect(saved.owner).toBe(OWNER);
  expect(saved.files.find((file) => file.name === "pending.txt")?.text).toBe("retained upload bytes");
  expect(saved.files.find((file) => file.name.startsWith("Voice note"))?.size).toBeGreaterThan(0);
});

test("delayed failed logout locks immediately, prevents duplicate requests and allows retry", async ({ page, request }) => {
  await login(page);
  await control(request, { rules: [{ method: "POST", path: "/auth/v1/logout", remaining: 1, mode: "error", delay: 1500 }] });
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.locator("#overview")).toBeHidden();
  await expect(page.getByRole("button", { name: "Log out", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Verify account again" }).click();
  await expect(page.locator("#overview")).toBeHidden();
  await expect(page.getByText("Unable to log out. Please try again.", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log out", exact: true })).toBeEnabled();
  expect((await state(request)).events.filter((event: { path: string }) => event.path === "/auth/v1/logout")).toHaveLength(1);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("link", { name: "Log in in a new tab" })).toBeVisible();
  await expect(page.locator("#overview")).toBeHidden();
});

test("a different account in another tab cannot reveal the retained workspace", async ({ page, context }) => {
  await login(page);
  await page.getByRole("textbox", { name: "New idea", exact: true }).fill("Owner-only draft");
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("link", { name: "Log in in a new tab" })).toBeVisible();
  const other = await context.newPage(); await login(other, "other");
  await page.getByRole("button", { name: "Verify account again" }).click();
  await expect(page.locator("#overview")).toBeHidden();
  await expect(page.getByRole("textbox", { name: "New idea", exact: true })).toBeHidden();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("vault-draft:11111111-1111-4111-8111-111111111111"))).toBe("Owner-only draft");
});

test("ambiguous attachment deletion retains bytes and can restore the original metadata", async ({ page, request }) => {
  await login(page);
  const original = await state(request);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await control(request, { rules: [{ method: "DELETE", path: "/rest/v1/idea_files", remaining: 1, mode: "drop-after" }] });
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(appAlert(page)).toContainText("Unable to remove");
  expect((await state(request)).files).toHaveLength(0);
  expect((await state(request)).objects).toEqual(original.objects);
  await page.getByText(/Recovery on this device/).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Restored." })).toBeVisible();
  expect((await state(request)).files).toEqual(original.files);
  expect((await records(page, "idea-vault-recovery", "records")).length).toBe(1);
});

test("whole-idea removal and interrupted restore preserve files and retry without duplicates", async ({ page, request }) => {
  await login(page);
  const original = await state(request);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(async () => (await state(request)).ideas.length).toBe(0);
  expect((await state(request)).objects).toEqual(original.objects);
  await page.getByText(/Recovery on this device/).click();
  await control(request, { rules: [{ method: "POST", path: "/rest/v1/idea_files", remaining: 1, mode: "error" }] });
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Recovery could not finish" })).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Restored." })).toBeVisible();
  const restored = await state(request);
  expect(restored.ideas).toEqual(original.ideas); expect(restored.files).toEqual(original.files);
  expect(restored.objects).toEqual(original.objects);
});

test("two tabs cannot silently overwrite conflicting edits or a deleted row", async ({ page, context, request }) => {
  await login(page);
  const second = await context.newPage(); await second.goto("/vault");
  second.on("dialog", (dialog) => dialog.accept());
  await expect(second.getByRole("heading", { name: "Workspace overview" })).toBeVisible();
  for (const tab of [page, second]) await tab.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "Edit idea", exact: true }).fill("Retain my conflicting edit");
  await second.getByRole("textbox", { name: "Edit idea", exact: true }).fill("Saved by the second tab");
  await second.getByRole("button", { name: "Save", exact: true }).click();
  await expect(second.getByRole("textbox", { name: "Edit idea", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(appAlert(page)).toContainText("changed or was deleted");
  await expect(page.getByRole("textbox", { name: "Edit idea", exact: true })).toHaveValue("Retain my conflicting edit");
  expect((await state(request)).ideas[0].content).toBe("Saved by the second tab");
  await second.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(async () => (await state(request)).ideas.length).toBe(0);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Edit idea", exact: true })).toHaveValue("Retain my conflicting edit");
  expect((await state(request)).ideas).toHaveLength(0);
});

test("mobile widths and keyboard navigation keep controls reachable and locked data inaccessible", async ({ page }, testInfo) => {
  await login(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("textbox", { name: "New idea", exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5)
        .slice(0, 8).map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").split(" ").slice(0, 4).join(".")} right=${Math.round(el.getBoundingClientRect().right)}`),
    }));
    expect(overflow.scrollWidth, `horizontal overflow at ${width}px: ${overflow.offenders.join(" | ")}`).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`vault-${width}.png`), fullPage: true });
  }
  await page.getByRole("textbox", { name: "New idea", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTitle("Attach files", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Vault locked" })).toBeVisible();
  const snapshot = await page.locator("body").ariaSnapshot();
  expect(snapshot).not.toContain("Workspace overview"); expect(snapshot).not.toContain("Fixture original");
  await page.getByRole("button", { name: "Verify account again" }).focus();
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[inert]"))).toBeFalsy();
  }
});
