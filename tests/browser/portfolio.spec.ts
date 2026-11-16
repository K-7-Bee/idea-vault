import { test, expect } from "@playwright/test";

test("contact email is absent from server HTML but becomes a working mailto link in the browser", async ({ page, request }) => {
  const html = await (await request.get("/")).text();
  expect(html).not.toMatch(/[A-Za-z0-9._%+-]+@gmail\.com/);
  expect(html).toContain("[at]");
  await page.goto("/");
  const link = page.locator("#contact a[href^='mailto:']");
  await expect(link).toHaveAttribute("href", "mailto:koushikkamal6@gmail.com");
  await expect(link).toContainText("koushikkamal6@gmail.com");
});
