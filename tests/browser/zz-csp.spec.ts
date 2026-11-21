import { test, expect } from "@playwright/test";

// Phase 6B: runs last (file order). The test build enforces the Content-Security-Policy and sends
// violation reports to the fixture, which keeps them for the whole run. Any report means some page
// or feature exercised by the suite needs something the policy doesn't allow.
const API = "http://127.0.0.1:4317";
const APP = "http://127.0.0.1:4318";
const controlHeaders = { "x-fixture-key": "local-synthetic-test-control" };

test("security headers are on every kind of response", async ({ request }) => {
  for (const path of ["/", "/projects", "/journal", "/login", "/vault", "/api/export", "/sw.js"]) {
    const response = await request.get(`${APP}${path}`, { maxRedirects: 0 });
    const h = response.headers();
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"], path).toContain("microphone=(self)");
    expect(h["permissions-policy"], path).toContain("camera=()");
    expect(h["cross-origin-opener-policy"], path).toBe("same-origin-allow-popups");
    expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"], path).toContain("object-src 'none'");
  }
});

test("the report endpoint accepts a report and stores nothing", async ({ request }) => {
  const response = await request.post(`${APP}/api/csp-report`, {
    headers: { "Content-Type": "application/csp-report" },
    data: JSON.stringify({ "csp-report": { "effective-directive": "img-src", "blocked-uri": "https://example.invalid/x.png?private=1", "document-uri": "https://site/vault?secret" } }),
  });
  expect(response.status()).toBe(204);
  const huge = await request.post(`${APP}/api/csp-report`, { data: "x".repeat(20_000) });
  expect(huge.status()).toBe(204);
});

test("no page in the whole browser suite violated the Content-Security-Policy", async ({ request }) => {
  const state = await (await request.get(`${API}/_test/state`, { headers: controlHeaders })).json();
  const reports = (state.csp as Record<string, unknown>[]).map((r) => `${r["effective-directive"] ?? r["violated-directive"]} blocked ${r["blocked-uri"]} on ${r["document-uri"]}`);
  expect(reports).toEqual([]);
});

// Proves the check above means something: a deliberate violation must reach the fixture.
test("a deliberate violation is blocked and reported (so zero reports above is meaningful)", async ({ page, request }) => {
  await page.goto(`${APP}/`);
  await page.evaluate(() => {
    const img = document.createElement("img");
    img.src = "https://blocked-by-csp.example.invalid/pixel.png";
    document.body.append(img);
  });
  await expect.poll(async () => {
    const state = await (await request.get(`${API}/_test/state`, { headers: controlHeaders })).json();
    return (state.csp as Record<string, unknown>[]).some((r) => String(r["blocked-uri"] ?? "").includes("blocked-by-csp.example.invalid"));
  }, { timeout: 15_000 }).toBe(true);
});

test("Drive files keep their own sandboxed policy", async ({ request }) => {
  const response = await request.get(`${APP}/api/drive/file/not-a-real-id`, { maxRedirects: 0 });
  const csp = response.headers()["content-security-policy"] ?? "";
  expect(csp).not.toContain("script-src 'self'");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
});
