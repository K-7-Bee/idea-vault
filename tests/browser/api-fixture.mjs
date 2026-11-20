// A wire-protocol fixture, NOT a Supabase/PostgreSQL implementation or proof of live RLS.
// All rows, passwords, tokens and object bytes here are synthetic and disposable.
import http from 'node:http';
import { randomUUID, createHmac, createHash } from 'node:crypto';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const IDEA = '33333333-3333-4333-8333-333333333333';
const FILE = '44444444-4444-4444-8444-444444444444';
const sessions = new Map(), signed = new Map();
let ideas, files, objects, rules, events, work, drive, google;
// Phase 3A: a synthetic Google (OAuth + the few Drive calls the app makes). Not Google.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
// Phase 2 tables (migrations 006/007). Imitates their triggers and keys; not PostgreSQL.
const WORK_TABLES = ['projects', 'project_milestones', 'project_tasks', 'project_entries', 'project_components', 'project_links',
  'story_bible_entries', 'story_characters', 'story_relationships', 'story_units', 'story_timeline_events', 'story_continuity'];
const LEVELS = ['season', 'episode', 'scene', 'shot'];
const failure = (status, code, message) => ({ status, body: { code, message } });
function levelProblem(row) {
  if (!row.parent_id) return null;
  const parent = work.story_units.find((u) => u.id === row.parent_id && u.project_id === row.project_id);
  if (!parent) return failure(409, '23503', 'parent missing');
  if (LEVELS.indexOf(parent.kind) >= LEVELS.indexOf(row.kind)) return failure(400, '23514', 'A ' + row.kind + ' cannot be placed inside a ' + parent.kind + '.');
  return null;
}
function touch(row) { row.version += 1; row.updated_at = new Date().toISOString(); }
function clearLinks(table, id) {
  const unlink = (target, column) => work[target].filter((r) => r[column] === id).forEach((r) => { r[column] = null; touch(r); });
  if (table === 'project_milestones') unlink('project_tasks', 'milestone_id');
  if (table === 'story_units') { unlink('story_timeline_events', 'unit_id'); unlink('story_continuity', 'unit_id'); }
  if (table === 'story_characters') {
    work.story_relationships = work.story_relationships.filter((r) => r.from_character_id !== id && r.to_character_id !== id);
    unlink('story_continuity', 'character_id');
  }
}
function reset() {
  sessions.clear(); signed.clear(); rules = []; events = [];
  drive = new Map();
  google = { email: 'owner@fixture.invalid', scope: DRIVE_SCOPE, deny: false, noRefresh: false, refreshFail: false, expiresIn: 3599,
    codes: new Map(), refresh: new Map(), access: new Map(), revoked: [], calls: [], sessions: new Map(), dropAfterChunk: 0, chunkCount: 0,
    files: new Map([['fixture-folder-0001', { name: 'Vault Files', mimeType: FOLDER_MIME, granted: true }],
      ['fixture-doc-000001', { name: 'notes.txt', mimeType: 'text/plain', granted: true }]]) };
  work = Object.fromEntries(WORK_TABLES.map((t) => [t, []]));
  const created_at = '2026-11-15T00:00:00.000Z';
  ideas = [{ id: IDEA, user_id: OWNER, title: null, content: 'Fixture original #test', original_content: 'Fixture original #test',
    tags: ['test'], status: 'exploring', created_at, updated_at: null, archived_at: null }];
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
      if (key === 'tags') { if (JSON.stringify(row[key]) !== JSON.stringify(array(value.slice(3)))) return false; }
      else if (row[key] === null || row[key] === undefined || String(row[key]) !== value.slice(3)) return false;
    } else if (value.startsWith('in.(')) {
      if (!value.slice(4, -1).split(',').includes(String(row[key]))) return false;
    } else if (value.startsWith('cs.')) {
      if (!array(value.slice(3)).every((tag) => row[key].includes(tag))) return false;
    } else if (value.startsWith('ilike.')) {
      if (!String(row[key]).toLowerCase().includes(value.slice(7, -1).toLowerCase())) return false;
    } else if (value === 'is.null') {
      if (row[key] != null) return false;
    } else if (value === 'not.is.null') {
      if (row[key] == null) return false;
    } else throw new Error(`Unsupported fixture filter: ${key}`);
  }
  return true;
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4317');
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4318');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info, x-supabase-api-version, accept-profile, content-profile, prefer, range, range-unit, x-upsert, cache-control, content-range');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Range');
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
        if (body.google) Object.assign(google, body.google);
        if (body.googleDelete) google.files.delete(body.googleDelete);
        if (body.edit) Object.assign(ideas.find((idea) => idea.id === body.edit.id), body.edit);
        if (body.editRow) { const row = work[body.editRow.table].find((r) => r.id === body.editRow.id); Object.assign(row, body.editRow.changes); touch(row); }
        return reply(200, {});
      }
      if (url.pathname === '/_test/state') return reply(200, { ideas, files, work, drive: [...drive.values()],
        google: { revoked: google.revoked, calls: google.calls, files: [...google.files].map(([id, { bytes, ...f }]) => ({ id, ...f, stored: bytes ? bytes.length : 0 })) },
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
    if (url.pathname.startsWith('/google/')) return googleRequest(url, req, bytes, reply, res, event);
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
    if (url.pathname === '/rest/v1/drive_connections') return driveRows(url, req, json, owner, reply);
    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.slice('/rest/v1/'.length);
      if (!['ideas', 'idea_files', ...WORK_TABLES].includes(table)) return reply(404, {});
      const isWork = WORK_TABLES.includes(table);
      const rows = table === 'ideas' ? ideas : table === 'idea_files' ? files : work[table];
      let found = rows.filter((row) => row.user_id === owner && matches(row, url.searchParams));
      if (isWork && req.method === 'POST') {
        const body = json(); const additions = Array.isArray(body) ? body : [body];
        const now = new Date().toISOString();
        const made = [];
        for (const input of additions) {
          if (input.user_id !== owner) return reply(403, { code: '42501', message: 'new row violates row-level security policy' });
          if (rows.some((r) => r.id === input.id)) return reply(409, { code: '23505', message: 'duplicate key' });
          const row = { position: 0, ...input, created_at: now, updated_at: now, version: 1 };
          if (table === 'projects') {
            Object.assign(row, { stage: 'exploring', publication_status: 'private', summary: '', goals: '', source_idea_id: null, ...input,
              created_at: now, updated_at: now, version: 1, archived_at: null });
            if (row.source_idea_id) {
              if (!ideas.some((i) => i.id === row.source_idea_id && i.user_id === owner)) return reply(409, { code: '23503', message: 'idea fk' });
              if (work.projects.some((p) => p.source_idea_id === row.source_idea_id)) return reply(409, { code: '23505', message: 'projects_source_idea_key' });
            }
          } else if (!work.projects.some((p) => p.id === row.project_id && p.user_id === owner)) {
            return reply(409, { code: '23503', message: 'project fk' });
          }
          if (table === 'story_units') { const problem = levelProblem(row); if (problem) return reply(problem.status, problem.body); }
          made.push(row);
        }
        rows.push(...made); found = made;
      } else if (isWork && req.method === 'PATCH') {
        const update = json();
        for (const key of ['id', 'user_id', 'created_at', 'updated_at', 'version', ...(table === 'projects' ? [] : ['project_id'])]) delete update[key];
        if (table === 'projects' && update.source_idea_id) delete update.source_idea_id;
        for (const row of found) {
          const next = { ...row, ...update };
          if (table === 'story_units') { const problem = levelProblem(next); if (problem) return reply(problem.status, problem.body); }
          if (table === 'projects' && 'archived_at' in update) next.archived_at = update.archived_at == null ? null : (row.archived_at ?? new Date().toISOString());
          Object.assign(row, next); touch(row);
        }
      } else if (isWork && req.method === 'DELETE') {
        if (table === 'story_units' && found.some((u) => work.story_units.some((c) => c.parent_id === u.id))) {
          return reply(409, { code: '23503', message: 'update or delete on table "story_units" violates foreign key constraint' });
        }
        for (const row of found) { rows.splice(rows.indexOf(row), 1); clearLinks(table, row.id); }
      } else if (req.method === 'POST') {
        const body = json(); const additions = Array.isArray(body) ? body : [body];
        for (const row of additions) {
          if (row.user_id !== owner || (table === 'idea_files' && !ideas.some((idea) => idea.id === row.idea_id && idea.user_id === owner))) return reply(403, { message: 'Fixture ownership denied' });
          if (rows.some((entry) => entry.id === row.id)) return reply(409, { code: '23505', message: 'duplicate key' });
        }
        found = additions.map((row) => ({ id: randomUUID(), created_at: new Date().toISOString(),
          ...(table === 'ideas' ? { status: 'exploring', tags: [], title: null } : {}), ...row,
          // Mirrors migration 004's trigger: the server owns these values.
          ...(table === 'ideas' ? { original_content: row.content, updated_at: null, archived_at: null } : {}) }));
        rows.push(...found);
      } else if (req.method === 'PATCH') {
        const update = json();
        if (update.user_id && update.user_id !== owner) return reply(403, {});
        for (const row of found) {
          if (table !== 'ideas') { Object.assign(row, update); continue; }
          const before = JSON.stringify([row.title, row.content, row.status, row.tags]);
          const wasArchived = row.archived_at != null;
          const allowed = { ...update }; delete allowed.original_content; delete allowed.updated_at;
          Object.assign(row, allowed);
          if (JSON.stringify([row.title, row.content, row.status, row.tags]) !== before) row.updated_at = new Date().toISOString();
          if ('archived_at' in update && update.archived_at != null && !wasArchived) row.archived_at = new Date().toISOString();
        }
      } else if (req.method === 'DELETE') {
        for (const row of found) rows.splice(rows.indexOf(row), 1);
        if (table === 'ideas') {
          files = files.filter((file) => !found.some((idea) => idea.id === file.idea_id));
          work.projects.filter((p) => found.some((idea) => idea.id === p.source_idea_id)).forEach((p) => { p.source_idea_id = null; touch(p); });
        }
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
// Imitates migration 008: owner-only rows and its trigger (connected_at, folder cleared on account change).
function driveRows(url, req, json, owner, reply) {
  const filter = url.searchParams.get('user_id');
  if (filter && filter !== `eq.${owner}`) return reply(200, []);
  const now = new Date().toISOString();
  const current = drive.get(owner);
  if (req.method === 'GET') return reply(200, current ? [current] : []);
  if (req.method === 'DELETE') { drive.delete(owner); return reply(204); }
  const body = json();
  for (const [key, value] of Object.entries(body)) {
    if (/_enc$/.test(key) && value != null && !/^v[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return reply(400, { code: '23514', message: `${key} check` });
  }
  if (body.scope !== undefined && body.scope !== DRIVE_SCOPE) return reply(400, { code: '23514', message: 'scope check' });
  if (req.method === 'POST') {
    if (body.user_id !== owner) return reply(403, { code: '42501', message: 'new row violates row-level security policy' });
    const next = { folder_id: null, folder_name: null, ...current, ...body, updated_at: now };
    next.connected_at = !current || current.refresh_token_enc !== next.refresh_token_enc ? now : current.connected_at;
    if (current && current.google_account_id !== next.google_account_id) Object.assign(next, { folder_id: null, folder_name: null });
    drive.set(owner, next);
    return req.headers.prefer?.includes('return=representation') ? reply(201, [next]) : reply(201);
  }
  if (req.method === 'PATCH') {
    if (!current) return reply(200, []);
    delete body.user_id;
    Object.assign(current, body, { updated_at: now });
    return reply(200, [current]);
  }
  return reply(405, {});
}

const issue = (map, value) => { const token = `fixture-${randomUUID()}`; map.set(token, value); return token; };
async function googleRequest(url, req, bytes, reply, res, event) {
  const path = url.pathname.slice('/google'.length);
  google.calls.push(`${req.method} ${path}`);
  const form = () => Object.fromEntries(new URLSearchParams(bytes.toString()));
  if (path === '/auth' && req.method === 'GET') {
    const p = Object.fromEntries(url.searchParams);
    const back = new URL(p.redirect_uri);
    back.searchParams.set('state', p.state ?? '');
    if (p.client_id !== 'fixture-client-id' || p.scope !== DRIVE_SCOPE || p.code_challenge_method !== 'S256' || p.access_type !== 'offline') {
      back.searchParams.set('error', 'invalid_request');
    } else if (google.deny) back.searchParams.set('error', 'access_denied');
    else back.searchParams.set('code', issue(google.codes, { challenge: p.code_challenge, redirect: p.redirect_uri }));
    event.status = 302; res.writeHead(302, { Location: back.toString() }); return res.end();
  }
  if (path === '/token' && req.method === 'POST') {
    const body = form();
    if (body.client_id !== 'fixture-client-id' || body.client_secret !== 'fixture-client-secret') return reply(401, { error: 'invalid_client' });
    const grant = (refreshToken) => {
      const access_token = issue(google.access, { refresh: refreshToken, exp: Date.now() + google.expiresIn * 1000 });
      return { access_token, expires_in: google.expiresIn, scope: google.scope, token_type: 'Bearer' };
    };
    if (body.grant_type === 'authorization_code') {
      const code = google.codes.get(body.code); google.codes.delete(body.code);
      if (!code || code.redirect !== body.redirect_uri || createHash('sha256').update(body.code_verifier ?? '').digest('base64url') !== code.challenge) {
        return reply(400, { error: 'invalid_grant' });
      }
      const refresh = issue(google.refresh, {});
      const result = grant(refresh);
      return reply(200, google.noRefresh ? result : { ...result, refresh_token: refresh });
    }
    if (body.grant_type === 'refresh_token') {
      if (google.refreshFail || !google.refresh.has(body.refresh_token) || google.revoked.includes(body.refresh_token)) return reply(400, { error: 'invalid_grant' });
      return reply(200, grant(body.refresh_token));
    }
    return reply(400, { error: 'unsupported_grant_type' });
  }
  if (path === '/revoke' && req.method === 'POST') { google.revoked.push(form().token); return reply(200, {}); }
  if (path === '/upload/drive/v3/files' && req.method === 'PUT') return uploadBytes(url, req, bytes, reply, res, event);
  if (path.startsWith('/view/') && req.method === 'GET') {
    event.status = 200; res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<title>Synthetic Drive viewer</title><p>Synthetic Drive viewer</p>');
  }
  const bearer = req.headers.authorization?.replace(/^Bearer /i, '');
  const access = google.access.get(bearer);
  if (!access || access.exp < Date.now() || google.revoked.includes(access.refresh) || google.revoked.includes(bearer)) return reply(401, { error: { status: 'UNAUTHENTICATED' } });
  if (path === '/upload/drive/v3/files' && req.method === 'POST' && url.searchParams.get('uploadType') === 'resumable') {
    const body = JSON.parse(bytes.toString());
    if (!google.files.get(body.parents?.[0])?.granted) return reply(404, { error: { status: 'NOT_FOUND' } });
    const sid = randomUUID();
    google.sessions.set(sid, { meta: body, size: Number(req.headers['x-upload-content-length']), type: req.headers['x-upload-content-type'],
      origin: req.headers.origin, chunks: [], received: 0, fileId: null });
    event.status = 200;
    res.writeHead(200, { Location: `http://127.0.0.1:4317/google/upload/drive/v3/files?uploadType=resumable&upload_id=${sid}` });
    return res.end();
  }
  if (path === '/drive/v3/files' && req.method === 'GET') {
    const wanted = /value='([^']+)'/.exec(url.searchParams.get('q') ?? '')?.[1];
    return reply(200, { files: [...google.files].filter(([, f]) => wanted && f.appProperties?.vaultFileId === wanted && !f.trashed).map(([id]) => ({ id })) });
  }
  if (path === '/drive/v3/about' && req.method === 'GET') return reply(200, { user: { permissionId: `perm-${google.email}`, emailAddress: google.email } });
  if (path === '/drive/v3/files' && req.method === 'POST') {
    const body = JSON.parse(bytes.toString());
    const parent = google.files.get(body.parents?.[0]);
    if (!parent?.granted) return reply(404, { error: { status: 'NOT_FOUND' } });
    const id = `fixture-new-${randomUUID()}`;
    google.files.set(id, { name: body.name, mimeType: body.mimeType, granted: true, parent: body.parents[0], parents: body.parents, appProperties: body.appProperties, created: true, bytes: Buffer.alloc(0) });
    return reply(200, { id });
  }
  const fileId = path.startsWith('/drive/v3/files/') ? decodeURIComponent(path.slice('/drive/v3/files/'.length)) : null;
  const file = fileId && google.files.get(fileId);
  if (!file?.granted) return reply(404, { error: { status: 'NOT_FOUND' } });
  if (req.method === 'GET' && url.searchParams.get('alt') === 'media') {
    const data = file.bytes ?? Buffer.alloc(0);
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
      if (start >= data.length) { event.status = 416; res.writeHead(416, { 'Content-Range': `bytes */${data.length}` }); return res.end(); }
      event.status = 206;
      res.writeHead(206, { 'Content-Type': file.mimeType, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${data.length}` });
      return res.end(data.subarray(start, end + 1));
    }
    event.status = 200; res.writeHead(200, { 'Content-Type': file.mimeType, 'Content-Length': data.length }); return res.end(data);
  }
  if (req.method === 'GET') return reply(200, { id: fileId, name: file.name, mimeType: file.mimeType, trashed: !!file.trashed,
    capabilities: { canAddChildren: true }, parents: file.parents, appProperties: file.appProperties,
    ...(file.bytes ? { size: String(file.bytes.length), md5Checksum: createHash('md5').update(file.bytes).digest('hex') } : {}),
    webViewLink: `http://127.0.0.1:4317/google/view/${fileId}` });
  if (req.method === 'DELETE') { google.files.delete(fileId); return reply(204); }
  return reply(404, {});
}

// Imitates Google's resumable protocol: 308 + Range while incomplete, 200 + file when complete.
function uploadBytes(url, req, bytes, reply, res, event) {
  const session = google.sessions.get(url.searchParams.get('upload_id'));
  if (!session) return reply(404, { error: { status: 'NOT_FOUND' } });
  if (req.headers.origin && req.headers.origin !== session.origin) return reply(403, { error: { status: 'ORIGIN_MISMATCH' } });
  const incomplete = () => {
    event.status = 308;
    res.writeHead(308, session.received ? { Range: `bytes=0-${session.received - 1}` } : {});
    return res.end();
  };
  const complete = () => reply(200, { kind: 'drive#file', id: session.fileId, name: session.meta.name, mimeType: session.meta.mimeType });
  const header = req.headers['content-range'] ?? '';
  if (/^bytes \*\/\d+$/.test(header)) return session.fileId ? complete() : incomplete();
  const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header);
  if (!m || Number(m[3]) !== session.size) return reply(400, { error: { status: 'BAD_RANGE' } });
  if (Number(m[1]) !== session.received) return incomplete();
  if (bytes.length !== Number(m[2]) - Number(m[1]) + 1) return reply(400, { error: { status: 'BAD_LENGTH' } });
  session.chunks.push(Buffer.from(bytes));
  session.received += bytes.length;
  google.chunkCount++;
  if (session.received === session.size) {
    const data = Buffer.concat(session.chunks);
    session.fileId = `fixture-up-${randomUUID()}`;
    google.files.set(session.fileId, { name: session.meta.name, mimeType: session.meta.mimeType, granted: true, created: true,
      parents: session.meta.parents, appProperties: session.meta.appProperties, bytes: data, uploaded: true });
  }
  // A dropped response after the bytes were stored: the browser must ask and resume.
  if (google.dropAfterChunk && google.chunkCount === google.dropAfterChunk) { req.socket.destroy(); return; }
  return session.fileId ? complete() : incomplete();
}

server.listen(4317, '127.0.0.1', () => console.log('Synthetic API fixture on 127.0.0.1:4317'));
