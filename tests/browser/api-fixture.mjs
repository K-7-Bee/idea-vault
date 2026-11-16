// A wire-protocol fixture, NOT a Supabase/PostgreSQL implementation or proof of live RLS.
// All rows, passwords, tokens and object bytes here are synthetic and disposable.
import http from 'node:http';
import { randomUUID, createHmac } from 'node:crypto';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const IDEA = '33333333-3333-4333-8333-333333333333';
const FILE = '44444444-4444-4444-8444-444444444444';
const sessions = new Map(), signed = new Map();
let ideas, files, objects, rules, events;
function reset() {
  sessions.clear(); signed.clear(); rules = []; events = [];
  const created_at = '2026-11-15T00:00:00.000Z';
  ideas = [{ id: IDEA, user_id: OWNER, content: 'Fixture original #test', tags: ['test'], status: 'raw', created_at }];
  const path = `${OWNER}/${IDEA}/${FILE}-fixture.txt`;
  files = [{ id: FILE, user_id: OWNER, idea_id: IDEA, path, name: 'fixture.txt', mime_type: 'text/plain', size: 16, created_at }];
  objects = new Map([[path, Buffer.from('synthetic bytes!')]]);
}
reset();
const user = (id) => ({ id, aud: 'authenticated', role: 'authenticated',
  email: id === OWNER ? 'owner@fixture.invalid' : 'other@fixture.invalid',
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [],
  created_at: '2026-01-01T00:00:00Z' });
function session(id) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  const head = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, aud: 'authenticated', role: 'authenticated', exp: expires_at, iat: expires_at - 3600, session_id: randomUUID() })}`;
  const access_token = `${head}.${createHmac('sha256', 'synthetic-only-fixture-key').update(head).digest('base64url')}`;
  const refresh_token = randomUUID(); sessions.set(access_token, { id, refresh_token });
  return { access_token, refresh_token, expires_at, expires_in: 3600, token_type: 'bearer', user: user(id) };
}
const array = (value) => JSON.parse(`[${value.slice(1, -1)}]`);
function matches(row, params) {
  for (const [key, value] of params) {
    if (['select', 'order', 'limit', 'offset', 'or'].includes(key)) continue;
    if (value.startsWith('eq.')) {
      const expected = key === 'tags' ? array(value.slice(3)) : value.slice(3);
      if (JSON.stringify(row[key]) !== JSON.stringify(expected)) return false;
    } else if (value.startsWith('cs.')) {
      if (!array(value.slice(3)).every((tag) => row[key].includes(tag))) return false;
    } else if (value.startsWith('ilike.')) {
      if (!String(row[key]).toLowerCase().includes(value.slice(7, -1).toLowerCase())) return false;
    } else throw new Error(`Unsupported fixture filter: ${key}`);
  }
  return true;
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4317');
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4318');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, range, range-unit, x-upsert, cache-control');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range');
  const event = { method: req.method, path: url.pathname, status: null };
  let drop = false;
  const reply = (status, data) => {
    event.status = status;
    if (drop) { req.socket.destroy(); return; }
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(data === undefined ? '' : JSON.stringify(data));
  };
  try {
    if (req.method === 'OPTIONS') return reply(204);
    if (url.pathname === '/health') return reply(200, { fixture: true });
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    const json = () => bytes.length ? JSON.parse(bytes.toString()) : {};
    if (url.pathname.startsWith('/_test/')) {
      if (req.headers['x-fixture-key'] !== 'local-synthetic-test-control') return reply(403, {});
      if (url.pathname === '/_test/reset') { reset(); return reply(200, {}); }
      if (url.pathname === '/_test/control') {
        const body = json();
        if (body.rules) rules = body.rules;
        if (body.edit) Object.assign(ideas.find((idea) => idea.id === body.edit.id), body.edit);
        return reply(200, {});
      }
      if (url.pathname === '/_test/state') return reply(200, { ideas, files,
        objects: [...objects].map(([path, data]) => ({ path, size: data.length })), events });
      return reply(404, {});
    }
    events.push(event);
    const rule = rules.find((r) => r.remaining > 0 && r.method === req.method && r.path === url.pathname);
    if (rule) {
      rule.remaining--;
      if (rule.delay) await new Promise((resolve) => setTimeout(resolve, rule.delay));
      if (rule.mode === 'error') return reply(503, { code: 'fixture_failure', message: 'Synthetic failure' });
      drop = rule.mode === 'drop-after';
    }
    const token = req.headers.authorization?.replace(/^Bearer /i, '');
    const identity = sessions.get(token);
    if (url.pathname === '/auth/v1/token') {
      const body = json();
      if (body.password !== 'synthetic-test-password' || !['owner@fixture.invalid', 'other@fixture.invalid'].includes(body.email)) {
        return reply(400, { error_code: 'invalid_credentials', msg: 'Fixture login denied' });
      }
      return reply(200, session(body.email.startsWith('owner') ? OWNER : OTHER));
    }
    if (url.pathname === '/auth/v1/user') return identity ? reply(200, user(identity.id)) : reply(401, { code: 'bad_jwt', message: 'Fixture session expired' });
    if (url.pathname === '/auth/v1/logout') {
      if (!identity) return reply(401, { message: 'Not signed in' });
      for (const [key, value] of sessions) if (value.id === identity.id) sessions.delete(key);
      return reply(204);
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/attachments/') && req.method === 'GET') {
      const path = decodeURIComponent(url.pathname.slice('/storage/v1/object/sign/attachments/'.length));
      if (signed.get(url.searchParams.get('token')) !== path || !objects.has(path)) return reply(403, {});
      event.status = 200; res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(objects.get(path));
    }
    if (!identity) return reply(401, { message: 'Fixture authentication required' });
    const owner = identity.id;
    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.slice('/rest/v1/'.length);
      if (!['ideas', 'idea_files'].includes(table)) return reply(404, {});
      const rows = table === 'ideas' ? ideas : files;
      let found = rows.filter((row) => row.user_id === owner && matches(row, url.searchParams));
      if (req.method === 'POST') {
        const body = json(); const additions = Array.isArray(body) ? body : [body];
        for (const row of additions) {
          if (row.user_id !== owner || (table === 'idea_files' && !ideas.some((idea) => idea.id === row.idea_id && idea.user_id === owner))) return reply(403, { message: 'Fixture ownership denied' });
          if (rows.some((entry) => entry.id === row.id)) return reply(409, { code: '23505', message: 'duplicate key' });
        }
        found = additions.map((row) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...(table === 'ideas' ? { status: 'raw', tags: [] } : {}), ...row }));
        rows.push(...found);
      } else if (req.method === 'PATCH') {
        const update = json();
        if (update.user_id && update.user_id !== owner) return reply(403, {});
        for (const row of found) Object.assign(row, update);
      } else if (req.method === 'DELETE') {
        for (const row of found) rows.splice(rows.indexOf(row), 1);
        if (table === 'ideas') files = files.filter((file) => !found.some((idea) => idea.id === file.idea_id));
      }
      found = [...found].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      found = found.slice(Number(url.searchParams.get('offset') ?? 0), Number(url.searchParams.get('offset') ?? 0) + Number(url.searchParams.get('limit') ?? 1000));
      const select = url.searchParams.get('select') ?? '*';
      const projected = found.map((row) => {
        const value = { ...row };
        if (select.includes('files:idea_files')) value.files = files.filter((file) => file.idea_id === row.id && file.user_id === owner);
        return value;
      });
      res.setHeader('Content-Range', `0-${Math.max(0, projected.length - 1)}/${projected.length}`);
      if (req.headers.accept?.includes('application/vnd.pgrst.object+json')) {
        return projected.length === 1 ? reply(200, projected[0]) : reply(406, { code: 'PGRST116', details: `The result contains ${projected.length} rows`, message: 'Expected one row' });
      }
      return reply(200, projected);
    }
    if (url.pathname === '/storage/v1/object/sign/attachments') {
      const result = json().paths.map((path) => {
        if (!path.startsWith(`${owner}/`) || !objects.has(path)) return { path, error: 'Not found', signedURL: null };
        const token = randomUUID(); signed.set(token, path);
        return { path, error: null, signedURL: `/object/sign/attachments/${path}?token=${token}` };
      });
      return reply(200, result);
    }
    if (url.pathname.startsWith('/storage/v1/object/attachments/')) {
      const path = decodeURIComponent(url.pathname.slice('/storage/v1/object/attachments/'.length));
      if (!path.startsWith(`${owner}/`)) return reply(403, { message: 'Fixture object ownership denied' });
      if (req.method === 'POST') {
        if (objects.has(path)) return reply(409, { statusCode: '409', message: 'The resource already exists' });
        let data = bytes;
        if (req.headers['content-type']?.includes('multipart/form-data')) {
          const body = await new Request('http://127.0.0.1', { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: bytes }).formData();
          const file = [...body.values()].find((value) => typeof value !== 'string');
          data = Buffer.from(await file.arrayBuffer());
        }
        objects.set(path, data); return reply(200, { Key: `attachments/${path}`, Id: randomUUID() });
      }
    }
    return reply(404, { message: 'Unsupported fixture request' });
  } catch (error) { console.error('Fixture request failed:', error.message); if (!res.headersSent) reply(500, { message: 'Fixture implementation error' }); }
});
server.listen(4317, '127.0.0.1', () => console.log('Synthetic API fixture on 127.0.0.1:4317'));
