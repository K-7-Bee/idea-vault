import { defineConfig } from "@playwright/test";

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
    permissions: ["microphone"],
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
    },
  },
  webServer: [
    { command: "node tests/browser/api-fixture.mjs", url: "http://127.0.0.1:4317/health",
      reuseExistingServer: false, timeout: 30_000 },
    { command: "node tests/browser/app-server.mjs", url: "http://127.0.0.1:4318/login",
      reuseExistingServer: false, timeout: 180_000 },
  ],
});
