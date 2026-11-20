import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Phase 3A: Drive connection logic with synthetic keys, tokens and HTTP. No network.
const root = path.join(import.meta.dirname, '..');
const env = {};
const sandbox = { process: { env }, Buffer, URL, URLSearchParams, AbortSignal, fetch: (...a) => sandbox.fakeFetch(...a), fakeFetch: null };
function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (id) => mocks[id] ?? (id === 'node:crypto' ? crypto : {}), ...sandbox });
  return exports;
}
const sealer = load('src/lib/drive/crypto.ts');
const flow = load('src/lib/drive/flow.ts', { './crypto': sealer });
const google = load('src/lib/drive/google.ts', { './flow': flow });
const connection = load('src/lib/drive/connection.ts', { './crypto': sealer, './flow': flow, './google': google });

const KEY = crypto.randomBytes(32).toString('base64');
function configure(extra = {}) {
  for (const k of Object.keys(env)) delete env[k];
  Object.assign(env, { DRIVE_TOKEN_KEY: KEY, GOOGLE_CLIENT_ID: 'client.fixture', GOOGLE_CLIENT_SECRET: 'secret-fixture', ALLOWED_EMAIL: 'Owner@Example.invalid' }, extra);
}
configure();

const reply = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function recordFetch(handler) {
  const calls = [];
  sandbox.fakeFetch = async (url, init = {}) => { calls.push({ url: String(url), init }); return handler(String(url), init, calls.length); };
  return calls;
}

test('sealed values open only with the same key, context and version', () => {
  const key = sealer.readKey(KEY);
  const a = sealer.seal('1//refresh-token', 'refresh:user-1', key);
  const b = sealer.seal('1//refresh-token', 'refresh:user-1', key);
  assert.notEqual(a, b, 'a fresh IV every time');
  assert.match(a, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.ok(!a.includes('refresh-token'));
  assert.equal(sealer.open(a, 'refresh:user-1', key), '1//refresh-token');
  assert.equal(sealer.open(a, 'refresh:user-2', key), null, 'another row');
  assert.equal(sealer.open(a, 'access:user-1', key), null, 'another purpose');
  assert.equal(sealer.open(a, 'refresh:user-1', crypto.randomBytes(32)), null, 'another key');
  const parts = a.split('.');
  const flipped = Buffer.from(parts[3], 'base64url'); flipped[0] ^= 1;
  assert.equal(sealer.open([...parts.slice(0, 3), flipped.toString('base64url')].join('.'), 'refresh:user-1', key), null, 'tampered');
  assert.equal(sealer.open(['v2', ...parts.slice(1)].join('.'), 'refresh:user-1', key), null, 'unknown version');
  for (const bad of [null, undefined, '', 'v1.x', 'v1.a.b.c', '1//plain-token']) assert.equal(sealer.open(bad, 'refresh:user-1', key), null);
});

test('the key must be exactly 32 bytes of base64', () => {
  assert.throws(() => sealer.readKey(''), /32 bytes/);
  assert.throws(() => sealer.readKey(crypto.randomBytes(16).toString('base64')), /32 bytes/);
  assert.equal(sealer.readKey(` ${KEY}\n`).length, 32);
});

test('OAuth state is single-purpose, bound to the Vault user, expiring and PKCE-correct', () => {
  const now = Date.now();
  const start = flow.startOAuth('user-1', now);
  const ok = flow.checkCallback(start.cookie, start.state, 'user-1', now + 1000);
  assert.equal(ok.ok, true);
  assert.equal(flow.pkceChallenge(ok.verifier), start.challenge);
  assert.equal(crypto.createHash('sha256').update(ok.verifier).digest('base64url'), start.challenge);
  assert.ok(!start.cookie.includes(start.state) && !start.cookie.includes(ok.verifier), 'cookie is sealed');
  const other = flow.startOAuth('user-1', now);
  assert.deepEqual({ ...flow.checkCallback(start.cookie, other.state, 'user-1', now) }, { ok: false, reason: 'state' });
  assert.deepEqual({ ...flow.checkCallback(undefined, start.state, 'user-1', now) }, { ok: false, reason: 'state' });
  assert.deepEqual({ ...flow.checkCallback(start.cookie, null, 'user-1', now) }, { ok: false, reason: 'state' });
  const parts = start.cookie.split('.'); const body = Buffer.from(parts[3], 'base64url'); body[3] ^= 1;
  assert.deepEqual({ ...flow.checkCallback([...parts.slice(0, 3), body.toString('base64url')].join('.'), start.state, 'user-1', now) }, { ok: false, reason: 'state' });
  assert.deepEqual({ ...flow.checkCallback(start.cookie, start.state, 'user-1', now + flow.STATE_TTL_MS + 1) }, { ok: false, reason: 'expired' });
  assert.deepEqual({ ...flow.checkCallback(start.cookie, start.state, 'user-2', now) }, { ok: false, reason: 'user' });
  // A state sealed for a different purpose (a token) is not accepted as OAuth state.
  assert.deepEqual({ ...flow.checkCallback(sealer.seal(JSON.stringify({ state: 's', verifier: 'v', uid: 'user-1', exp: now + 5000 }), 'refresh:user-1'), 's', 'user-1', now) },
    { ok: false, reason: 'state' });
});

test('only exactly the drive.file scope is accepted', () => {
  assert.equal(flow.scopeIsExact('https://www.googleapis.com/auth/drive.file'), true);
  assert.equal(flow.scopeIsExact(' https://www.googleapis.com/auth/drive.file '), true);
  assert.equal(flow.scopeIsExact('https://www.googleapis.com/auth/drive'), false);
  assert.equal(flow.scopeIsExact('https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive'), false);
  assert.equal(flow.scopeIsExact('https://www.googleapis.com/auth/drive.file openid'), false);
  assert.equal(flow.scopeIsExact(''), false);
  assert.equal(flow.scopeIsExact(undefined), false);
});

test('only the configured Google account is allowed', () => {
  assert.equal(flow.accountAllowed('owner@example.invalid', { ALLOWED_EMAIL: 'Owner@Example.invalid' }), true);
  assert.equal(flow.accountAllowed('other@example.invalid', { ALLOWED_EMAIL: 'owner@example.invalid' }), false);
  assert.equal(flow.accountAllowed('drive@example.invalid', { ALLOWED_EMAIL: 'owner@example.invalid', DRIVE_GOOGLE_ACCOUNT: 'Drive@example.invalid ' }), true);
  assert.equal(flow.accountAllowed('owner@example.invalid', { ALLOWED_EMAIL: 'owner@example.invalid', DRIVE_GOOGLE_ACCOUNT: 'drive@example.invalid' }), false);
  assert.equal(flow.accountAllowed('anyone@example.invalid', {}), false);
  assert.equal(flow.accountAllowed(undefined, { ALLOWED_EMAIL: 'owner@example.invalid' }), false);
});

test('Drive IDs must be opaque URL-safe strings', () => {
  assert.equal(flow.validDriveId('1Osl8Rzy2rkGUhml9B1Ez'), true);
  for (const bad of ['short', '../../etc/passwd', 'a b c d e f g h', 'x'.repeat(201), 42, null]) assert.equal(flow.validDriveId(bad), false);
});

test('the authorization URL asks for drive.file only, offline, with consent and S256', () => {
  configure();
  const url = new URL(google.authorizationUrl({ clientId: 'client.fixture', clientSecret: 'x' }, 'https://site.invalid/api/drive/callback', 'st', 'ch'));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  const p = Object.fromEntries(url.searchParams);
  assert.deepEqual(p, { client_id: 'client.fixture', redirect_uri: 'https://site.invalid/api/drive/callback', response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent', state: 'st', code_challenge: 'ch', code_challenge_method: 'S256' });
  assert.ok(!url.toString().includes('secret'), 'client secret never in the URL');
});

test('the synthetic Google base is honoured only in the browser acceptance build', () => {
  configure({ DRIVE_GOOGLE_TEST_BASE: 'http://127.0.0.1:4317/google' });
  assert.match(google.authorizationUrl({ clientId: 'c', clientSecret: 's' }, 'r', 's', 'c'), /^https:\/\/accounts\.google\.com\//);
  configure({ DRIVE_GOOGLE_TEST_BASE: 'http://127.0.0.1:4317/google', VAULT_E2E: '1' });
  assert.match(google.authorizationUrl({ clientId: 'c', clientSecret: 's' }, 'r', 's', 'c'), /^http:\/\/127\.0\.0\.1:4317\/google\/auth\?/);
  configure();
});

test('Google errors expose only a short code, never the response body', async () => {
  configure();
  recordFetch(() => reply(400, { error: 'invalid_grant', error_description: 'Token 1//leaked-refresh has been expired or revoked.' }));
  await assert.rejects(google.refreshAccess({ clientId: 'c', clientSecret: 's' }, '1//leaked-refresh'), (error) => {
    assert.equal(error.code, 'invalid_grant');
    assert.equal(error.status, 400);
    assert.ok(!error.message.includes('leaked'));
    return true;
  });
  recordFetch(() => reply(200, { token_type: 'Bearer' }));
  await assert.rejects(google.refreshAccess({ clientId: 'c', clientSecret: 's' }, 'r'), (error) => error.code === 'bad_token_response');
  recordFetch(() => reply(403, { error: { status: 'PERMISSION_DENIED<script>', message: 'secret detail' } }));
  await assert.rejects(google.getFile('at', 'folder-id-123456'), (error) => error.code === 'PERMISSION_DENIEDscript' && error.status === 403);
});

test('code exchange sends the PKCE verifier and secret in the POST body only', async () => {
  configure();
  const calls = recordFetch(() => reply(200, { access_token: 'ya29.access', expires_in: 3599, refresh_token: '1//refresh', scope: flow.DRIVE_SCOPE }));
  const tokens = await google.exchangeCode({ clientId: 'c', clientSecret: 'shh' }, 'code-1', 'verifier-1', 'https://site.invalid/api/drive/callback');
  assert.equal(tokens.refresh_token, '1//refresh');
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.redirect, 'error');
  const body = Object.fromEntries(new URLSearchParams(calls[0].init.body));
  assert.deepEqual(body, { grant_type: 'authorization_code', code: 'code-1', code_verifier: 'verifier-1',
    redirect_uri: 'https://site.invalid/api/drive/callback', client_id: 'c', client_secret: 'shh' });
});

test('revocation treats an already-invalid token as done and network failure as not revoked', async () => {
  recordFetch(() => reply(200, {}));
  assert.equal(await google.revoke('t'), true);
  recordFetch(() => reply(400, { error: 'invalid_token' }));
  assert.equal(await google.revoke('t'), true);
  recordFetch(() => reply(503, {}));
  assert.equal(await google.revoke('t'), false);
  recordFetch(() => { throw new TypeError('offline'); });
  assert.equal(await google.revoke('t'), false);
});

// A stand-in for the owner's Supabase session limited to drive_connections.
function fakeSupabase(store) {
  return { from(table) {
    assert.equal(table, 'drive_connections');
    const q = { op: null, values: null, options: null, filters: [],
      select() { q.op ??= 'select'; return q; }, eq(c, v) { q.filters.push([c, v]); return q; }, limit() { return q; },
      upsert(v, o) { q.op = 'upsert'; q.values = v; q.options = o; return q; },
      update(v) { q.op = 'update'; q.values = v; return q; }, delete() { q.op = 'delete'; return q; },
      then(resolve, reject) { return Promise.resolve().then(() => store.handle(q)).then(resolve, reject); } };
    return q;
  } };
}
function store(row, { failRead = false } = {}) {
  const s = { row, writes: [], handle(q) {
    if (q.op === 'select') return failRead ? { data: null, error: { message: 'down' } } : { data: s.row ? [s.row] : [], error: null };
    s.writes.push({ op: q.op, values: q.values, options: q.options, filters: q.filters });
    if (q.op === 'upsert') s.row = { ...(s.row ?? {}), ...q.values, connected_at: 'now' };
    if (q.op === 'update' && s.row) s.row = { ...s.row, ...q.values };
    if (q.op === 'delete') s.row = null;
    return { data: s.row ? [s.row] : [], error: null };
  } };
  return s;
}
function storedRow(userId, { access = 'ya29.current', expiresAt = Date.now() + 3600_000, refresh = '1//refresh-token' } = {}) {
  return { user_id: userId, google_account_id: 'perm-1', google_email: 'owner@example.invalid', scope: flow.DRIVE_SCOPE,
    refresh_token_enc: refresh === null ? 'v1.AAAA.AAAA.AAAA' : sealer.seal(refresh, `refresh:${userId}`),
    access_token_enc: access ? sealer.seal(access, `access:${userId}`) : null,
    access_token_expires_at: new Date(expiresAt).toISOString(), key_version: 1, folder_id: null, folder_name: null, connected_at: '2026-11-20T00:00:00Z' };
}

test('saving a connection stores only sealed tokens for that owner', async () => {
  configure();
  const s = store(null);
  const ok = await connection.saveConnection(fakeSupabase(s), 'user-1', { accountId: 'perm-1', email: ' Owner@Example.invalid ',
    refreshToken: '1//plain-refresh', accessToken: 'ya29.plain-access', expiresIn: 3600, now: 1_000 });
  assert.equal(ok, true);
  const [write] = s.writes;
  assert.equal(write.op, 'upsert');
  assert.deepEqual({ ...write.options }, { onConflict: 'user_id' });
  assert.ok(!JSON.stringify(write.values).includes('plain'), 'no plaintext token in the row');
  assert.equal(write.values.google_email, 'owner@example.invalid');
  assert.equal(write.values.scope, flow.DRIVE_SCOPE);
  assert.equal(write.values.access_token_expires_at, new Date(3_601_000).toISOString());
  assert.equal(sealer.open(write.values.refresh_token_enc, 'refresh:user-1'), '1//plain-refresh');
  assert.equal(sealer.open(write.values.access_token_enc, 'access:user-1'), 'ya29.plain-access');
});

test('a valid stored access token is used without calling Google', async () => {
  configure();
  const calls = recordFetch(() => assert.fail('no network expected'));
  const result = await connection.accessToken(fakeSupabase(store(storedRow('user-1'))), 'user-1', Date.now());
  assert.equal(result.ok, true);
  assert.equal(result.token, 'ya29.current');
  assert.equal(calls.length, 0);
});

test('an expiring access token is refreshed once and the new one is stored sealed', async () => {
  configure();
  const s = store(storedRow('user-1', { expiresAt: Date.now() + 30_000 }));
  const calls = recordFetch(() => reply(200, { access_token: 'ya29.fresh', expires_in: 3599, scope: flow.DRIVE_SCOPE }));
  const now = Date.now();
  const result = await connection.accessToken(fakeSupabase(s), 'user-1', now);
  assert.equal(result.ok, true);
  assert.equal(result.token, 'ya29.fresh');
  assert.equal(calls.length, 1);
  assert.equal(new URLSearchParams(calls[0].init.body).get('refresh_token'), '1//refresh-token');
  assert.equal(s.writes.length, 1);
  assert.ok(!JSON.stringify(s.writes[0].values).includes('ya29.fresh'));
  assert.equal(sealer.open(s.writes[0].values.access_token_enc, 'access:user-1'), 'ya29.fresh');
  assert.deepEqual(s.writes[0].filters, [['user_id', 'user-1']]);
});

test('revoked or expired grants ask for reconnect; outages do not', async () => {
  configure();
  const expired = () => store(storedRow('user-1', { expiresAt: 0 }));
  recordFetch(() => reply(400, { error: 'invalid_grant' }));
  assert.equal((await connection.accessToken(fakeSupabase(expired()), 'user-1', Date.now())).reason, 'reconnect');
  recordFetch(() => reply(503, { error: 'backendError' }));
  assert.equal((await connection.accessToken(fakeSupabase(expired()), 'user-1', Date.now())).reason, 'unavailable');
  recordFetch(() => { throw new TypeError('offline'); });
  assert.equal((await connection.accessToken(fakeSupabase(expired()), 'user-1', Date.now())).reason, 'unavailable');
});

test('an unreadable token (another key or row) asks for reconnect instead of crashing', async () => {
  configure();
  const calls = recordFetch(() => assert.fail('no network expected'));
  const moved = storedRow('user-2', { expiresAt: 0 });
  moved.user_id = 'user-1';
  assert.equal((await connection.accessToken(fakeSupabase(store(moved)), 'user-1', Date.now())).reason, 'reconnect');
  assert.equal((await connection.accessToken(fakeSupabase(store(storedRow('user-1', { refresh: null, expiresAt: 0 }))), 'user-1', Date.now())).reason, 'reconnect');
  const status = await connection.driveStatus(fakeSupabase(store(storedRow('user-1', { refresh: null }))), 'user-1', Date.now(), false);
  assert.equal(status.state, 'reconnect');
  assert.equal(calls.length, 0);
});

test('missing rows, failed reads and missing configuration are reported distinctly', async () => {
  configure();
  assert.equal((await connection.accessToken(fakeSupabase(store(null)), 'user-1', Date.now())).reason, 'not_connected');
  assert.equal((await connection.accessToken(fakeSupabase(store(null, { failRead: true })), 'user-1', Date.now())).reason, 'unavailable');
  assert.equal((await connection.driveStatus(fakeSupabase(store(null)), 'user-1', Date.now(), true)).state, 'not_connected');
  assert.equal((await connection.driveStatus(fakeSupabase(store(null, { failRead: true })), 'user-1', Date.now(), true)).state, 'unavailable');
  configure({ DRIVE_TOKEN_KEY: 'too-short' });
  assert.equal(connection.driveConfigured(env), false);
  assert.equal((await connection.driveStatus(fakeSupabase(store(null)), 'user-1', Date.now(), true)).state, 'not_configured');
  configure({ GOOGLE_CLIENT_SECRET: '' });
  assert.equal((await connection.accessToken(fakeSupabase(store(storedRow('user-1'))), 'user-1', Date.now())).reason, 'not_configured');
  configure();
});

test('status describes the connection without any token', async () => {
  configure();
  const row = { ...storedRow('user-1'), folder_id: 'folder-id-123456', folder_name: 'Ideas' };
  const status = await connection.driveStatus(fakeSupabase(store(row)), 'user-1', Date.now(), true);
  assert.deepEqual(JSON.parse(JSON.stringify(status)), { state: 'connected', account: 'owner@example.invalid',
    folder: { id: 'folder-id-123456', name: 'Ideas' }, connectedAt: '2026-11-20T00:00:00Z' });
  assert.ok(!JSON.stringify(status).includes('ya29') && !JSON.stringify(status).includes('1//'));
});

test('saving a folder must update exactly the owner row', async () => {
  configure();
  const s = store(storedRow('user-1'));
  assert.equal(await connection.saveFolder(fakeSupabase(s), 'user-1', { id: 'folder-id-123456', name: 'x'.repeat(600) }), true);
  assert.equal(s.row.folder_name.length, 500);
  assert.equal(await connection.saveFolder(fakeSupabase(store(null)), 'user-1', { id: 'folder-id-123456', name: 'x' }), false);
});

test('Drive server code never logs', () => {
  const dirs = ['src/lib/drive', 'src/app/api/drive'];
  const files = dirs.flatMap((d) => fs.readdirSync(path.join(root, d), { recursive: true }).filter((f) => f.endsWith('.ts')).map((f) => path.join(root, d, f)));
  assert.ok(files.length >= 10);
  for (const file of files) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /console\.|debugger/, path.relative(root, file));
});
