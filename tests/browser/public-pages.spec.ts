import { test, expect } from "@playwright/test";

// Phase 6E: every public page loads, shows its heading and never scrolls sideways at phone, tablet
// and desktop widths. Runs in Chromium with everything else, and in Firefox and WebKit as part of the
// cross-browser sample (playwright.config.ts). Logged out only, so it needs no Vault login.
const PAGES: { path: string; status: number; heading: RegExp }[] = [
  { path: "/", status: 200, heading: /./ },
  { path: "/projects", status: 200, heading: /./ },
  { path: "/projects/waste-to-energy-lighting", status: 200, heading: /./ },
  { path: "/projects/cha-restaurant", status: 200, heading: /./ },
  { path: "/projects/idea-vault", status: 200, heading: /./ },
  { path: "/journal", status: 200, heading: /./ },
  { path: "/login", status: 200, heading: /Idea Vault/ },
  { path: "/privacy", status: 200, heading: /^Privacy$/ },
  { path: "/no-such-page", status: 404, heading: /^Page not found$/ },
];

test("public pages load and fit 320, 768 and 1280 px without sideways scrolling", async ({ page }) => {
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const { path, status, heading } of PAGES) {
      const response = await page.goto(path);
      // Firefox revalidates a page it already has and may get 304 Not Modified for a 200 page.
      expect(status === 200 ? [200, 304] : [status], `${path} status`).toContain(response!.status());
      await expect(page.getByRole("heading", { level: 1, name: heading }).filter({ visible: true }).first(), `${path} heading at ${width}px`).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
});
