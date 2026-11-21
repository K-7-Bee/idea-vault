// A wire-protocol fixture, NOT a Supabase/PostgreSQL implementation or proof of live RLS.
// All rows, passwords, tokens and object bytes here are synthetic and disposable.
import http from 'node:http';
import { randomUUID, createHmac, createHash } from 'node:crypto';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const IDEA = '33333333-3333-4333-8333-333333333333';
const FILE = '44444444-4444-4444-8444-444444444444';
const sessions = new Map(), signed = new Map();
let ideas, files, objects, rules, events, work, drive, google, simple, showcase, profile;
// Phase 3A: a synthetic Google (OAuth + the few Drive calls the app makes). Not Google.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
// Phase 2 tables (migrations 006/007). Imitates their triggers and keys; not PostgreSQL.
const WORK_TABLES = ['projects', 'project_milestones', 'project_tasks', 'project_entries', 'project_components', 'project_links',
  'story_bible_entries', 'story_characters', 'story_relationships', 'story_units', 'story_timeline_events', 'story_continuity'];
const LEVELS = ['season', 'episode', 'scene', 'shot'];
const failure = (status, code, message) => ({ status, body: { code, message } });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

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
  const unlinkFiles = (column) => simple.project_files.filter((r) => r[column] === id).forEach((r) => { r[column] = null; r.is_main = false; });
  if (table === 'story_units') unlinkFiles('unit_id');
  if (table === 'story_characters') unlinkFiles('character_id');
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
      ['fixture-doc-000001', { name: 'notes.txt', mimeType: 'text/plain', granted: true, bytes: Buffer.from('synthetic notes') }],
      ['fixture-gdoc-00001', { name: 'Design brief', mimeType: 'application/vnd.google-apps.document', granted: true }],
      ['fixture-hidden-001', { name: 'secret.txt', mimeType: 'text/plain', granted: false }],
      ['fixture-img-000001', { name: 'castle.png', mimeType: 'image/png', granted: true, bytes: PNG }],
      ['fixture-img-000002', { name: 'forest.png', mimeType: 'image/png', granted: true, bytes: PNG }]]) };
  simple = { project_files: [], drive_folders: [] };
  showcase = { drafts: [], live: [], objects: new Map() };
  // Phase 4B (migration 014). The fixture's owner is the recorded site owner.
  profile = { drafts: [], published: null, versions: [] };
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
        if (body.googleFile) Object.assign(google.files.get(body.googleFile.id), body.googleFile.changes);
        if (body.edit) Object.assign(ideas.find((idea) => idea.id === body.edit.id), body.edit);
        if (body.googleBytes) google.files.get(body.googleBytes.id).bytes = Buffer.from(body.googleBytes.text);
        if (body.showcaseObjectAge) for (const o of showcase.objects.values()) o.created_at = new Date(Date.now() - body.showcaseObjectAge).toISOString();
        if (body.editRow) { const row = work[body.editRow.table].find((r) => r.id === body.editRow.id); Object.assign(row, body.editRow.changes); touch(row); }
        return reply(200, {});
      }
      if (url.pathname === '/_test/state') return reply(200, { ideas, files, work, drive: [...drive.values()],
        simple, profile, showcase: { drafts: showcase.drafts, live: showcase.live, objects: [...showcase.objects].map(([path, o]) => ({ path, size: o.bytes.length, type: o.type })) },
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
    // Phase 4A: the public snapshot and public image copies are readable without a session.
    if (url.pathname === '/rest/v1/showcases') return showcaseRows(url, req, identity, reply);
    if (url.pathname.startsWith('/storage/v1/object/public/showcase/') && req.method === 'GET') {
      const object = showcase.objects.get(decodeURIComponent(url.pathname.slice('/storage/v1/object/public/showcase/'.length)));
      if (!object) return reply(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      event.status = 200; res.writeHead(200, { 'Content-Type': object.type, 'Cache-Control': 'max-age=60' }); return res.end(object.bytes);
    }
    // Phase 4B: the published profile is readable without a session (two columns only).
    if (url.pathname === '/rest/v1/profile_published') return profilePublishedRows(url, req, identity, reply);
    if (!identity) return reply(401, { message: 'Fixture authentication required' });
    if (url.pathname === '/rest/v1/profile_drafts') return profileDraftRows(url, req, json, identity.id, reply);
    if (url.pathname === '/rest/v1/profile_versions') {
      if (req.method !== 'GET') return reply(401, { code: '42501', message: 'permission denied for table profile_versions' });
      return respondRows(req, reply, profile.versions.filter((v) => v.user_id === identity.id && matches(v, url.searchParams))
        .sort((a, b) => b.version - a.version).map(({ version, content, published_at }) => ({ version, content, published_at })));
    }
    if (url.pathname === '/rest/v1/rpc/publish_profile' && req.method === 'POST') return publishProfile(json(), identity.id, reply);
    if (url.pathname === '/rest/v1/project_showcases') return draftRows(url, req, json, identity.id, reply);
    if (url.pathname === '/rest/v1/rpc/publish_showcase' && req.method === 'POST') return publishShowcase(json(), identity.id, reply);
    if (url.pathname === '/rest/v1/rpc/unpublish_showcase' && req.method === 'POST') return unpublishShowcase(json(), identity.id, reply);
    if (url.pathname.startsWith('/storage/v1/object/') && url.pathname.includes('showcase')) return showcaseStorage(url, req, bytes, json, identity.id, reply);
    const owner = identity.id;
    if (url.pathname === '/rest/v1/drive_connections') return driveRows(url, req, json, owner, reply);
    if (url.pathname === '/rest/v1/rpc/project_file_make_main' && req.method === 'POST') {
      const target = simple.project_files.find((r) => r.id === json().file_id && r.user_id === owner);
      if (!target || (!target.character_id && !target.unit_id)) return reply(200, false);
      const column = target.character_id ? 'character_id' : 'unit_id';
      for (const r of simple.project_files) if (r[column] === target[column]) r.is_main = r === target;
      return reply(200, true);
    }
    if (url.pathname === '/rest/v1/project_files' || url.pathname === '/rest/v1/drive_folders') return simpleRows(url.pathname.slice(9), url, req, json, owner, reply);
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
          if (table === 'projects' && input.publication_status === 'published') return reply(400, { code: '23514', message: 'Publish a project from its Showcase tab.' });
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
          if (table === 'projects') { const problem = publicationRules(row, next); if (problem) return reply(problem.status, problem.body); }
          Object.assign(row, next); touch(row);
          if (table === 'projects' && row.publication_status !== 'published') showcase.live = showcase.live.filter((l) => l.project_id !== row.id);
        }
      } else if (isWork && req.method === 'DELETE') {
        if (table === 'story_units' && found.some((u) => work.story_units.some((c) => c.parent_id === u.id))) {
          return reply(409, { code: '23503', message: 'update or delete on table "story_units" violates foreign key constraint' });
        }
        for (const row of found) { rows.splice(rows.indexOf(row), 1); clearLinks(table, row.id); }
        if (table === 'projects') for (const row of found) {
          showcase.live = showcase.live.filter((l) => l.project_id !== row.id);
          showcase.drafts = showcase.drafts.filter((d) => d.project_id !== row.id);
        }
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

// Imitates migration 011: owner-only rows, same-project record links, unique Drive link per project,
// one folder row per parent, and server-owned identity on update. Not PostgreSQL.
function simpleRows(table, url, req, json, owner, reply) {
  const rows = simple[table];
  const now = new Date().toISOString();
  const found = () => rows.filter((row) => row.user_id === owner && matches(row, url.searchParams));
  const respond = (status, list) => {
    const sorted = [...list].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    if (req.headers.accept?.includes('application/vnd.pgrst.object+json')) {
      return sorted.length === 1 ? reply(status, sorted[0]) : reply(406, { code: 'PGRST116', message: 'Expected one row' });
    }
    return reply(status, sorted);
  };
  const linkOk = (row) => {
    if (row.entry_id && !work.project_entries.some((e) => e.id === row.entry_id && e.project_id === row.project_id)) return false;
    if (row.component_id && !work.project_components.some((c) => c.id === row.component_id && c.project_id === row.project_id)) return false;
    if (row.character_id && !work.story_characters.some((c) => c.id === row.character_id && c.project_id === row.project_id)) return false;
    if (row.unit_id && !work.story_units.some((c) => c.id === row.unit_id && c.project_id === row.project_id)) return false;
    return ['entry_id', 'component_id', 'character_id', 'unit_id'].filter((k) => row[k]).length <= 1;
  };
  if (req.method === 'GET') return respond(200, found());
  if (req.method === 'DELETE') { const gone = found(); for (const row of gone) rows.splice(rows.indexOf(row), 1); return respond(200, gone); }
  const body = json();
  if (req.method === 'POST') {
    const row = { id: body.id ?? randomUUID(), ...body, created_at: now, updated_at: now };
    if (row.user_id !== owner) return reply(403, { code: '42501', message: 'row-level security' });
    if (rows.some((r) => r.id === row.id)) return reply(409, { code: '23505', message: 'duplicate key' });
    if (table === 'project_files') {
      if (!work.projects.some((p) => p.id === row.project_id && p.user_id === owner)) return reply(409, { code: '23503', message: 'project fk' });
      if (!linkOk(row)) return reply(409, { code: '23503', message: 'record fk' });
      if (rows.some((r) => r.project_id === row.project_id && r.drive_file_id === row.drive_file_id)) return reply(409, { code: '23505', message: 'project_files_project_id_drive_file_id_key' });
      Object.assign(row, { state: 'ok', state_reason: null, checked_at: null, entry_id: null, component_id: null, character_id: null, unit_id: null, ...body, is_main: false, created_at: now, updated_at: now });
    } else if (rows.some((r) => r.user_id === owner && r.purpose === row.purpose && r.parent_folder_id === row.parent_folder_id && (row.purpose !== 'project' || r.project_id === row.project_id))) {
      return reply(409, { code: '23505', message: 'drive_folders key' });
    }
    rows.push(row);
    return req.headers.prefer?.includes('return=representation') ? respond(201, [row]) : reply(201);
  }
  if (req.method === 'PATCH') {
    const targets = found();
    for (const key of ['id', 'user_id', 'project_id', 'source', 'drive_file_id', 'created_at']) delete body[key];
    for (const row of targets) { if (!linkOk({ ...row, ...body })) return reply(409, { code: '23503', message: 'record fk' }); }
    for (const row of targets) {
      const moved = ['character_id', 'unit_id'].some((k) => k in body && body[k] !== row[k]);
      Object.assign(row, body, { updated_at: now });
      if (moved || (!row.character_id && !row.unit_id)) row.is_main = false;
    }
    return respond(200, targets);
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
  if (path.startsWith('/thumb/') && req.method === 'GET') {
    const id = decodeURIComponent(path.slice('/thumb/'.length)).replace(/=s\d+$/, '');
    if (!google.files.get(id)?.granted) return reply(404, {});
    event.status = 200; res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': PNG.length }); return res.end(PNG);
  }
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
    webViewLink: `http://127.0.0.1:4317/google/view/${fileId}`,
    ...(file.mimeType?.startsWith('image/') && !file.noThumb ? { thumbnailLink: `http://127.0.0.1:4317/google/thumb/${fileId}=s220` } : {}) });
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

// ---------- Phase 4A: imitates migration 013 (not PostgreSQL) ----------
const RESERVED = ['waste-to-energy-lighting', 'cha-restaurant', 'idea-vault'];
const SECTION_KEYS = ['problem', 'objective', 'approach', 'implementation', 'results', 'limitations', 'lessons'];
const ANON_COLUMNS = ['slug', 'title', 'category', 'summary', 'technologies', 'sections', 'links', 'images', 'published_at'];
const slugOk = (slug) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length >= 3 && slug.length <= 60 && !RESERVED.includes(slug);
const pgError = (status, code, message) => ({ status, body: { code, message } });

// projects_publication_rules: only publish_showcase can publish; leaving "completed" or archiving demotes.
function publicationRules(row, next) {
  if (next.publication_status !== 'published') return null;
  if (row.publication_status !== 'published' && !showcase.live.some((l) => l.project_id === row.id)) {
    return pgError(400, '23514', 'Publish a project from its Showcase tab.');
  }
  if (next.stage !== 'completed' || next.archived_at != null) next.publication_status = 'ready';
  return null;
}

function respondRows(req, reply, rows) {
  if (req.headers.accept?.includes('application/vnd.pgrst.object+json')) {
    return rows.length === 1 ? reply(200, rows[0]) : reply(406, { code: 'PGRST116', message: 'Expected one row' });
  }
  return reply(200, rows);
}

// Column grants: anon gets the public columns only; signed-in accounts also get project_id.
function showcaseRows(url, req, identity, reply) {
  if (req.method !== 'GET') return reply(401, { code: '42501', message: 'permission denied for table showcases' });
  const select = (url.searchParams.get('select') ?? '*').split(',').map((c) => c.trim());
  const allowed = identity ? [...ANON_COLUMNS, 'project_id'] : ANON_COLUMNS;
  if (select.some((c) => !allowed.includes(c))) return reply(401, { code: '42501', message: 'permission denied for table showcases' });
  let rows = showcase.live.filter((row) => matches(row, url.searchParams));
  rows = [...rows].sort((a, b) => b.published_at.localeCompare(a.published_at));
  rows = rows.slice(0, Number(url.searchParams.get('limit') ?? 1000)).map((row) => Object.fromEntries(select.map((c) => [c, row[c]])));
  return respondRows(req, reply, rows);
}

function draftRows(url, req, json, owner, reply) {
  const now = new Date().toISOString();
  const found = () => showcase.drafts.filter((d) => d.user_id === owner && matches(d, url.searchParams));
  const check = (row) => {
    if (row.slug && !slugOk(row.slug)) return pgError(400, '23514', 'new row violates check constraint "project_showcases_slug_check"');
    if (row.slug && showcase.drafts.some((d) => d.id !== row.id && d.slug === row.slug)) return pgError(409, '23505', 'duplicate key value violates unique constraint "project_showcases_slug_key"');
    return null;
  };
  if (req.method === 'GET') return respondRows(req, reply, found());
  if (req.method === 'POST') {
    const body = json();
    if (body.user_id !== owner) return reply(403, { code: '42501', message: 'row-level security' });
    if (!work.projects.some((p) => p.id === body.project_id && p.user_id === owner)) return reply(409, { code: '23503', message: 'project fk' });
    if (showcase.drafts.some((d) => d.project_id === body.project_id)) return reply(409, { code: '23505', message: 'project_showcases_project_id_key' });
    const row = { slug: '', title: '', category: '', summary: '', technologies: [], sections: {}, links: [], images: [], ...body, created_at: now, updated_at: now, version: 1 };
    const problem = check(row); if (problem) return reply(problem.status, problem.body);
    showcase.drafts.push(row);
    return respondRows(req, reply, [row]);
  }
  if (req.method === 'PATCH') {
    const body = json();
    for (const key of ['id', 'user_id', 'project_id', 'created_at', 'updated_at', 'version']) delete body[key];
    const targets = found();
    for (const row of targets) { const problem = check({ ...row, ...body }); if (problem) return reply(problem.status, problem.body); }
    for (const row of targets) { Object.assign(row, body, { updated_at: now }); row.version += 1; }
    return respondRows(req, reply, targets);
  }
  if (req.method === 'DELETE') { const gone = found(); showcase.drafts = showcase.drafts.filter((d) => !gone.includes(d)); return respondRows(req, reply, gone); }
  return reply(405, {});
}

function publishShowcase({ p_project, p_draft_version, p_image_paths }, owner, reply) {
  const project = work.projects.find((p) => p.id === p_project && p.user_id === owner);
  if (!project) return reply(400, { code: 'P0002', message: 'Project not found.' });
  if (project.stage !== 'completed' || project.archived_at) return reply(400, { code: '23514', message: 'Only a completed, active project can be published.' });
  const d = showcase.drafts.find((x) => x.project_id === project.id && x.user_id === owner);
  if (!d || d.version !== p_draft_version) return reply(400, { code: '40001', message: 'The showcase changed since you checked it. Review it again before publishing.' });
  if (!d.slug || !d.title.trim() || !d.summary.trim()) return reply(400, { code: '23514', message: 'A showcase needs an address, a title and a summary.' });
  const paths = p_image_paths ?? [];
  if (paths.length !== d.images.length) return reply(400, { code: '40001', message: 'The images changed. Review the showcase again.' });
  if (paths.some((p) => !new RegExp('^' + owner + '/[0-9a-f-]{36}\\.(webp|jpg|png)$').test(p))) return reply(400, { code: '23514', message: 'An image path is not allowed.' });
  if (d.images.some((i) => !i.alt?.trim())) return reply(400, { code: '23514', message: 'Each image needs a short description.' });
  if (showcase.live.some((l) => l.slug === d.slug && l.project_id !== project.id)) return reply(409, { code: '23505', message: 'duplicate key value violates unique constraint "showcases_slug_key"' });
  const row = { project_id: project.id, user_id: owner, slug: d.slug, title: d.title.trim(), category: d.category.trim(), summary: d.summary.trim(),
    technologies: d.technologies, links: d.links, published_at: new Date().toISOString(),
    sections: SECTION_KEYS.filter((k) => (d.sections[k] ?? '').trim()).map((k) => ({ key: k, body: d.sections[k].trim() })),
    images: d.images.map((img, i) => ({ path: paths[i], alt: img.alt.trim() })) };
  showcase.live = [...showcase.live.filter((l) => l.project_id !== project.id), row];
  if (project.publication_status !== 'published') { project.publication_status = 'published'; touch(project); }
  return reply(200, project.version);
}

function unpublishShowcase({ p_project }, owner, reply) {
  const project = work.projects.find((p) => p.id === p_project && p.user_id === owner);
  if (!project) return reply(400, { code: 'P0002', message: 'Project not found.' });
  showcase.live = showcase.live.filter((l) => l.project_id !== project.id);
  if (project.publication_status === 'published') { project.publication_status = 'ready'; touch(project); }
  return reply(200, project.version);
}

// The "showcase" bucket: public, 5 MB, JPEG/PNG/WebP; owners list, add and remove in their own folder.
function showcaseStorage(url, req, bytes, json, owner, reply) {
  if (url.pathname === '/storage/v1/object/list/showcase' && req.method === 'POST') {
    const prefix = (json().prefix ?? '').replace(/\/$/, '');
    if (prefix !== owner) return reply(200, []);
    return reply(200, [...showcase.objects].filter(([path]) => path.startsWith(owner + '/'))
      .map(([path, o]) => ({ name: path.slice(owner.length + 1), id: o.id, created_at: o.created_at, updated_at: o.created_at, metadata: { size: o.bytes.length, mimetype: o.type } })));
  }
  if (url.pathname === '/storage/v1/object/showcase' && req.method === 'DELETE') {
    const removed = [];
    for (const path of json().prefixes ?? []) {
      if (path.startsWith(owner + '/') && showcase.objects.has(path)) { showcase.objects.delete(path); removed.push({ name: path }); }
    }
    return reply(200, removed);
  }
  if (url.pathname.startsWith('/storage/v1/object/showcase/') && req.method === 'POST') {
    const path = decodeURIComponent(url.pathname.slice('/storage/v1/object/showcase/'.length));
    const type = (req.headers['content-type'] ?? '').split(';')[0];
    if (!path.startsWith(owner + '/')) return reply(403, { statusCode: '403', message: 'new row violates row-level security policy' });
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return reply(415, { statusCode: '415', message: 'mime type not supported' });
    if (bytes.length > 5 * 1024 * 1024) return reply(413, { statusCode: '413', message: 'The object exceeded the maximum allowed size' });
    if (showcase.objects.has(path)) return reply(409, { statusCode: '409', message: 'The resource already exists' });
    showcase.objects.set(path, { id: randomUUID(), bytes: Buffer.from(bytes), type, created_at: new Date().toISOString() });
    return reply(200, { Key: 'showcase/' + path, Id: randomUUID() });
  }
  return reply(404, { message: 'Unsupported fixture request' });
}

// ---------- Phase 4B: profile (imitates migration 014; not PostgreSQL) ----------

function profilePublishedRows(url, req, identity, reply) {
  if (req.method !== 'GET') return reply(401, { code: '42501', message: 'permission denied for table profile_published' });
  const select = (url.searchParams.get('select') ?? '*').split(',').map((c) => c.trim());
  const allowed = identity ? ['content', 'version', 'published_at'] : ['content', 'published_at'];
  if (select.some((c) => !allowed.includes(c))) return reply(401, { code: '42501', message: 'permission denied for table profile_published' });
  const rows = profile.published ? [Object.fromEntries(select.map((c) => [c, profile.published[c]]))] : [];
  return respondRows(req, reply, rows);
}

function profileDraftRows(url, req, json, owner, reply) {
  const columns = (row) => ({ id: row.id, content: row.content, version: row.version, updated_at: row.updated_at });
  const found = () => profile.drafts.filter((d) => d.user_id === owner && matches(d, url.searchParams));
  const objectOk = (content) => content && typeof content === 'object' && !Array.isArray(content) && JSON.stringify(content).length <= 100000;
  if (req.method === 'GET') return respondRows(req, reply, found().map(columns));
  if (req.method === 'POST') {
    const body = json();
    if (body.user_id !== owner) return reply(403, { code: '42501', message: 'row-level security' });
    if (profile.drafts.some((d) => d.user_id === owner)) return reply(409, { code: '23505', message: 'profile_drafts_user_id_key' });
    if (!objectOk(body.content)) return reply(400, { code: '23514', message: 'profile_drafts_content_check' });
    const now = new Date().toISOString();
    const row = { id: body.id ?? randomUUID(), user_id: owner, content: body.content, version: 1, created_at: now, updated_at: now };
    profile.drafts.push(row);
    return respondRows(req, reply, [columns(row)]);
  }
  if (req.method === 'PATCH') {
    const body = json();
    if (!objectOk(body.content)) return reply(400, { code: '23514', message: 'profile_drafts_content_check' });
    const targets = found();
    for (const row of targets) { row.content = body.content; touch(row); }
    return respondRows(req, reply, targets.map(columns));
  }
  return reply(405, {});
}

// A few of profile_content_problem's checks: enough to prove the app reports a refusal.
function profileProblem(c) {
  if (!c || typeof c !== 'object' || typeof c.name !== 'string' || !c.name.trim()) return 'Add your name (up to 80 characters).';
  const links = [...(c.links ?? []).map((l) => l.href), ...(c.certificates ?? []).map((x) => x.href).filter(Boolean)];
  if (links.some((h) => !/^https:\/\/[^\s<>"]+$/.test(h))) return 'Links: up to 8, each with a label and an https address.';
  if (/<[A-Za-z/!]/.test(JSON.stringify(c))) return 'The profile has a field that is too long or not allowed.';
  return null;
}

function publishProfile({ p_draft_version }, owner, reply) {
  if (owner !== OWNER) return reply(403, { code: '42501', message: 'Only the site owner can publish the profile.' });
  const d = profile.drafts.find((x) => x.user_id === owner);
  if (!d || d.version !== p_draft_version) return reply(400, { code: '40001', message: 'The profile changed since you checked it. Review it again before publishing.' });
  const problem = profileProblem(d.content);
  if (problem) return reply(400, { code: '23514', message: problem });
  const version = Math.max(0, ...profile.versions.map((v) => v.version)) + 1;
  const published_at = new Date().toISOString();
  profile.versions.push({ user_id: owner, version, content: structuredClone(d.content), published_at });
  profile.published = { user_id: owner, content: structuredClone(d.content), version, published_at };
  return reply(200, version);
}

server.listen(4317, '127.0.0.1', () => console.log('Synthetic API fixture on 127.0.0.1:4317'));
