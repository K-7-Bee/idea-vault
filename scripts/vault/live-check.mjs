#!/usr/bin/env node
// Phase 6E: the go-live smoke check, run on a schedule by .github/workflows/live-check.yml and by
// hand with `npm run check:live` (optionally `-- https://another.address`).
//
// Logged-out requests to public addresses only: no secrets, no cookies, nothing written. It prints
// status codes and header names, never response bodies, because the repository (and so the
// workflow log) is public. A failed check is retried once before it counts.

export const DEFAULT_BASE = 'https://kaushik-kamal.vercel.app';

const PROTECTIVE_HEADERS = ['strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy',
  'permissions-policy', 'cross-origin-opener-policy'];
const HOME_SECTIONS = ['main-content', 'about', 'experience', 'projects', 'contact'];
const CROSS_SITE = { 'sec-fetch-site': 'cross-site', origin: 'https://example.invalid' };

const expectStatus = (status) => (r) => r.status === status ? null : `expected ${status}, got ${r.status}`;
const expectLoginRedirect = (r) => {
  if (r.status < 300 || r.status > 399) return `expected a redirect to /login, got ${r.status}`;
  const target = r.headers.get('location') ?? '';
  return /^(https?:\/\/[^/]+)?\/login(\?|$)/.test(target) ? null : 'redirects somewhere other than /login';
};
const all = (...tests) => (r, body) => tests.map((t) => t(r, body)).find(Boolean) ?? null;
const hasHeaders = (r) => {
  const missing = PROTECTIVE_HEADERS.filter((h) => !r.headers.get(h));
  if (!r.headers.get('content-security-policy') && !r.headers.get('content-security-policy-report-only')) missing.push('content-security-policy');
  return missing.length ? `missing headers: ${missing.join(', ')}` : null;
};
const hasText = (label, pattern) => (_r, body) => pattern.test(body ?? '') ? null : `${label} not found in the page`;

/** Every check: a name, the request, and a test returning null (pass) or a short reason (fail). */
export function liveChecks() {
  const unknown = `/no-such-page-${Date.now().toString(36)}`;
  return [
    { name: 'homepage loads with its sections and security headers', path: '/', body: true,
      test: all(expectStatus(200), hasHeaders, ...HOME_SECTIONS.map((id) => hasText(`section #${id}`, new RegExp(`id="${id}"`)))) },
    { name: '/projects loads', path: '/projects', test: expectStatus(200) },
    { name: 'a case study loads', path: '/projects/waste-to-energy-lighting', test: expectStatus(200) },
    { name: '/journal loads', path: '/journal', test: expectStatus(200) },
    { name: '/login loads', path: '/login', test: all(expectStatus(200), hasHeaders) },
    { name: '/privacy loads with the Limited Use statement', path: '/privacy', body: true,
      test: all(expectStatus(200), hasText('the Limited Use statement', /Limited Use/)) },
    { name: 'an unknown address gives 404', path: unknown, test: expectStatus(404) },
    { name: '/vault sends visitors to /login', path: '/vault', test: expectLoginRedirect },
    { name: '/vault/settings sends visitors to /login', path: '/vault/settings', test: expectLoginRedirect },
    { name: '/api/export refuses visitors (401)', path: '/api/export', test: expectStatus(401) },
    { name: '/api/export refuses cross-site requests (403)', path: '/api/export', headers: CROSS_SITE, test: expectStatus(403) },
    { name: '/api/ai/ask refuses cross-site requests (403)', path: '/api/ai/ask', method: 'POST', headers: CROSS_SITE, test: expectStatus(403) },
  ];
}

async function attempt(base, check, fetchImpl) {
  try {
    const response = await fetchImpl(new URL(check.path, base), {
      method: check.method ?? 'GET', headers: { 'user-agent': 'idea-vault-live-check', ...check.headers },
      redirect: 'manual', signal: AbortSignal.timeout(20_000),
    });
    const body = check.body ? await response.text() : (await response.body?.cancel?.(), null);
    return check.test(response, body);
  } catch (error) {
    return `request failed (${error.name === 'TimeoutError' ? 'timed out after 20 s' : error.message})`;
  }
}

/** Runs every check; returns [{ name, ok, reason }]. A failure is retried once after retryDelayMs. */
export async function runLiveCheck({ base = DEFAULT_BASE, fetchImpl = fetch, retryDelayMs = 15_000, checks = liveChecks() } = {}) {
  const results = [];
  for (const check of checks) {
    let reason = await attempt(base, check, fetchImpl);
    if (reason) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      reason = await attempt(base, check, fetchImpl);
    }
    results.push({ name: check.name, ok: !reason, reason });
  }
  return results;
}

async function main() {
  const base = process.argv[2] ?? process.env.LIVE_BASE ?? DEFAULT_BASE;
  if (!/^https:\/\/[a-z0-9.-]+\/?$/i.test(base)) throw new Error('Give the site as https://host (no path).');
  const results = await runLiveCheck({ base });
  for (const r of results) {
    process.stdout.write(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : `: ${r.reason}`}\n`);
    if (!r.ok && process.env.GITHUB_ACTIONS) process.stdout.write(`::error title=Live check failed::${r.name}: ${r.reason}\n`);
  }
  const failed = results.filter((r) => !r.ok).length;
  process.stdout.write(`${results.length - failed} of ${results.length} checks passed on ${base}\n`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('live-check.mjs')) {
  main().catch((error) => { process.stderr.write(`Live check failed to run: ${error.message}\n`); process.exitCode = 1; });
}
