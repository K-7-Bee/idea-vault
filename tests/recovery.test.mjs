import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';

function load(mocks) {
  const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/recovery-operations.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (id) => mocks[id] ?? {} });
  return exports;
}

const file = { id: 'file', path: 'owner/idea/file', name: 'note.webm', mime_type: 'audio/webm', size: 10, created_at: '2026-11-15T00:00:00Z' };
const idea = { id: 'idea', content: 'original', tags: ['tag'], status: 'building', created_at: '2026-11-15T00:00:00Z', files: [file] };
const item = { id: 'idea', owner_id: 'owner', content: 'original', tags: ['tag'], created_at: idea.created_at, files: [] };

function harness() {
  const records = new Map();
  const events = [];
  const state = { idea: structuredClone(idea), failSave: false, failWrite: false, missingMatch: false, verified: true };
  const api = load({ './recovery': {
    getRecovery: async (id) => records.get(id),
    saveRecovery: async (record) => {
      events.push('preserve');
      if (state.failSave) throw new Error('storage full');
      records.set(record.id, structuredClone(record));
    },
  } });
  const verify = async () => { events.push('verify'); if (!state.verified) throw new Error('locked'); };
  const client = {
    storage: { from() { assert.fail('no file purge or download is allowed'); } },
    from(table) {
      let action = 'read', payload;
      const filters = [];
      const run = async () => {
        events.push(action);
        if (action === 'read') return { data: structuredClone(state.idea), error: null };
        if (state.failWrite) return { data: null, error: { message: 'failed' } };
        if (state.missingMatch) return { data: [], error: null };
        if (action === 'delete') {
          assert.ok(records.size > 0, 'recovery must be durable before deletion');
          if (table === 'ideas') state.idea = null;
          else state.idea.files = state.idea.files.filter((entry) => entry.id !== file.id);
        } else if (table === 'ideas') state.idea = { ...payload, files: [] };
        else state.idea.files.push(payload);
        return { data: [{ id: table === 'ideas' ? 'idea' : 'file' }], error: null };
      };
      const q = {
        eq(key, value) { filters.push([key, value]); return q; }, filter: () => q,
        select: () => q, maybeSingle: run, single: run,
        delete() { action = 'delete'; return q; }, insert(value) { action = 'insert'; payload = value; return q; },
        then(resolve, reject) { return run().then(resolve, reject); },
      };
      return q;
    },
  };
  return { api, client, verify, state, records, events };
}

test('file removal retains exact metadata and bytes, then restores with the original ID and timestamp', async () => {
  const h = harness();
  await h.api.retainDeletedFile(h.client, 'owner', 'idea', file, h.verify);
  assert.equal(h.state.idea.files.length, 0);
  const record = h.records.get('owner:file:file');
  assert.deepEqual(record.idea.files[0], file);
  await h.api.restoreRecovery(h.client, record, 'owner', h.verify);
  assert.equal(h.state.idea.files[0].id, 'file');
  assert.equal(h.state.idea.files[0].created_at, file.created_at);
  await h.api.restoreRecovery(h.client, record, 'owner', h.verify);
  assert.equal(h.state.idea.files.length, 1, 'retry must not duplicate attachments');
  assert.equal(h.records.size, 1, 'successful restore must retain recovery evidence');
});

test('failed recovery writes prevent deletion; failed database deletes leave both metadata and recovery intact', async () => {
  for (const failure of ['failSave', 'failWrite', 'missingMatch']) {
    const h = harness(); h.state[failure] = true;
    await assert.rejects(h.api.retainDeletedFile(h.client, 'owner', 'idea', file, h.verify));
    assert.equal(h.state.idea.files.length, 1);
    if (failure === 'failSave') assert.ok(!h.events.includes('delete'));
    else assert.equal(h.records.size, 1);
  }
});

test('idea deletion retry preserves the original snapshot and queued blobs after the database row is gone', async () => {
  const h = harness();
  const queued = { ...item, files: [{ id: 'pending', file: new File(['voice bytes'], 'voice.webm') }] };
  await h.api.retainDeletedIdea(h.client, queued, h.verify);
  const original = h.records.get('owner:idea:idea');
  assert.equal(h.state.idea, null);
  await h.api.retainDeletedIdea(h.client, queued, h.verify);
  const retained = h.records.get('owner:idea:idea');
  assert.deepEqual(retained.idea, original.idea);
  assert.equal(await retained.queued.files[0].file.text(), 'voice bytes');
  await h.api.restoreRecovery(h.client, retained, 'owner', h.verify);
  assert.equal(h.state.idea.status, 'building');
  assert.equal(h.state.idea.files[0].path, file.path);
});

test('restore denies wrong owners, foreign paths, missing parents and conflicting saved versions', async () => {
  for (const scenario of ['owner', 'path', 'missing-parent', 'idea-conflict', 'file-conflict', 'queued-owner']) {
    const h = harness();
    const record = { id: 'recovery', kind: 'file', owner_id: 'owner', idea: structuredClone(idea) };
    if (scenario === 'owner') record.owner_id = 'other';
    if (scenario === 'path') record.idea.files[0].path = 'other/idea/file';
    if (scenario === 'missing-parent') h.state.idea = null;
    if (scenario === 'idea-conflict') { record.kind = 'idea'; h.state.idea.content = 'newer version'; }
    if (scenario === 'file-conflict') h.state.idea.files[0].size = 999;
    if (scenario === 'queued-owner') record.queued = { ...item, owner_id: 'other' };
    await assert.rejects(h.api.restoreRecovery(h.client, record, 'owner', h.verify));
    assert.ok(!h.events.includes('insert'));
  }
});

test('session locking after recovery persistence prevents the next deletion request', async () => {
  const h = harness(); let reads = 0;
  await assert.rejects(h.api.retainDeletedFile(h.client, 'owner', 'idea', file, async () => {
    if (++reads > 1) throw new Error('locked');
  }), /locked/);
  assert.equal(h.records.size, 1);
  assert.ok(!h.events.includes('delete'));
});

test('a concurrent edit prevents deletion and automatic retries cannot delete that newer version', async () => {
  const h = harness(); h.state.missingMatch = true;
  await assert.rejects(h.api.retainDeletedIdea(h.client, item, h.verify), /changed before deletion/);
  h.state.missingMatch = false;
  h.state.idea.content = 'changed on another device';
  await assert.rejects(h.api.retainDeletedIdea(h.client, item, h.verify), /changed after removal/);
  assert.equal(h.state.idea.content, 'changed on another device');
});

test('offline recovery intents are enriched with authoritative attachment timestamps before deletion', async () => {
  const h = harness();
  h.records.set('attempt', { id: 'attempt', kind: 'idea', owner_id: 'owner', prepared: false,
    idea: { ...structuredClone(idea), files: [{ ...file, created_at: undefined }] }, queued: item });
  await h.api.retainDeletedIdea(h.client, { ...item, recovery_id: 'attempt' }, h.verify);
  assert.equal(h.records.get('attempt').prepared, true);
  assert.equal(h.records.get('attempt').idea.files[0].created_at, file.created_at);
  assert.equal(h.state.idea, null);
});

test('tag predicates escape PostgreSQL array punctuation, quotes and backslashes', () => {
  const h = harness();
  assert.equal(h.api.tagsFilter(['comma,tag', 'brace}', 'quote"', 'slash\\']), '{"comma,tag","brace}","quote\\\"","slash\\\\"}');
});

test('a recovery record saved before the stage rename (raw/done) can still finish an interrupted restore', async () => {
  for (const [legacy, stored] of [['raw', 'exploring'], ['done', 'completed']]) {
    const h = harness();
    // The idea row was restored already (the database translated its stage); one attachment is still missing.
    h.state.idea = { ...structuredClone(idea), status: stored, files: [] };
    const record = { id: 'idea', owner_id: 'owner', kind: 'idea', saved_at: idea.created_at, idea: { ...structuredClone(idea), status: legacy } };
    await h.api.restoreRecovery(h.client, record, 'owner', h.verify);
    assert.equal(h.state.idea.files.length, 1, `${legacy} record finishes the restore`);
  }
  assert.equal(load({}).currentStage('exploring'), 'exploring');
  // A genuinely different stage is still refused.
  const h = harness();
  h.state.idea = { ...structuredClone(idea), status: 'analyzing', files: [] };
  const record = { id: 'idea', owner_id: 'owner', kind: 'idea', saved_at: idea.created_at, idea: { ...structuredClone(idea), status: 'done' } };
  await assert.rejects(h.api.restoreRecovery(h.client, record, 'owner', h.verify), /different saved version/);
});
