import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';

function load(file) {
  const source = ts.transpileModule(fs.readFileSync(path.join(import.meta.dirname, '..', file), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  let n = 0;
  vm.runInNewContext(source, { exports, require: () => ({}), crypto: { randomUUID: () => `uuid-${++n}` } });
  return exports;
}

const ws = load('src/lib/workspace.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));

// Records every call on a PostgREST-style chain and answers from a queue of responses.
function fakeClient(answers) {
  const calls = [];
  const queue = [...answers];
  const client = {
    from(table) {
      const call = { table, op: null, payload: null, filters: [] };
      calls.push(call);
      const next = async () => {
        const answer = queue.shift();
        if (answer instanceof Error) throw answer;
        return answer;
      };
      const q = {
        select(columns) { if (!call.op) call.op = 'select'; call.columns = columns; return q; },
        insert(payload) { call.op = 'insert'; call.payload = payload; return q; },
        update(payload) { call.op = 'update'; call.payload = payload; return q; },
        delete() { call.op = 'delete'; return q; },
        eq(column, value) { call.filters.push([column, value]); return q; },
        single: next,
        maybeSingle: next,
        then(resolve, reject) { return next().then(resolve, reject); },
      };
      return q;
    },
  };
  return { client, calls };
}

test('stages and project vocabulary match migrations 005-007', () => {
  assert.deepEqual(plain(ws.STAGES), ['exploring', 'analyzing', 'building', 'completed']);
  assert.deepEqual(plain(ws.PROJECT_TYPES.map((t) => t.value)), ['engineering', 'story', 'hybrid']);
  assert.deepEqual(plain(ws.SETTABLE_PUBLICATION), ['private', 'ready']);
  assert.equal(ws.ALL_TABLES.length, 11);
});

test('only completed AND published AND unarchived projects are publicly visible', () => {
  for (const stage of ws.STAGES) {
    for (const publication_status of ['private', 'ready', 'published']) {
      for (const archived_at of [null, '2026-11-17T00:00:00Z']) {
        const expected = stage === 'completed' && publication_status === 'published' && archived_at === null;
        assert.equal(ws.isPubliclyVisible({ stage, publication_status, archived_at }), expected, `${stage}/${publication_status}/${archived_at}`);
      }
    }
  }
});

test('tabs follow project type: hybrid has both, engineering and story only their own', () => {
  assert.equal(ws.hasEngineering('engineering') && ws.hasEngineering('hybrid') && !ws.hasEngineering('story'), true);
  assert.equal(ws.hasStory('story') && ws.hasStory('hybrid') && !ws.hasStory('engineering'), true);
});

test('cleanValues validates and normalises form input without guessing', () => {
  const tasks = ws.TABLES.project_tasks;
  assert.deepEqual(plain(ws.cleanValues(tasks, { title: '  Wire servo  ', status: '', milestone_id: '', notes: 'line\n\n' })),
    { ok: true, values: { title: 'Wire servo', status: 'todo', milestone_id: null, notes: 'line' } });
  assert.match(ws.cleanValues(tasks, { title: '   ' }).message, /Task is required/);
  assert.match(ws.cleanValues(tasks, { title: 'x', status: 'archived' }).message, /valid column/);
  assert.match(ws.cleanValues(tasks, { title: 'x'.repeat(301) }).message, /too long/);

  const components = ws.TABLES.project_components;
  assert.equal(ws.cleanValues(components, { name: 'Servo', quantity: '2' }).values.quantity, 2);
  assert.match(ws.cleanValues(components, { name: 'Servo', quantity: '-1' }).message, /above zero/);
  assert.match(ws.cleanValues(components, { name: 'Servo', link: 'javascript:alert(1)' }).message, /https:\/\//);
  assert.equal(ws.cleanValues(components, { name: 'Servo', link: '' }).values.link, null);
  assert.equal(ws.cleanValues(components, { name: 'Servo', specification: '' }).values.specification, '');

  const milestones = ws.TABLES.project_milestones;
  assert.match(ws.cleanValues(milestones, { title: 'M1', due_on: 'tomorrow' }).message, /date/);
  assert.equal(ws.cleanValues(milestones, { title: 'M1', due_on: '2026-12-01' }).values.due_on, '2026-12-01');

  const relationships = ws.TABLES.story_relationships;
  assert.match(ws.cleanValues(relationships, { relationship: 'sister', to_character_id: 'b' }).message, /Character is required/);
  assert.match(ws.cleanValues(relationships, { from_character_id: 'a', relationship: 'self', to_character_id: 'a' }).message, /two different characters/);
  assert.equal(ws.cleanValues(relationships, { from_character_id: 'a', relationship: 'sister of', to_character_id: 'b' }).ok, true);
});

test('unitPath gives the exact scene/shot reference and survives broken parents', () => {
  const units = [
    { id: 's1', kind: 'season', title: 'S1', parent_id: null },
    { id: 'sc', kind: 'scene', title: 'Market', parent_id: 's1' },
    { id: 'sh', kind: 'shot', title: 'Close-up', parent_id: 'sc' },
    { id: 'loopA', kind: 'scene', title: 'A', parent_id: 'loopB' },
    { id: 'loopB', kind: 'scene', title: 'B', parent_id: 'loopA' },
  ];
  assert.equal(ws.unitPath(units, 'sh'), 'Season: S1 › Scene: Market › Shot: Close-up');
  assert.equal(ws.unitPath(units, 'missing'), '');
  assert.equal(ws.unitPath(units, null), '');
  assert.equal(ws.unitPath(units, 'loopA'), 'Scene: B › Scene: A');
  assert.ok(ws.unitRank('season') < ws.unitRank('episode') && ws.unitRank('scene') < ws.unitRank('shot'));
});

test('next action prefers the first task in progress, then the first to do, and never invents one', () => {
  const t = (id, status, position) => ({ id, status, position, title: id, created_at: '2026-11-17T00:00:00Z' });
  assert.equal(ws.nextAction([t('a', 'todo', 2), t('b', 'todo', 1), t('c', 'done', 0)]).id, 'b');
  assert.equal(ws.nextAction([t('a', 'todo', 1), t('d', 'doing', 5)]).id, 'd');
  assert.equal(ws.nextAction([t('c', 'done', 0)]), null);
  assert.equal(ws.nextAction([]), null);
});

test('updates and deletes are owner- and version-checked; stale or missing rows are conflicts', async () => {
  const base = { id: 'row', version: 3 };
  const ok = fakeClient([{ data: [{ id: 'row', version: 4 }], error: null }]);
  const saved = await ws.updateRecord(ok.client, 'project_tasks', 'owner', base, { title: 'New' });
  assert.equal(saved.ok, true);
  assert.deepEqual(ok.calls[0].filters, [['id', 'row'], ['user_id', 'owner'], ['version', 3]]);
  assert.deepEqual(plain(ok.calls[0].payload), { title: 'New' });

  const stale = fakeClient([{ data: [], error: null }]);
  assert.equal((await ws.updateRecord(stale.client, 'project_tasks', 'owner', base, {})).reason, 'conflict');
  const gone = fakeClient([{ data: [], error: null }]);
  assert.equal((await ws.deleteRecord(gone.client, 'project_tasks', 'owner', base)).reason, 'conflict');
  const del = fakeClient([{ data: [{ id: 'row' }], error: null }]);
  assert.equal((await ws.deleteRecord(del.client, 'story_units', 'owner', base)).ok, true);
  assert.deepEqual(del.calls[0].filters, [['id', 'row'], ['user_id', 'owner'], ['version', 3]]);

  const contained = fakeClient([{ data: null, error: { code: '23503', message: 'violates foreign key constraint secret_name' } }]);
  const blocked = await ws.deleteRecord(contained.client, 'story_units', 'owner', base);
  assert.equal(blocked.reason, 'blocked');
  assert.doesNotMatch(blocked.message, /secret_name/);
  const offline = fakeClient([new TypeError('Failed to fetch')]);
  assert.equal((await ws.updateRecord(offline.client, 'project_tasks', 'owner', base, {})).reason, 'failed');
  const level = fakeClient([{ data: null, error: { code: '23514', message: 'A season cannot be placed inside a shot.' } }]);
  assert.equal((await ws.updateRecord(level.client, 'story_units', 'owner', base, {})).reason, 'invalid');
});

test('insertRecord scopes new rows to owner and project with a fixed id', async () => {
  const { client, calls } = fakeClient([{ data: { id: 'uuid-x' }, error: null }]);
  const result = await ws.insertRecord(client, 'project_entries', 'owner', 'project', { kind: 'note', title: 'T' });
  assert.equal(result.ok, true);
  assert.equal(calls[0].op, 'insert');
  assert.equal(calls[0].payload.user_id, 'owner');
  assert.equal(calls[0].payload.project_id, 'project');
  assert.match(calls[0].payload.id, /^uuid-/);
});

test('swapPositions reports a partial move instead of hiding it', async () => {
  const a = { id: 'a', version: 1, position: 1 }, b = { id: 'b', version: 1, position: 2 };
  const half = fakeClient([{ data: [{ ...a, position: 2, version: 2 }], error: null }, { data: [], error: null }]);
  const result = await ws.swapPositions(half.client, 'project_tasks', 'owner', a, b);
  assert.equal(result.ok, false);
  assert.match(result.message, /Only part of the move/);
  assert.equal(half.calls[0].payload.position, 2);
  assert.equal(half.calls[1].payload.position, 1);
});

test('convertIdea is idempotent: an existing project is returned and the idea is never written', async () => {
  const idea = { id: 'idea', title: null, content: '\n  Build a robot arm\nwith servos', status: 'analyzing' };
  const existing = fakeClient([{ data: { id: 'p1', title: 'Old' }, error: null }]);
  const found = await ws.convertIdea(existing.client, 'owner', idea, 'engineering');
  assert.deepEqual(plain(found), { ok: true, value: { project: { id: 'p1', title: 'Old' }, existed: true } });
  assert.equal(existing.calls.length, 1);
  assert.deepEqual(existing.calls[0].filters, [['user_id', 'owner'], ['source_idea_id', 'idea']]);

  const fresh = fakeClient([{ data: null, error: null }, { data: { id: 'p2' }, error: null }]);
  const made = await ws.convertIdea(fresh.client, 'owner', idea, 'hybrid');
  assert.equal(made.value.existed, false);
  const insert = fresh.calls[1];
  assert.equal(insert.table, 'projects');
  assert.equal(insert.payload.title, 'Build a robot arm');
  assert.equal(insert.payload.stage, 'analyzing');
  assert.equal(insert.payload.project_type, 'hybrid');
  assert.equal(insert.payload.source_idea_id, 'idea');
  assert.ok(fresh.calls.every((c) => c.table !== 'ideas'));

  // A second tab won the race: the unique index rejects ours and the winner is returned.
  const race = fakeClient([{ data: null, error: null }, { data: null, error: { code: '23505', message: 'duplicate' } }, { data: { id: 'winner' }, error: null }]);
  const raced = await ws.convertIdea(race.client, 'owner', idea, 'story');
  assert.equal(raced.value.project.id, 'winner');
  assert.equal(raced.value.existed, true);

  const legacy = fakeClient([{ data: null, error: null }, { data: { id: 'p3' }, error: null }]);
  await ws.convertIdea(legacy.client, 'owner', { ...idea, title: '  Titled  ', status: 'raw' }, 'story');
  assert.equal(legacy.calls[1].payload.title, 'Titled');
  assert.equal(legacy.calls[1].payload.stage, 'exploring');

  assert.equal((await ws.convertIdea(fakeClient([]).client, 'owner', idea, 'cooking')).reason, 'invalid');
});

test('saveProject cannot publish, but keeps a publication value set elsewhere', async () => {
  const base = { id: 'p', version: 1, publication_status: 'private' };
  const edit = { title: 'P', project_type: 'engineering', stage: 'completed', publication_status: 'published', summary: '', goals: '' };
  const refused = await ws.saveProject(fakeClient([]).client, 'owner', base, edit);
  assert.match(refused.message, /Showcase tab/);
  const kept = fakeClient([{ data: [{ id: 'p' }], error: null }]);
  assert.equal((await ws.saveProject(kept.client, 'owner', { ...base, publication_status: 'published' }, edit)).ok, true);
  assert.equal((await ws.saveProject(fakeClient([]).client, 'owner', base, { ...edit, publication_status: 'ready', stage: 'done' })).reason, 'invalid');
  assert.equal((await ws.saveProject(fakeClient([]).client, 'owner', base, { ...edit, publication_status: 'ready', title: '   ' })).reason, 'invalid');
  const ready = fakeClient([{ data: [{ id: 'p' }], error: null }]);
  await ws.saveProject(ready.client, 'owner', base, { ...edit, publication_status: 'ready', title: '  Robot   arm ' });
  assert.equal(ready.calls[0].payload.title, 'Robot arm');
  assert.deepEqual(ready.calls[0].filters, [['id', 'p'], ['user_id', 'owner'], ['version', 1]]);
});

test('archive and restore refuse a request that does not match the current state', async () => {
  const active = { id: 'p', version: 1, archived_at: null };
  assert.equal((await ws.setProjectArchived(fakeClient([]).client, 'owner', active, false)).reason, 'conflict');
  const archive = fakeClient([{ data: [{ id: 'p' }], error: null }]);
  assert.equal((await ws.setProjectArchived(archive.client, 'owner', active, true)).ok, true);
  assert.ok(archive.calls[0].payload.archived_at);
});

test('positionForMove places a dragged item between its new neighbours in one update', () => {
  const rows = [1, 2, 3, 4].map((p) => ({ id: `r${p}`, position: p }));
  assert.equal(ws.positionForMove(rows, 'r1', 2), 3.5);   // first -> after the third
  assert.equal(ws.positionForMove(rows, 'r4', 0), 0);     // last -> first
  assert.equal(ws.positionForMove(rows, 'r2', 3), 5);     // -> last
  assert.equal(ws.positionForMove(rows, 'r3', 1), 1.5);   // backwards by one
  assert.equal(ws.positionForMove(rows, 'r2', 1), null);  // same place
  assert.equal(ws.positionForMove(rows, 'nope', 1), null);
  assert.equal(ws.positionForMove([{ id: 'a', position: 0 }, { id: 'b', position: 0 }, { id: 'c', position: 0 }], 'c', 1), null); // ties
  assert.equal(ws.positionForMove([{ id: 'only', position: 5 }], 'only', 0), null);
});
