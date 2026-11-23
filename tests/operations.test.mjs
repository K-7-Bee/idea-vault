// Phase 6E: the live health check and the backup retention and freshness rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { liveChecks, runLiveCheck } from '../scripts/vault/live-check.mjs';
import { archivesIn, planPrune, summarize } from '../scripts/vault/backup-status.mjs';

const REF = 'abcdefghijklmnopqrst';
const archive = (stamp) => `vault-live-${REF}-${stamp}.vaultlive`;

// A fake site that answers like the live one; `override` changes one address.
function fakeSite(override = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ path: url.pathname, init });
    const crossSite = init.headers['sec-fetch-site'] === 'cross-site';
    const headers = new Headers({
      'strict-transport-security': 'max-age=1', 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer', 'permissions-policy': 'camera=()', 'cross-origin-opener-policy': 'same-origin',
      'content-security-policy-report-only': "default-src 'self'",
    });
    let status = 200; let body = '<main id="main-content"></main><section id="about"></section><section id="experience"></section><section id="projects"></section><section id="contact"></section> Limited Use';
    if (url.pathname.startsWith('/no-such-page')) status = 404;
    if (url.pathname.startsWith('/vault')) { status = 307; headers.set('location', 'https://site.test/login'); }
    if (url.pathname.startsWith('/api/')) status = crossSite ? 403 : 401;
    const custom = override[url.pathname];
    if (custom) ({ status = status, body = body } = custom(headers) ?? {});
    return new Response(status === 307 ? null : body, { status, headers });
  };
  return { fetchImpl, calls };
}

test('the live check passes against a site that behaves like production, without following redirects', async () => {
  const { fetchImpl, calls } = fakeSite();
  const results = await runLiveCheck({ base: 'https://site.test', fetchImpl, retryDelayMs: 0 });
  assert.deepEqual(results.filter((r) => !r.ok), []);
  assert.equal(results.length, liveChecks().length);
  assert.ok(calls.every((c) => c.init.redirect === 'manual'));
});

test('the live check names what broke: a missing header, a lost section, an open Vault, a public API', async () => {
  const { fetchImpl } = fakeSite({
    '/': (h) => { h.delete('x-frame-options'); return { body: '<main id="main-content"></main>' }; },
    '/vault': (h) => { h.set('location', '/vault/ideas'); return {}; },
    '/api/export': () => ({ status: 200 }),
  });
  const failed = Object.fromEntries((await runLiveCheck({ base: 'https://site.test', fetchImpl, retryDelayMs: 0 }))
    .filter((r) => !r.ok).map((r) => [r.name, r.reason]));
  assert.match(failed['homepage loads with its sections and security headers'], /x-frame-options/);
  assert.match(failed['/vault sends visitors to /login'], /somewhere other than \/login/);
  assert.match(failed['/api/export refuses visitors (401)'], /expected 401, got 200/);
  assert.match(failed['/api/export refuses cross-site requests (403)'], /expected 403, got 200/);
  assert.equal(Object.keys(failed).length, 4);
});

test('a single failure is retried once, and a network error is reported rather than thrown', async () => {
  let n = 0;
  const flaky = async () => { n += 1; if (n === 1) throw new Error('socket hang up'); return new Response(null, { status: 200 }); };
  const [once] = await runLiveCheck({ fetchImpl: flaky, retryDelayMs: 0, checks: [{ name: 'x', path: '/', test: (r) => r.status === 200 ? null : 'bad' }] });
  assert.deepEqual([once.ok, n], [true, 2]);
  const down = async () => { throw new Error('ENOTFOUND'); };
  const [failed] = await runLiveCheck({ fetchImpl: down, retryDelayMs: 0, checks: [{ name: 'x', path: '/', test: () => null }] });
  assert.match(failed.reason, /request failed \(ENOTFOUND\)/);
});

test('pruning keeps the newest backups with their manifests and never touches anything else', () => {
  const stamps = ['20261101T100000Z', '20261108T100000Z', '20261115T100000Z', '20261122T100000Z'];
  const names = [
    ...stamps.flatMap((s) => [archive(s), `${archive(s)}.manifest.json`]),
    'run-20261116T002012Z', 'run-20261116T002012Z.key.dpapi', 'backup-passphrase.dpapi', 'last-run.json', 'drills', 'logs',
    'vault-live-notaref-20261001T100000Z.vaultlive', `${archive('20261001T100000Z')}.bak`, '.backup-20261122T100000Z-abc',
  ];
  assert.deepEqual(planPrune(names, 2), [archive(stamps[0]), `${archive(stamps[0])}.manifest.json`, archive(stamps[1]), `${archive(stamps[1])}.manifest.json`].sort());
  assert.deepEqual(planPrune(names, 8), []);
  assert.throws(() => planPrune(names, 0), /at least one/);
  assert.deepEqual(archivesIn(names).map((a) => a.takenAt.toISOString()), ['2026-11-22T10:00:00.000Z', '2026-11-15T10:00:00.000Z', '2026-11-08T10:00:00.000Z', '2026-11-01T10:00:00.000Z']);
});

test('freshness warns about an old backup, an old or failed drill, and a failed scheduled run', () => {
  const now = new Date('2026-12-20T00:00:00Z');
  const ok = { drillAt: '2026-12-01T00:00:00Z', summary: { tables: 30, identicalTables: 30, filesOk: true } };
  const bad = { drillAt: '2026-12-19T00:00:00Z', summary: { tables: 30, identicalTables: 29, filesOk: true } };
  const fresh = summarize({ names: [archive('20261218T100000Z')], drills: [ok, bad], lastRun: { backup: 'ok', drill: 'ok' }, now });
  assert.deepEqual(fresh.warnings, []);
  assert.equal(fresh.lastPassingDrill.toISOString(), '2026-12-01T00:00:00.000Z');

  const stale = summarize({ names: [archive('20261201T100000Z')], drills: [{ ...ok, drillAt: '2026-11-01T00:00:00Z' }], lastRun: { backup: 'failed', drill: 'skipped', message: 'Supabase login expired' }, now });
  assert.deepEqual(stale.warnings, ['The newest backup is 18 days old.', 'The last passing restore drill is 49 days old.', "The last scheduled run's backup failed: Supabase login expired."]);

  const empty = summarize({ names: [], drills: [bad], lastRun: null, now });
  assert.deepEqual(empty.warnings, ['No backup found in this folder.', 'No passing restore drill found.', 'Every restore drill on record failed.']);
});

test('Supabase CLI rows are read from a plain array (terminal, scheduled task) and from the agent envelope', async () => {
  const { parseCliRows } = await import('../scripts/vault/live-archive.mjs');
  assert.deepEqual(parseCliRows('[\n  {"one": 1}\n]\n'), [{ one: 1 }]);
  assert.deepEqual(parseCliRows('{"boundary":"b","rows":[{"one":1}],"warning":"w"}'), [{ one: 1 }]);
  assert.throws(() => parseCliRows('{"message":"unauthorized"}'), /no rows array/);
  assert.throws(() => parseCliRows('Login required'), /not JSON/);
});
