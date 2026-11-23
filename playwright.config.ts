import { defineConfig } from "@playwright/test";

// Logged-out tests that also run in Firefox and WebKit: every public page at 320-1280 px, the
// contact link, and axe on every public page (including /privacy and the 404). Vault tests stay
// Chromium-only: WebKit doesn't complete the Vault login against the plain-http test server.
const CROSS_BROWSER_SAMPLE = /public pages load and fit|public pages have no axe violations|contact email is absent/;

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  // In CI, the github reporter turns failures into annotations readable without signing in.
  reporter: [["list"], ["json", { outputFile: "test-results/browser-results.json" }], ...(process.env.CI ? [["github"] as const] : [])],
  use: {
    baseURL: "http://127.0.0.1:4318",
    viewport: { width: 1280, height: 900 },
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Chromium runs every spec (npm run test:browser). With CROSS_BROWSER=1 (Phase 6E,
  // .github/workflows/cross-browser.yml), Firefox and WebKit run a sample of public-page specs
  // instead; they don't take Chromium's fake-media and host-blocking switches.
  projects: process.env.CROSS_BROWSER === "1"
    ? (["firefox", "webkit"] as const).map((browserName) => ({
      name: browserName,
      // Chromium's host-resolver switch keeps tests offline; these browsers get the same through a
      // proxy that refuses every connection, bypassed only for the local test servers.
      use: { browserName, proxy: { server: "http://127.0.0.1:9", bypass: "127.0.0.1" } },
      grep: CROSS_BROWSER_SAMPLE,
      // Firefox occasionally never fires "load" on a fully rendered page here (seen 2026-11-23, not
      // reproduced in a 108-navigation probe). Retries keep that from failing the job; Playwright
      // still lists such tests as "flaky" in the log.
      retries: browserName === "firefox" ? 2 : 0,
    }))
    : [{
      name: "chromium",
      use: {
        browserName: "chromium" as const,
        permissions: ["microphone"],
        launchOptions: {
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
            "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
        },
      },
    }],
  webServer: [
    { command: "node tests/browser/api-fixture.mjs", url: "http://127.0.0.1:4317/health",
      reuseExistingServer: false, timeout: 30_000 },
    { command: "node tests/browser/app-server.mjs", url: "http://127.0.0.1:4318/login",
      reuseExistingServer: false, timeout: 180_000 },
  ],
});
