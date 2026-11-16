import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';

function load(file, mocks = {}, extra = '', globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(import.meta.dirname, '..', file), 'utf8') + extra,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (id) => mocks[id] ?? {}, ...globals });
  return exports;
}

const tags = load('src/lib/tags.ts');
const detail = load('src/lib/idea-detail.ts', {
  './ideas': { STATUSES: ['raw', 'exploring', 'building', 'done'] },
  './recovery-operations': { tagsFilter: (t) => `{${t.map((x) => JSON.stringify(x)).join(',')}}` },
  './tags': tags,
});

const plain = (value) => JSON.parse(JSON.stringify(value));
const base = { id: 'idea', title: null, content: 'Original #one', status: 'raw', tags: ['one'], archived_at: null };

// Records the update payload and every filter, then answers like PostgREST.
function updateClient(answer) {
  const calls = { changes: null, filters: [], requests: 0 };
  const client = { from(table) {
    assert.equal(table, 'ideas');
    return { update(changes) {
      calls.requests++;
      calls.changes = changes;
      const q = {
        eq(c, v) { calls.filters.push(['eq', c, v]); return q; },
        is(c, v) { calls.filters.push(['is', c, v]); return q; },
        not(c, o, v) { calls.filters.push(['not', c, o, v]); return q; },
        filter(c, o, v) { calls.filters.push(['filter', c, o, v]); return q; },
        async select() { if (answer instanceof Error) throw answer; return answer; },
      };
      return q;
    } };
  } };
  return { client, calls };
}

test('saving applies only to the unchanged owner row and derives title and tags', async () => {
  const saved = { ...base, title: 'Clean title', content: 'New text #Two #two', status: 'building', tags: ['two'] };
  const { client, calls } = updateClient({ data: [saved], error: null });
  const result = await detail.saveIdea(client, 'owner', base, { title: '  Clean \n title ', content: 'New text #Two #two', status: 'building' });
  assert.equal(result.ok, true);
  assert.equal(result.idea.title, 'Clean title');
  assert.deepEqual(plain(calls.changes), { title: 'Clean title', content: 'New text #Two #two', tags: ['two'], status: 'building' });
  assert.deepEqual(calls.filters, [
    ['eq', 'id', 'idea'], ['eq', 'user_id', 'owner'], ['eq', 'content', 'Original #one'], ['eq', 'status', 'raw'],
    ['filter', 'tags', 'eq', '{"one"}'], ['is', 'title', null], ['is', 'archived_at', null],
  ]);
});

test('blank titles are stored as no title and titled bases match their title', async () => {
  const { client, calls } = updateClient({ data: [{ ...base }], error: null });
  await detail.saveIdea(client, 'owner', { ...base, title: 'Had one' }, { title: '   ', content: base.content, status: 'raw' });
  assert.equal(calls.changes.title, null);
  assert.ok(calls.filters.some((f) => f[0] === 'eq' && f[1] === 'title' && f[2] === 'Had one'));
  assert.equal(detail.normalizeTitle('x'.repeat(500)).length, detail.TITLE_MAX);
});

test('stale, deleted, failed and invalid saves never report success or leak backend details', async () => {
  for (const [answer, reason] of [
    [{ data: [], error: null }, 'conflict'],
    [{ data: null, error: null }, 'conflict'],
    [{ data: null, error: { message: 'private backend detail' } }, 'failed'],
    [new Error('private network detail'), 'failed'],
  ]) {
    const { client } = updateClient(answer);
    const result = await detail.saveIdea(client, 'owner', base, { title: '', content: 'x', status: 'raw' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, reason);
    assert.ok(!result.message.includes('private'));
  }
  const { client, calls } = updateClient({ data: [base], error: null });
  const invalid = await detail.saveIdea(client, 'owner', base, { title: '', content: 'x', status: 'shipped' });
  assert.equal(invalid.reason, 'invalid');
  assert.equal(calls.requests, 0);
});

test('archive and restore are reversible state changes that require the expected state', async () => {
  const archive = updateClient({ data: [{ ...base, archived_at: '2026-11-16T00:00:00Z' }], error: null });
  const archived = await detail.archiveIdea(archive.client, 'owner', base);
  assert.equal(archived.ok, true);
  assert.deepEqual(Object.keys(archive.calls.changes), ['archived_at']);
  assert.deepEqual(archive.calls.filters.at(-1), ['is', 'archived_at', null]);

  const restoreBase = { ...base, archived_at: '2026-11-16T00:00:00Z' };
  const restore = updateClient({ data: [{ ...base }], error: null });
  assert.equal((await detail.restoreIdea(restore.client, 'owner', restoreBase)).ok, true);
  assert.deepEqual(plain(restore.calls.changes), { archived_at: null });
  assert.deepEqual(restore.calls.filters.at(-1), ['not', 'archived_at', 'is', null]);

  // Archiving an archived idea, or restoring an active one, sends nothing.
  const noop = updateClient({ data: [base], error: null });
  assert.equal((await detail.archiveIdea(noop.client, 'owner', restoreBase)).reason, 'conflict');
  assert.equal((await detail.restoreIdea(noop.client, 'owner', base)).reason, 'conflict');
  assert.equal(noop.calls.requests, 0);
});

const ID = '33333333-3333-4333-8333-333333333333';
function detailPage(answer, identity = { data: { user: { id: 'owner', email: 'owner@example.test' } }, error: null }) {
  const calls = { queries: 0, filters: [], signed: 0 };
  const client = { auth: { getUser: async () => identity }, from(table) {
    assert.equal(table, 'ideas');
    calls.queries++;
    const q = {
      select() { return q; },
      eq(c, v) { calls.filters.push([c, v]); return q; },
      maybeSingle() { return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer); },
    };
    return q;
  } };
  class NotFound extends Error {}
  const jsx = (type, props) => ({ type, props });
  function IdeaView() {}
  const owner = load('src/lib/vault-owner.ts', {}, '', { process: { env: { ALLOWED_EMAIL: 'owner@example.test' } } });
  const { IdeaContent } = load('src/app/vault/ideas/[id]/page.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { notFound: () => { throw new NotFound(); } },
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/ideas': { IDEA_DETAIL_COLUMNS: 'detail', withFileUrls: async (_, rows) => { calls.signed++; return rows; } },
    '@/lib/vault-owner': owner,
    './idea-view': { default: IdeaView },
  }, '\nexport { IdeaContent };');
  return { render: IdeaContent, calls, NotFound, IdeaView };
}

test('detail page renders only the verified owner\'s row and signs its files', async () => {
  const row = { id: ID, content: 'Saved', files: [] };
  const page = detailPage({ data: row, error: null });
  const tree = await page.render({ id: ID });
  assert.equal(tree.type, page.IdeaView);
  assert.equal(tree.props.ownerId, 'owner');
  assert.equal(tree.props.initial, row);
  assert.deepEqual(page.calls.filters, [['id', ID], ['user_id', 'owner']]);
  assert.equal(page.calls.signed, 1);
});

test('detail page: malformed ids and missing or foreign rows are not found; failures never leak', async () => {
  const malformed = detailPage({ data: null, error: null });
  await assert.rejects(malformed.render({ id: 'not-a-uuid' }), malformed.NotFound);
  assert.equal(malformed.calls.queries, 0);

  const missing = detailPage({ data: null, error: null });
  await assert.rejects(missing.render({ id: ID }), missing.NotFound);

  for (const answer of [{ data: null, error: { message: 'private backend detail' } }, new Error('private network detail')]) {
    const failed = detailPage(answer);
    const tree = await failed.render({ id: ID });
    assert.equal(tree.type, 'section');
    assert.ok(!JSON.stringify(tree).includes('private'));
    assert.equal(failed.calls.signed, 0);
  }
});

test('detail page never queries for unverified, foreign or errored identities', async () => {
  for (const identity of [{ data: { user: null }, error: null },
    { data: { user: { id: 'other', email: 'other@example.test' } }, error: null },
    { data: { user: { id: 'owner', email: 'owner@example.test' } }, error: { message: 'expired' } }]) {
    const page = detailPage({ data: { id: ID }, error: null }, identity);
    const tree = await page.render({ id: ID });
    assert.equal(tree.props.role, 'alert');
    assert.equal(page.calls.queries, 0);
  }
});
