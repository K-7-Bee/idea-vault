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
  vm.runInNewContext(source, { exports, require: (id) => mocks[id] ?? {},
    navigator: { onLine: true }, ...globals });
  return exports;
}

function vaultReader(initial, pages) {
  let page = 0;
  let signingCalls = 0;
  const client = { from() {
    const query = {
      select() { return query; }, order() { return query; },
      limit: async () => initial,
      range: async () => {
        const result = pages[page++];
        if (result instanceof Error) throw result;
        return result;
      },
    };
    return query;
  } };
  const jsx = (type, props) => ({ type, props });
  function Capture() {}
  const { VaultContent } = load('src/app/vault/page.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/ideas': { IDEA_COLUMNS: 'ideas', PAGE_SIZE: 100,
      withFileUrls: async (_, rows) => { signingCalls++; return rows; } },
    './capture': { default: Capture },
  }, '\nexport { VaultContent };');
  return { render: VaultContent, Capture, signingCalls: () => signingCalls };
}

test('initial read failures show recovery without exposing backend errors or mounting capture', async () => {
  for (const initial of [{ data: null, error: { message: 'private backend detail' } },
    { data: [], error: { message: 'private backend detail' } }, { data: null, error: null }]) {
    const reader = vaultReader(initial, [{ data: [], error: null }]);
    const tree = await reader.render();
    assert.equal(tree.type, 'section');
    assert.equal(tree.props.children[0].props.role, 'alert');
    assert.equal(tree.props.children[1].props.href, '/vault');
    assert.ok(!JSON.stringify(tree).includes('private backend detail'));
    assert.equal(reader.signingCalls(), 0);
  }
});

test('failed or rejected index pages never render partial counts', async () => {
  const fullPage = Array.from({ length: 1000 }, (_, id) => ({ id, tags: [], status: 'raw', created_at: 'date' }));
  for (const pages of [
    [{ data: null, error: { message: 'failed' } }],
    [{ data: fullPage, error: null }, { data: null, error: { message: 'later page failed' } }],
    [new Error('network rejection')],
  ]) {
    const reader = vaultReader({ data: [], error: null }, pages);
    assert.equal((await reader.render()).type, 'section');
    assert.equal(reader.signingCalls(), 0);
  }
});

test('successful empty and populated reads retain capture data and complete metadata', async () => {
  for (const rows of [[], [{ id: 'idea', tags: ['tag'], status: 'raw', created_at: 'date' }]]) {
    const reader = vaultReader({ data: rows, error: null }, [{ data: rows, error: null }]);
    const tree = await reader.render();
    assert.equal(tree.type, reader.Capture);
    assert.equal(tree.props.initial, rows);
    assert.equal(tree.props.initialMeta.length, rows.length);
    assert.equal(reader.signingCalls(), 1);
  }
});

function deletionClient(storageError = null, databaseError = null) {
  const calls = [];
  return { calls, client: {
    from(table) {
      return {
        select() { return { eq: async () => ({ data: [{ path: 'saved/path' }], error: null }) }; },
        delete() { return { eq: async () => { calls.push(table); return { error: databaseError }; } }; },
      };
    },
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
    storage: { from() { return { remove: async (paths) => {
      calls.push(['storage', ...paths]); return { error: storageError };
    } }; } },
  } };
}
const item = { id: 'idea', files: [{ id: 'file', file: { name: 'note.webm' } }] };
const sync = load('src/lib/sync.ts', { './ideas': { BUCKET: 'attachments', safeFileName: (s) => s } });

test('storage failure preserves database metadata for a deletion retry', async () => {
  const { client, calls } = deletionClient({ message: 'Storage unavailable' });
  await assert.rejects(sync.deleteSavedIdea(client, item), /Storage unavailable/);
  assert.equal(calls.length, 1);
});

test('deletion cleans recorded files and partially uploaded queued files before deleting the idea', async () => {
  const { client, calls } = deletionClient();
  await sync.deleteSavedIdea(client, item);
  assert.equal(calls[0][0], 'storage');
  assert.ok(calls[0].includes('saved/path'));
  assert.ok(calls[0].includes('owner/idea/file-note.webm'));
  assert.equal(calls[1], 'ideas');
});

test('database deletion failure can be retried after storage has been removed', async () => {
  const failed = deletionClient(null, { message: 'Database unavailable' });
  await assert.rejects(sync.deleteSavedIdea(failed.client, item), /Database unavailable/);
  const retry = deletionClient();
  await sync.deleteSavedIdea(retry.client, item);
  assert.equal(retry.calls[1], 'ideas');
});

test('pagination uses a timestamp and ID cursor to include tied timestamps', () => {
  const { searchIdeas } = load('src/app/vault/capture.tsx', { '@/lib/ideas': { PAGE_SIZE: 100 } }, '\nexport { searchIdeas };');
  const calls = [];
  const query = new Proxy({}, { get: (_, name) => (...args) => { calls.push([name, ...args]); return query; } });
  searchIdeas({ from: () => query }, { term: '', tag: null, status: null,
    before: { created_at: '2026-11-14T00:00:00Z', id: 'cursor-id' } });
  assert.ok(calls.some(([name, column]) => name === 'order' && column === 'id'));
  assert.ok(calls.some(([name, filter]) => name === 'or' && filter.includes('created_at.eq.') && filter.includes('id.lt.cursor-id')));
});

test('repeated starts share one pending microphone request and release the stream on stop', async () => {
  let resolvePermission;
  let requests = 0;
  let stopped = 0;
  const instances = [];
  class Recorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; instances.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop(); }
  }
  const { useRecorder } = load('src/app/vault/use-recorder.ts', {
    react: { useState: (v) => [v, () => {}], useRef: (v) => ({ current: v }), useEffect: () => {} },
  }, '', { MediaRecorder: Recorder, navigator: { mediaDevices: { getUserMedia: () => {
    requests++; return new Promise((resolve) => { resolvePermission = resolve; });
  } } } });
  const recorder = useRecorder(() => {}, (message) => assert.fail(message));
  const pending = recorder.start();
  await recorder.start();
  assert.equal(requests, 1);
  resolvePermission({ getTracks: () => [{ stop: () => stopped++ }] });
  await pending;
  await recorder.start();
  assert.equal(instances.length, 1);
  recorder.stop();
  assert.equal(stopped, 1);
});
