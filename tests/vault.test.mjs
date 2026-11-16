import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';

function workerHarness(fetcher) {
  const handlers = {};
  const calls = [];
  const stores = new Map([['vault-pages-v1', new Map([['/vault', new Response('synthetic private secret')]])],
    ['unrelated-cache', new Map()]]);
  let claimed = false;
  const cacheApi = {
    async open(name) {
      calls.push(['open', name]);
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      const key = (request) => typeof request === 'string' ? request : request.url;
      return {
        async match(request) { calls.push(['match', name]); return store.get(key(request))?.clone(); },
        async put(request, response) { calls.push(['put', name]); store.set(key(request), response.clone()); },
      };
    },
    async match() { calls.push(['global-match']); return new Response('synthetic private secret'); },
    async keys() { calls.push(['keys']); return [...stores.keys()]; },
    async delete(name) { calls.push(['delete', name]); return stores.delete(name); },
  };
  vm.runInNewContext(fs.readFileSync(path.join(import.meta.dirname, '../public/sw.js'), 'utf8'), {
    self: { location: { origin: 'https://fixture.test' }, addEventListener: (name, fn) => { handlers[name] = fn; },
      skipWaiting: async () => {}, clients: { claim: async () => { claimed = true; } } },
    caches: cacheApi, fetch: fetcher, URL, Response,
    indexedDB: new Proxy({}, { get() { assert.fail('worker must preserve outboxes'); } }),
    localStorage: new Proxy({}, { get() { assert.fail('worker must preserve drafts'); } }),
  });
  return { calls, stores, claimed: () => claimed,
    dispatch(url, { method = 'GET', mode = 'navigate' } = {}) {
      const request = new Request(new URL(url, 'https://fixture.test'), { method });
      Object.defineProperty(request, 'mode', { value: mode });
      let response;
      handlers.fetch({ request, respondWith(value) { response = Promise.resolve(value); },
        waitUntil() { assert.fail('navigation must not schedule a cache write'); } });
      return response;
    },
    async activate() {
      let pending;
      handlers.activate({ waitUntil(value) { pending = value; } });
      await pending;
    },
  };
}

test('private worker navigations bypass caches for root, nested paths and query strings', async () => {
  for (const path of ['/vault', '/vault/', '/vault/ideas', '/vault?view=list', '/vault/ideas?q=test']) {
    for (const status of [200, 302, 401, 500]) {
      const expected = new Response(status === 200 ? 'fresh private response' : 'auth or error', { status });
      const worker = workerHarness(async (request, options) => {
        assert.equal(request.url, `https://fixture.test${path}`);
        assert.equal(options.cache, 'no-store');
        return expected;
      });
      assert.equal(await worker.dispatch(path), expected);
      assert.equal(worker.calls.length, 0);
    }
  }
});

test('offline private navigation never reads retained private HTML or deletes stored data', async () => {
  const worker = workerHarness(async () => { throw new Error('offline'); });
  for (const path of ['/vault', '/vault/', '/vault/ideas', '/vault?account=other']) {
    const response = await worker.dispatch(path);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-type'), /text\/plain/);
    const body = await response.text();
    assert.match(body, /Connect to the internet/);
    assert.ok(!body.includes('synthetic private secret'));
  }
  await worker.activate();
  assert.equal(worker.claimed(), true);
  assert.equal(worker.calls.length, 0);
  assert.equal(await worker.stores.get('vault-pages-v1').get('/vault').text(), 'synthetic private secret');
  assert.ok(worker.stores.has('unrelated-cache'));
});

test('delayed private navigation cannot recreate cached HTML after simulated logout cleanup', async () => {
  let complete;
  const worker = workerHarness(() => new Promise((resolve) => { complete = resolve; }));
  const pending = worker.dispatch('/vault');
  worker.stores.clear(); // Synthetic logout cleanup, never a real device cache.
  complete(new Response('late private response'));
  assert.equal(await (await pending).text(), 'late private response');
  assert.equal(worker.stores.size, 0);
  assert.equal(worker.calls.length, 0);
});

test('worker preserves public navigation and static caching without intercepting unrelated traffic', async () => {
  const fetched = [];
  const worker = workerHarness(async (request, options) => {
    fetched.push([request.url, options]);
    return new Response('network body');
  });
  for (const path of ['/', '/projects', '/login', '/vault-other']) {
    assert.equal(await (await worker.dispatch(path)).text(), 'network body');
    assert.equal(fetched.at(-1)[1], undefined);
  }
  assert.equal(worker.calls.length, 0);
  for (const path of ['/_next/static/app.js', '/pwa-icon/192', '/manifest.webmanifest']) {
    const before = fetched.length;
    assert.equal(await (await worker.dispatch(path, { mode: 'cors' })).text(), 'network body');
    assert.equal(await (await worker.dispatch(path, { mode: 'cors' })).text(), 'network body');
    assert.equal(fetched.length, before + 1);
  }
  assert.ok(worker.calls.filter(([name]) => name === 'put').every(([, name]) => name === 'vault-assets-v1'));
  const before = fetched.length;
  assert.equal(worker.dispatch('/vault', { method: 'POST' }), undefined);
  assert.equal(worker.dispatch('https://external.test/vault'), undefined);
  assert.equal(worker.dispatch('/vault', { mode: 'cors' }), undefined);
  assert.equal(fetched.length, before);
  const offline = workerHarness(async () => { throw new Error('offline'); });
  assert.equal((await offline.dispatch('/projects')).status, 503);
  assert.equal(offline.calls.length, 0);
});

function logoutHarness(signOut, globals = {}, coordination = load('src/app/vault/logout-coordination.ts')) {
  const hooks = [];
  let cursor = 0;
  const routes = [];
  let authCallback;
  const effects = [];
  const jsx = (type, props) => ({ type, props });
  const { default: LogoutButton } = load('src/app/vault/logout-button.tsx', {
    react: {
      useEffect(effect) { if (!authCallback) effects.push(effect); },
      useState(initial) {
        const index = cursor++;
        if (!(index in hooks)) hooks[index] = initial;
        return [hooks[index], (value) => { hooks[index] = value; }];
      },
      useRef(initial) {
        const index = cursor++;
        return hooks[index] ??= { current: initial };
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { useRouter: () => ({ replace: (route) => routes.push(route) }) },
    './logout-coordination': coordination,
    '@/lib/supabase/client': { createClient: () => ({ auth: { signOut,
      onAuthStateChange(fn) { authCallback = fn; return { data: { subscription: { unsubscribe() {} } } }; },
    } }) },
  }, '', {
    localStorage: new Proxy({}, { get() { assert.fail('logout must preserve drafts'); } }),
    indexedDB: new Proxy({}, { get() { assert.fail('logout must preserve outbox'); } }),
    ...globals,
  });
  return { routes, coordination, emit(session) { authCallback('SIGNED_IN', session); },
    render() { cursor = 0; const tree = LogoutButton(); for (const effect of effects.splice(0)) effect(); return tree; } };
}

test('logout errors announce generic recovery, preserve local work and allow successful retry', async () => {
  for (const rejects of [false, true]) {
    let calls = 0;
    const harness = logoutHarness(async () => {
      if (++calls > 1) return { error: null };
      if (rejects) throw new Error('private backend detail');
      return { error: { message: 'private backend detail' } };
    });
    await harness.render().props.children[0].props.onClick();
    const failed = harness.render();
    assert.equal(failed.props.children[0].props.disabled, false);
    assert.equal(failed.props.children[1].props.role, 'alert');
    assert.ok(!JSON.stringify(failed).includes('private backend detail'));
    assert.equal(harness.routes.length, 0);
    await failed.props.children[0].props.onClick();
    assert.deepEqual(harness.routes, []);
    assert.equal(harness.render().props.children[1], null);
    assert.match(JSON.stringify(harness.render()), /Signed out/);
    harness.emit({ user: { id: 'owner' } });
    assert.equal(harness.render().props.children[2], false);
  }
});

test('pending logout prevents duplicate requests and retains the mounted route after cache cleanup', async () => {
  let finish;
  let started;
  const signOutStarted = new Promise((resolve) => { started = resolve; });
  let calls = 0;
  const deleted = [];
  const harness = logoutHarness(() => {
    calls++;
    started();
    return new Promise((resolve) => { finish = resolve; });
  }, { caches: { keys: async () => ['vault-cache'], delete: async (key) => deleted.push(key) } });
  const click = harness.render().props.children[0].props.onClick;
  const pending = click();
  await click();
  await signOutStarted;
  assert.equal(harness.render().props.children[0].props.disabled, true);
  assert.equal(calls, 1);
  assert.deepEqual(deleted, ['vault-cache']);
  assert.equal(harness.routes.length, 0);
  finish({ error: null });
  await pending;
  assert.equal(calls, 1);
  assert.deepEqual(harness.routes, []);
  const link = treeNodes(harness.render()).find((node) => node.type === 'a');
  assert.equal(link.props.target, '_blank');
  assert.equal(link.props.rel, 'noopener noreferrer');
  assert.equal(harness.render().props.children[0].props.disabled, false);
});

test('cache cleanup rejection does not prevent successful logout', async () => {
  const harness = logoutHarness(async () => ({ error: null }), {
    caches: { keys: async () => { throw new Error('cache unavailable'); } },
  });
  await harness.render().props.children[0].props.onClick();
  assert.deepEqual(harness.routes, []);
});

function load(file, mocks = {}, extra = '', globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(import.meta.dirname, '..', file), 'utf8') + extra,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (id) => mocks[id] ?? {},
    navigator: { onLine: true }, ...globals });
  return exports;
}

test('attachment signing preserves every idea and file through returned and rejected failures', async () => {
  const { withFileUrls } = load('src/lib/ideas.ts');
  const files = [{ id: 'a', path: 'owner/a', name: 'note.webm', size: 20, mime_type: 'audio/webm' }];
  const original = [{ id: 'idea', content: 'Keep this', tags: ['tag'], status: 'raw', files }];
  for (const rejects of [false, true]) {
    let healthy = false;
    const client = { storage: { from: () => ({ createSignedUrls: async () => {
      if (healthy) return { data: [{ path: files[0].path, signedUrl: 'signed-url' }], error: null };
      if (rejects) throw new Error('private service detail');
      return { data: null, error: { message: 'private service detail' } };
    } }) } };
    const failed = await withFileUrls(client, original);
    assert.equal(failed[0].content, 'Keep this');
    assert.equal(failed[0].files.length, 1);
    assert.equal(failed[0].files[0].url, null);
    for (const key of Object.keys(files[0])) assert.equal(failed[0].files[0][key], files[0][key]);
    assert.ok(!JSON.stringify(failed).includes('private service detail'));
    healthy = true;
    assert.equal((await withFileUrls(client, failed))[0].files[0].url, 'signed-url');
    assert.equal('url' in files[0], false);
  }
});

test('partial signing maps links by path, retains failures and skips empty requests', async () => {
  const { signFiles } = load('src/lib/ideas.ts');
  const rows = ['a', 'b', 'c'].map((id) => ({ id, path: `owner/${id}`, name: id, size: 1, mime_type: null }));
  let calls = 0;
  const client = { storage: { from: () => ({ createSignedUrls: async (paths, seconds) => {
    calls++;
    assert.deepEqual(Array.from(paths), rows.map((row) => row.path));
    assert.equal(seconds, 3600);
    return { data: [
      { path: 'owner/b', signedUrl: 'url-b', error: null },
      { path: 'owner/a', signedUrl: 'invalid', error: 'denied' },
    ], error: null };
  } }) } };
  assert.equal((await signFiles(client, [])).length, 0);
  assert.equal(calls, 0);
  const signed = await signFiles(client, rows);
  assert.deepEqual(Array.from(signed, (file) => file.url), [null, 'url-b', null]);
  assert.deepEqual(Array.from(signed, (file) => file.id), ['a', 'b', 'c']);
  assert.equal(calls, 1);
});

function vaultReader(initial, pages, identity = { data: { user: { id: 'owner', email: 'owner@example.test' } }, error: null }) {
  let page = 0;
  let signingCalls = 0;
  const filters = [];
  const client = { auth: { getUser: async () => { if (identity instanceof Error) throw identity; return identity; } }, from() {
    const query = {
      select() { return query; }, order() { return query; },
      is(column, value) { filters.push([column, value]); return query; },
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
  function Dashboard() {}
  const { VaultContent } = load('src/app/vault/page.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/ideas': { IDEA_COLUMNS: 'ideas', PAGE_SIZE: 100,
      withFileUrls: async (_, rows) => { signingCalls++; return rows; } },
    './capture': { default: Capture },
    './dashboard': { default: Dashboard },
    '@/lib/vault-stats': { vaultStats: (rows) => ({ total: rows.length }) },
  },'\nexport { VaultContent };', { process: { env: { ALLOWED_EMAIL: 'owner@example.test' } } });
  return { render: VaultContent, Capture, Dashboard, signingCalls: () => signingCalls, filters };
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
    const overview = tree.props.children;
    assert.equal(overview.type, reader.Dashboard);
    assert.equal(overview.props.stats.total, rows.length);
    assert.equal(tree.type, reader.Capture);
    assert.equal(tree.props.initial, rows);
    assert.equal(tree.props.ownerId, 'owner');
    assert.equal(tree.props.initialMeta.length, rows.length);
    assert.equal(reader.signingCalls(), 1);
    // Both the visible page and the counting index exclude archived ideas.
    assert.deepEqual(reader.filters, [['archived_at', null], ['archived_at', null]]);
  }
});

function deletionClient(recoveryError = null, databaseError = null) {
  const calls = [];
  const records = new Map();
  const idea = { id: 'idea', content: 'saved', tags: [], status: 'building', created_at: '2026-11-15T00:00:00Z',
    files: [{ id: 'file', path: 'owner/idea/saved', name: 'note.webm', mime_type: 'audio/webm', size: 2 }] };
  const operations = load('src/lib/recovery-operations.ts', { './recovery': {
    getRecovery: async (id) => records.get(id),
    saveRecovery: async (record) => { if (recoveryError) throw new Error(recoveryError.message); calls.push('recovery'); records.set(record.id, structuredClone(record)); },
  } });
  const client = {
    from(table) {
      let deleting = false;
      const query = {
        eq() { return query; }, filter() { return query; },
        select() { if (deleting) { calls.push(table); return Promise.resolve({ data: [{ id: 'idea' }], error: databaseError }); } return query; },
        maybeSingle: async () => ({ data: idea, error: null }),
        delete() { deleting = true; return query; },
      };
      return query;
    },
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
    storage: { from() { assert.fail('deletion must retain all stored bytes'); } },
  };
  const sync = load('src/lib/sync.ts', { './recovery-operations': operations });
  return { client, calls, records, idea, operations, sync };
}
const item = { id: 'idea', owner_id: 'owner', files: [{ id: 'file', file: { name: 'note.webm' } }] };
const sync = load('src/lib/sync.ts', { './ideas': { BUCKET: 'attachments', safeFileName: (s) => s } });

test('unverified page identities never mount capture or query ideas', async () => {
  for (const identity of [new Error('offline'), { data: { user: null }, error: null },
    { data: { user: { id: 'other', email: 'other@example.test' } }, error: null },
    { data: { user: { id: 'owner', email: 'owner@example.test' } }, error: { message: 'expired' } }]) {
    const reader = vaultReader(null, [], identity);
    const tree = await reader.render();
    assert.equal(tree.props.role, 'alert');
    assert.equal(reader.signingCalls(), 0);
  }
});

test('queue selection preserves foreign and legacy blobs and tombstones without inferring ownership', () => {
  const { ownedQueue } = load('src/lib/outbox.ts');
  const file = new Blob(['voice-note']);
  const rows = [
    { id: 'legacy', files: [{ file }], deleted: true },
    { id: 'foreign', owner_id: 'other', files: [{ file }] },
    { id: 'mine', owner_id: 'owner', files: [{ file }] },
    { id: 'delete', owner_id: 'owner', files: [], deleted: true },
  ];
  assert.deepEqual(Array.from(ownedQueue(rows, 'owner'), (row) => row.id), ['mine', 'delete']);
  assert.equal(ownedQueue(rows, '').length, 0);
  assert.equal(rows[0].owner_id, undefined);
  assert.equal(rows[0].deleted, true);
  assert.equal(rows[0].files[0].file, file);
  assert.equal(rows.length, 4);
});

test('offline capture binds new records while legacy captures and tombstones stay hidden and untouched', async () => {
  const hooks = [];
  let cursor = 0;
  const effects = [];
  const queued = [
    { id: 'legacy', content: 'private legacy text', tags: ['private-legacy-tag'], files: [], created_at: 'date' },
    { id: 'foreign', owner_id: 'other', deleted: true, tags: [], files: [], created_at: 'date' },
  ];
  const original = JSON.stringify(queued);
  const added = [];
  const jsx = (type, props) => ({ type, props });
  const storage = new Map([
    ['vault-draft', 'preserve legacy draft'],
    ['vault-draft:owner', 'new offline capture'],
    ['vault-draft:other', 'other account draft'],
    ['vault-view', 'list'],
  ]);
  const storageCalls = [];
  const localValues = load('src/app/vault/use-local-value.ts', { react: {
    useCallback: (callback) => callback,
    useSyncExternalStore: (_, snapshot) => snapshot(),
  } }, '', { localStorage: {
    getItem(key) { storageCalls.push(['get', key]); return storage.get(key) ?? null; },
    setItem(key, value) { storageCalls.push(['set', key]); storage.set(key, value); },
    removeItem(key) { storageCalls.push(['remove', key]); storage.delete(key); },
  } });
  const outbox = load('src/lib/outbox.ts');
  const { default: Capture } = load('src/app/vault/capture.tsx', {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
        return [hooks[index], (value) => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
      },
      useRef(initial) { const index = cursor++; return hooks[index] ??= { current: initial }; },
      useEffect(effect, deps) { effects.push({ effect, deps }); },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/outbox': { ...outbox, listQueued: async () => queued,
      addQueued: async (record) => { added.push(record); queued.push(record); },
      removeQueued() { assert.fail('paused/offline work must remain queued'); } },
    '@/lib/supabase/client': { createClient: () => ({}) },
    '@/lib/sync': { NetworkError: class extends Error {}, QueueOwnerError: class extends Error {},
      pushIdea: async () => { throw new Error('offline'); } },
    '@/lib/tags': { extractTags: () => [], splitTags: (text) => [{ text }] },
    './use-local-value': localValues,
    '@/lib/recovery': { listRecovery: async () => [] },
    './use-online': { useOnline: () => false },
    './use-recorder': { useRecorder: () => ({ suspend() {}, resume() {} }) },
    './use-session-gate': { useSessionGate: () => ({ locked: false, gate: { allowed: () => true, ticket: () => 0, valid: () => true } }) },
    './fonts': { serif: { className: '' } },
    './sparks': { PROMPTS: ['prompt'], CHEERS: ['saved'] },
    './status': { STATUS_INFO: {}, STATUS_COLOR: {} },
    '@/lib/ideas': { STATUSES: [], PAGE_SIZE: 100 },
  }, '', { crypto: { randomUUID: () => 'new-id' }, setTimeout: () => 1, clearTimeout() {} });
  const render = (ownerId = 'owner') => { cursor = 0; return Capture({ ownerId, initial: [], initialTags: [], initialMeta: [] }); };
  function nodes(tree) {
    if (!tree || typeof tree !== 'object') return [];
    return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
  }
  render();
  for (const { effect, deps } of effects) {
    if (!deps || deps[0] === 'owner') effect();
  }
  await new Promise((resolve) => setImmediate(resolve));
  let tree = render();
  assert.ok(JSON.stringify(tree).includes('paused pending ownership review'));
  assert.ok(!JSON.stringify(tree).includes('private legacy text'));
  assert.ok(!JSON.stringify(tree).includes('private-legacy-tag'));
  assert.equal(JSON.stringify(queued), original);
  const composer = (tree) => nodes(tree).find((node) => node.props?.['aria-label'] === 'New idea');
  assert.equal(composer(tree).props.value, 'new offline capture');
  // Remount each owner and exercise the real local-value hook with synthetic storage.
  hooks.length = 0;
  let otherTree = render('other');
  assert.equal(composer(otherTree).props.value, 'other account draft');
  composer(otherTree).props.onChange({ target: { value: 'updated other draft' } });
  hooks.length = 0;
  tree = render();
  assert.equal(composer(tree).props.value, 'new offline capture');
  await nodes(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(added.length, 1);
  assert.equal(added[0].owner_id, 'owner');
  assert.equal(added[0].content, 'new offline capture');
  assert.equal(JSON.stringify(queued.slice(0, 2)), original);
  tree = render();
  assert.ok(!JSON.stringify(tree).includes('private legacy text'));
  assert.equal(composer(tree).props.value, '');
  assert.equal(storage.has('vault-draft:owner'), false);
  assert.equal(storage.get('vault-draft:other'), 'updated other draft');
  assert.equal(storage.get('vault-draft'), 'preserve legacy draft');
  assert.equal(storage.get('vault-view'), 'list');
  assert.equal(storageCalls.some(([, key]) => key === 'vault-draft'), false);
  hooks.length = 0;
  otherTree = render('other');
  assert.equal(composer(otherTree).props.value, 'updated other draft');
});

test('blocked draft storage retains independent owner values in memory and preserves view preferences', () => {
  const { useLocalValue } = load('src/app/vault/use-local-value.ts', { react: {
    useCallback: (callback) => callback,
    useSyncExternalStore: (_, snapshot) => snapshot(),
  } }, '', { localStorage: {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  } });
  const useDraft = (owner) => useLocalValue(`vault-draft:${owner}`, '');
  useDraft('a')[1]('A draft');
  useDraft('b')[1]('B draft');
  useLocalValue('vault-view', 'list')[1]('grid');
  assert.equal(useDraft('a')[0], 'A draft');
  assert.equal(useDraft('b')[0], 'B draft');
  useDraft('a')[1]('');
  assert.equal(useDraft('a')[0], '');
  assert.equal(useDraft('b')[0], 'B draft');
  assert.equal(useLocalValue('vault-view', 'list')[0], 'grid');
});

test('sync rejects unbound, foreign, missing, expired and rejected identities before any data access', async () => {
  for (const operation of [sync.pushIdea, sync.deleteSavedIdea]) {
    for (const mode of ['legacy', 'foreign', 'missing', 'expired', 'rejected']) {
      const queued = { ...item, owner_id: mode === 'legacy' ? undefined : 'owner' };
      const client = {
        from() { assert.fail('blocked queue must not access database'); },
        storage: { from() { assert.fail('blocked queue must not access Storage'); } },
        auth: { getUser: async () => {
          if (mode === 'rejected') throw new Error('private');
          return { data: { user: mode === 'missing' ? null : { id: mode === 'foreign' ? 'other' : 'owner' } },
            error: mode === 'expired' ? { message: 'expired' } : null };
        } },
      };
      await assert.rejects(operation(client, queued), (error) => error instanceof sync.QueueOwnerError);
      assert.equal(queued.files, item.files);
    }
  }
});

function pushClient(switchAt = Infinity) {
  let checks = 0;
  const writes = [];
  return { writes, client: {
    auth: { getUser: async () => ({ data: { user: { id: ++checks >= switchAt ? 'other' : 'owner' } }, error: null }) },
    from(table) {
      return {
        insert: async (row) => { writes.push([table, row]); return { error: null }; },
        select() { return { eq() { return { single: async () => ({ data: { id: 'idea', files: [] }, error: null }) }; } }; },
      };
    },
    storage: { from() { return { upload: async (path) => { writes.push(['upload', path]); return { error: null }; } }; } },
  } };
}

test('matching captures use bound owner for rows and paths; account changes stop the next mutation', async () => {
  const { pushIdea, QueueOwnerError } = load('src/lib/sync.ts', { './ideas': {
    BUCKET: 'attachments', safeFileName: (s) => s, withFileUrls: async (_, rows) => rows,
  } });
  const healthy = pushClient();
  const result = await pushIdea(healthy.client, item);
  assert.equal(result.failures.length, 0);
  assert.equal(healthy.writes[0][1].user_id, 'owner');
  assert.equal(healthy.writes[1][1], 'owner/idea/file-note.webm');
  assert.equal(healthy.writes[2][1].user_id, 'owner');
  for (const [switchAt, expected] of [[2, ['ideas']], [3, ['ideas', 'upload']]]) {
    const changed = pushClient(switchAt);
    await assert.rejects(pushIdea(changed.client, item), (error) => error instanceof QueueOwnerError);
    assert.deepEqual(changed.writes.map(([name]) => name), expected);
  }
});

test('account change during deletion retains database metadata and refuses the next mutation', async () => {
  const { client, calls, sync } = deletionClient();
  let checks = 0;
  client.auth.getUser = async () => ({ data: { user: { id: ++checks >= 3 ? 'other' : 'owner' } }, error: null });
  await assert.rejects(sync.deleteSavedIdea(client, item), (error) => error instanceof sync.QueueOwnerError);
  assert.equal(calls.length, 0);
});

test('recovery storage failure prevents database deletion and preserves stored bytes', async () => {
  const { client, calls, sync } = deletionClient({ message: 'Recovery unavailable' });
  await assert.rejects(sync.deleteSavedIdea(client, item), /Recovery unavailable/);
  assert.equal(calls.length, 0);
});

test('deletion preserves metadata and queued files before removing the idea, without purging bytes', async () => {
  const { client, calls, records, sync } = deletionClient();
  await sync.deleteSavedIdea(client, item);
  assert.deepEqual(calls, ['recovery', 'ideas']);
  const record = records.get('owner:idea:idea');
  assert.equal(record.idea.files[0].path, 'owner/idea/saved');
  assert.equal(record.queued.files[0].file.name, 'note.webm');
  assert.equal(record.idea.status, 'building');
});

test('database deletion failure retains recovery metadata and all stored bytes', async () => {
  const failed = deletionClient(null, { message: 'Database unavailable' });
  await assert.rejects(failed.sync.deleteSavedIdea(failed.client, item), /Recovery could not finish/);
  assert.equal(failed.records.size, 1);
  const retry = deletionClient();
  await retry.sync.deleteSavedIdea(retry.client, item);
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

test('search and pagination reads recover from failed requests without exposing backend details', async () => {
  const { searchIdeas } = load('src/app/vault/capture.tsx', {
    '@/lib/ideas': { PAGE_SIZE: 100 },
  }, '\nexport { searchIdeas };');
  const filters = { term: '', tag: null, status: null };
  function client(read) {
    const query = new Proxy({}, { get: (_, name) => name === 'then'
      ? (resolve, reject) => Promise.resolve().then(read).then(resolve, reject)
      : () => query });
    return { from: () => query };
  }
  for (const read of [
    () => ({ data: null, error: { message: 'private backend details' } }),
    () => { throw new Error('private backend details'); },
    () => ({ data: null, error: null }),
  ]) {
    for (const options of [filters, { ...filters, before: { id: 'cursor', created_at: 'date' } }]) {
      const result = await searchIdeas(client(read), options);
      assert.equal(result.data, null);
      assert.match(result.error.message, /try again/i);
      assert.ok(!JSON.stringify(result).includes('private backend details'));
    }
  }
  let failed = true;
  const rows = [{ id: 'saved-idea', content: 'preserved' }];
  const retryClient = client(() => failed
    ? { data: null, error: { message: 'failed' } }
    : { data: rows, error: null });
  assert.ok((await searchIdeas(retryClient, filters)).error);
  failed = false;
  assert.equal((await searchIdeas(retryClient, filters)).data, rows);
  assert.equal((await searchIdeas(client(() => ({ data: [], error: null })), filters)).error, null);
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

function sessionHarness(coordination = load('src/app/vault/logout-coordination.ts')) {
  const hooks = [];
  const effects = [];
  let cursor = 0;
  let callback;
  let unsubscribed = false;
  let inCallback = false;
  let reads = 0;
  let getUser = async () => ({ data: { user: { id: 'owner' } }, error: null });
  const timers = new Map();
  let nextTimer = 0;
  const listeners = new Map();
  const events = {
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  const navigator = { onLine: true };
  const document = { ...events, visibilityState: 'visible' };
  const changes = [];
  const sessionModule = load('src/app/vault/use-session-gate.ts', {
    './logout-coordination': coordination,
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
        return [hooks[index], (value) => { hooks[index] = value; }];
      },
      useRef(initial) { const index = cursor++; return hooks[index] ??= { current: initial }; },
      useEffect(effect, deps) {
        const index = cursor++;
        const previous = hooks[index];
        if (!deps || !previous || deps.some((value, i) => value !== previous[i])) effects.push(effect);
        hooks[index] = deps;
      },
    },
    '@/lib/supabase/client': { createClient: () => ({ auth: {
      onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
      getUser() { assert.equal(inCallback, false, 'verification must run outside auth callback'); reads++; return getUser(); },
    } }) },
  }, '', { window: events, document, navigator,
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const cleanups = [];
  const render = () => {
    cursor = 0;
    const result = sessionModule.useSessionGate('owner', (value) => changes.push(value));
    for (const effect of effects.splice(0)) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
    return result;
  };
  return { ...sessionModule, coordination, changes, navigator, document, listeners, render,
    reads: () => reads, unsubscribed: () => unsubscribed,
    identity(fn) { getUser = fn; },
    emit(event, owner = 'owner') {
      inCallback = true;
      try { callback(event, owner === null ? null : { user: { id: owner } }); } finally { inCallback = false; }
    },
    async flush() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } await new Promise((resolve) => setImmediate(resolve)); },
    cleanup() { for (const cleanup of cleanups) cleanup(); },
  };
}

test('session signals lock synchronously, verify outside callbacks and invalidate old operations after unlock', async () => {
  const h = sessionHarness();
  const { gate } = h.render();
  const ticket = gate.ticket();
  h.emit('SIGNED_OUT', null);
  assert.equal(gate.allowed(), false);
  assert.equal(h.reads(), 0);
  assert.equal(h.render().locked, true);
  h.emit('SIGNED_IN', 'other');
  await h.flush();
  assert.equal(gate.allowed(), false);
  h.emit('SIGNED_IN');
  assert.equal(h.reads(), 0);
  await h.flush();
  assert.equal(gate.allowed(), true);
  assert.equal(gate.valid(ticket), false);
  assert.equal(h.render().locked, false);
  const currentTicket = gate.ticket();
  h.cleanup();
  assert.equal(gate.allowed(), false);
  assert.equal(gate.valid(currentTicket), false);
  assert.equal(h.unsubscribed(), true);
  assert.equal(h.listeners.size, 0);
});

test('logout locks before cache work, blocks stale verification and stays locked after success or failure', async () => {
  for (const fail of [false, true]) {
    const session = sessionHarness();
    const { gate } = session.render();
    let stale;
    session.identity(() => new Promise((resolve) => { stale = resolve; }));
    session.emit('TOKEN_REFRESHED');
    await session.flush();
    let finish;
    const button = logoutHarness(() => new Promise((resolve) => { finish = resolve; }), {
      caches: { async keys() { assert.equal(gate.allowed(), false); return []; } },
    }, session.coordination);
    const operation = button.render().props.children[0].props.onClick();
    assert.equal(gate.allowed(), false);
    assert.equal(session.coordination.beginLogout(), null);
    stale({ data: { user: { id: 'owner' } }, error: null });
    session.emit('SIGNED_IN');
    session.render().retry();
    await session.flush();
    assert.equal(gate.allowed(), false);
    assert.equal(session.reads(), 1);
    finish({ error: fail ? { message: 'failure' } : null });
    await operation;
    assert.equal(gate.allowed(), false);
    session.identity(async () => ({ data: { user: { id: 'owner' } } }));
    session.render().retry();
    await session.flush();
    assert.equal(gate.allowed(), true);
    assert.equal(button.routes.length, 0);
    session.cleanup();
  }
});

test('stale verification, rejected identity and foreign identity cannot unlock retained workspace', async () => {
  const h = sessionHarness();
  const { gate } = h.render();
  let complete;
  h.identity(() => new Promise((resolve) => { complete = resolve; }));
  h.emit('TOKEN_REFRESHED');
  await h.flush();
  h.emit('SIGNED_OUT', null);
  complete({ data: { user: { id: 'owner' } }, error: null });
  await h.flush();
  assert.equal(gate.allowed(), false);
  for (const result of [null, 'other', 'error', 'reject']) {
    h.identity(async () => {
      if (result === 'reject') throw new Error('private backend detail');
      return { data: { user: result === null ? null : { id: result } }, error: result === 'error' ? {} : null };
    });
    h.render().retry();
    await h.flush();
    assert.equal(gate.allowed(), false);
  }
  h.identity(async () => ({ data: { user: { id: 'owner' } }, error: null }));
  h.render().retry();
  await h.flush();
  assert.equal(gate.allowed(), true);
  // A later queued verification also invalidates an earlier still-pending result.
  h.identity(() => new Promise((resolve) => { complete = resolve; }));
  h.emit('TOKEN_REFRESHED');
  await h.flush();
  h.emit('TOKEN_REFRESHED');
  complete({ data: { user: { id: 'owner' } }, error: null });
  await Promise.resolve();
  assert.equal(gate.allowed(), false);
  h.cleanup();
});

test('offline open capture stays available until an explicit signal; resume events require verification', async () => {
  const h = sessionHarness();
  const { gate } = h.render();
  h.navigator.onLine = false;
  h.emit('INITIAL_SESSION');
  h.listeners.get('visibilitychange')();
  await h.flush();
  assert.equal(gate.allowed(), true);
  assert.equal(h.reads(), 0);
  h.emit('SIGNED_OUT', null);
  h.emit('SIGNED_IN');
  await h.flush();
  assert.equal(gate.allowed(), false);
  h.render().retry();
  await h.flush();
  assert.equal(gate.allowed(), false);
  assert.equal(h.reads(), 0);
  h.navigator.onLine = true;
  for (const event of ['online', 'visibilitychange', 'pageshow']) {
    h.listeners.get(event)({ persisted: true });
    assert.equal(gate.allowed(), false);
    await h.flush();
    assert.equal(gate.allowed(), true);
  }
  h.render().retry();
  h.cleanup();
  await h.flush();
  assert.equal(gate.allowed(), false);
});

test('locking a recording retains bytes and invalidates late microphone permission even after resume', async () => {
  for (const late of [false, true]) {
    let permission;
    let stopped = 0;
    const instances = [];
    const files = [];
    class Recorder {
      static isTypeSupported() { return true; }
      constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; instances.push(this); }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable({ data: new Blob(['retained audio']) });
        this.onstop();
      }
    }
    const { useRecorder: createRecorder } = load('src/app/vault/use-recorder.ts', {
      react: { useState: (value) => [value, () => {}], useRef: (value) => ({ current: value }), useEffect() {} },
    }, '', { Blob, File, MediaRecorder: Recorder,
      navigator: { mediaDevices: { getUserMedia: () => new Promise((resolve) => { permission = resolve; }) } } });
    const recorder = createRecorder((file) => files.push(file), (error) => assert.fail(error));
    const starting = recorder.start();
    const stream = { getTracks: () => [{ stop: () => stopped++ }] };
    if (late) {
      recorder.suspend();
      recorder.resume();
      permission(stream);
      await starting;
      assert.equal(instances.length, 0);
      assert.equal(files.length, 0);
    } else {
      permission(stream);
      await starting;
      recorder.suspend();
      assert.equal(files.length, 1);
      assert.equal(await files[0].text(), 'retained audio');
      await recorder.start();
      assert.equal(instances.length, 1);
    }
    assert.equal(stopped, 1);
  }
});

test('session lock stops replay between upload and metadata and before idea deletion', async () => {
  const { pushIdea, QueueOwnerError } = load('src/lib/sync.ts', { './ideas': {
    BUCKET: 'attachments', safeFileName: (value) => value, withFileUrls: async (_, rows) => rows,
  } });
  let active = true;
  const pushed = pushClient();
  pushed.client.storage.from = () => ({ upload: async () => { active = false; return { error: null }; } });
  await assert.rejects(pushIdea(pushed.client, item, () => active), (error) => error instanceof QueueOwnerError);
  assert.deepEqual(pushed.writes.map(([table]) => table), ['ideas']);
  active = true;
  const deleted = deletionClient();
  let checks = 0;
  deleted.client.auth.getUser = async () => { if (++checks === 4) active = false; return { data: { user: { id: 'owner' } } }; };
  await assert.rejects(deleted.sync.deleteSavedIdea(deleted.client, item, () => active), (error) => error instanceof deleted.sync.QueueOwnerError);
  assert.deepEqual(deleted.calls, ['recovery']);
});

const treeNodes = (tree) => !tree || typeof tree !== 'object' ? []
  : [tree, ...[tree.props?.children].flat(Infinity).flatMap(treeNodes)];

function mountedCapture(client, overrides = {}) {
  const hooks = [];
  const effects = [];
  const timers = new Map();
  let timerId = 0;
  let cursor = 0;
  let mediaPaused = 0;
  let recordingPaused = 0;
  const { createSessionGate } = load('src/app/vault/use-session-gate.ts');
  const gate = createSessionGate(() => {});
  const outbox = load('src/lib/outbox.ts');
  const jsx = (type, props) => ({ type, props });
  const idea = { id: 'idea', content: 'original private text', tags: [], status: 'raw',
    created_at: '2026-11-15T00:00:00Z', files: [{ id: 'file', path: 'owner/idea/file', name: 'file.txt', size: 2, url: null }] };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], (value) => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return hooks[index] ??= { current: initial }; },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = hooks[index];
      if (!deps || !previous || deps.some((value, i) => value !== previous[i])) effects.push(effect);
      hooks[index] = deps;
    },
  };
  const defaultSync = { NetworkError: class extends Error {}, QueueOwnerError: class extends Error {}, pushIdea: async () => { throw new Error('offline'); } };
  const navigator = { onLine: true };
  const { default: Capture } = load('src/app/vault/capture.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/supabase/client': { createClient: () => client },
    '@/lib/sync': defaultSync,
    '@/lib/recovery': { listRecovery: async () => [] },
    '@/lib/recovery-operations': load('src/lib/recovery-operations.ts'),
    '@/lib/outbox': { ...outbox, listQueued: async () => [], addQueued() { assert.fail('unexpected queue write'); }, removeQueued() { assert.fail('unexpected queue removal'); } },
    '@/lib/tags': { extractTags: () => [], splitTags: (text) => [{ text }] },
    './use-session-gate': { useSessionGate(_, callback) { gate.listen(callback); return { gate, locked: !gate.allowed(), retry() {} }; } },
    './use-local-value': { useLocalValue: (key) => react.useState(key === 'vault-view' ? 'list' : 'retained draft') },
    './use-online': { useOnline: () => true },
    './use-recorder': { useRecorder: () => ({ suspend() { recordingPaused++; }, resume() {} }) },
    './fonts': { serif: { className: '' } }, './sparks': { PROMPTS: ['prompt'], CHEERS: ['saved'] },
    './status': { STATUS_INFO: { raw: { label: 'Raw' } }, STATUS_COLOR: {} },
    '@/lib/ideas': { STATUSES: ['raw', 'done'], PAGE_SIZE: 1, MAX_FILE_BYTES: 100, formatSize: String, safeFileName: (value) => value,
      signFiles: async (_, rows) => rows, withFileUrls: async (_, rows) => rows },
    ...overrides,
  }, '', {
    navigator,
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    setInterval: () => 1, clearInterval() {}, confirm: () => true, crypto: { randomUUID: () => 'synthetic-id' },
    window: { addEventListener() {}, removeEventListener() {} },
    document: { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible', querySelectorAll: () => [] },
  });
  const dom = { hidden: false, inert: false, style: {}, querySelectorAll: () => [{ pause() { mediaPaused++; } }] };
  const render = () => {
    cursor = 0;
    const tree = Capture({ ownerId: 'owner', initial: [idea], initialTags: [[]], initialMeta: [idea],
      children: jsx('section', { 'data-test': 'private-dashboard', children: 'private statistics' }) });
    treeNodes(tree).find((node) => node.props?.inert !== undefined).props.ref.current = dom;
    for (const effect of effects.splice(0)) effect();
    return tree;
  };
  const find = (predicate) => treeNodes(render()).find(predicate);
  return { gate, render, dom, timers, find, idea, navigator, mediaPaused: () => mediaPaused, recordingPaused: () => recordingPaused,
    label: (label) => find((node) => node.props?.['aria-label'] === label),
    button: (text) => find((node) => node.type === 'button' && node.props.children === text),
  };
}

test('mounted lock hides media and retains draft, pending files and edit text through same-owner unlock', async () => {
  const h = mountedCapture({});
  h.render();
  h.label('Edit').props.onClick();
  h.label('Edit idea').props.onChange({ target: { value: 'unsaved edit buffer' } });
  const input = h.find((node) => node.type === 'input' && node.props.type === 'file' && node.props.onChange);
  const file = new File(['pending bytes'], 'pending.txt');
  input.props.onChange({ target: { files: [file] } });
  h.gate.lock();
  assert.equal(h.dom.hidden, true);
  assert.equal(h.dom.inert, true);
  assert.equal(h.dom.style.display, 'none');
  assert.ok(h.mediaPaused() > 0);
  assert.ok(h.recordingPaused() > 0);
  assert.ok(treeNodes(h.render()).some((node) => node.props?.role === 'alert'));
  const boundary = h.find((node) => node.props?.inert !== undefined);
  assert.equal(boundary.props.hidden, true);
  assert.equal(boundary.props.inert, true);
  assert.equal(boundary.props.style.display, 'none');
  assert.ok(treeNodes(boundary).some((node) => node.props?.['data-test'] === 'private-dashboard'));
  // Even saved event handlers are blocked, independently of the hidden DOM.
  await h.find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  h.gate.unlock();
  assert.equal(h.dom.hidden, false);
  assert.equal(h.dom.inert, false);
  assert.equal(h.label('New idea').props.value, 'retained draft');
  assert.equal(h.label('Edit idea').props.value, 'unsaved edit buffer');
  assert.ok(JSON.stringify(h.render()).includes('pending.txt'));
});

test('missing identity in a direct mutation locks before writes, and replay identity failures also lock', async () => {
  const h = mountedCapture({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from() { assert.fail('unverified direct edit must not write'); },
  });
  h.render();
  await h.label('Status').props.onChange({ target: { value: 'done' } });
  assert.equal(h.gate.allowed(), false);
  class OwnershipFailure extends Error {}
  const replay = mountedCapture({}, {
    '@/lib/outbox': { ...load('src/lib/outbox.ts'), listQueued: async () => [item],
      removeQueued() { assert.fail('unverified replay must stay queued'); } },
    '@/lib/sync': { QueueOwnerError: OwnershipFailure, NetworkError: class extends Error {},
      pushIdea: async () => { throw new OwnershipFailure(); } },
  });
  replay.render();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(replay.gate.allowed(), false);
});

test('lock during a direct edit preserves the editor and ignores its delayed completion', async () => {
  let finish;
  let started;
  const begin = new Promise((resolve) => { started = resolve; });
  const h = mountedCapture({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from: () => { const q = { update: () => q, eq: () => q, filter: () => q,
      select: () => { started(); return new Promise((resolve) => { finish = resolve; }); } }; return q; } });
  h.render();
  h.label('Edit').props.onClick();
  h.label('Edit idea').props.onChange({ target: { value: 'buffer waiting for server' } });
  const saving = h.button('Save').props.onClick();
  await begin;
  h.gate.lock();
  h.gate.unlock();
  finish({ error: null });
  await saving;
  assert.equal(h.label('Edit idea').props.value, 'buffer waiting for server');
  assert.equal(h.button('Save').type, 'button');
});

test('conditional edits and status changes reject stale or missing rows without losing the edit buffer', async () => {
  for (const changed of [false, true]) {
    const filters = [];
    const client = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
      from() { const q = { update: () => q, eq(key, value) { filters.push([key, value]); return q; },
        filter(key, operator, value) { filters.push([key, operator, value]); return q; },
        select: async () => ({ data: changed ? [] : [{ id: 'idea' }], error: null }) }; return q; } };
    const h = mountedCapture(client);
    h.render();
    h.label('Edit').props.onClick();
    h.label('Edit idea').props.onChange({ target: { value: 'my unsaved change' } });
    // A refreshed row must not silently replace the version the editor was opened against.
    h.idea.content = 'refreshed text';
    await h.button('Save').props.onClick();
    assert.ok(filters.some(([key, value]) => key === 'user_id' && value === 'owner'));
    assert.ok(filters.some(([key, value]) => key === 'content' && value === 'original private text'));
    assert.ok(filters.some(([key]) => key === 'status'));
    assert.ok(filters.some(([key]) => key === 'tags'));
    if (changed) {
      assert.equal(h.label('Edit idea').props.value, 'my unsaved change');
      assert.match(JSON.stringify(h.render()), /changed or was deleted/);
    } else {
      assert.equal(h.label('Edit idea'), undefined);
      assert.match(JSON.stringify(h.render()), /my unsaved change/);
    }
    await h.label('Status').props.onChange({ target: { value: 'done' } });
    if (changed) assert.equal(h.label('Status').props.value, 'raw');
  }
});

test('already-open offline workspace can queue a capture without verification or replay', async () => {
  const saved = [];
  const h = mountedCapture({ auth: { getUser() { assert.fail('offline actions must not verify remotely'); } } }, {
    '@/lib/outbox': { ...load('src/lib/outbox.ts'), listQueued: async () => [],
      addQueued: async (record) => saved.push(record), removeQueued() { assert.fail('offline replay must stay paused'); } },
  });
  h.render();
  h.navigator.onLine = false;
  await h.label('Status').props.onChange({ target: { value: 'done' } });
  assert.equal(h.gate.allowed(), true);
  await h.find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].owner_id, 'owner');
  assert.equal(saved[0].content, 'retained draft');
  assert.equal(h.gate.allowed(), true);
});

test('lock during attachment upload retains input bytes and prevents metadata insertion', async () => {
  let finish;
  let started;
  const begin = new Promise((resolve) => { started = resolve; });
  const h = mountedCapture({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from() { assert.fail('locked upload must not insert metadata'); },
    storage: { from: () => ({ upload() { started(); return new Promise((resolve) => { finish = resolve; }); } }) } });
  h.render();
  h.label('Edit').props.onClick();
  const input = h.find((node) => node.type === 'input' && node.props.ref && node.props.onChange?.toString().includes('addToIdea'));
  const file = new File(['original upload bytes'], 'interrupted.txt');
  const uploading = input.props.onChange({ target: { files: [file] } });
  await begin;
  h.gate.lock();
  assert.ok(JSON.stringify(h.render()).includes('interrupted.txt'), 'retain files even before upload settles');
  h.gate.unlock();
  finish({ error: null });
  await uploading;
  assert.ok(JSON.stringify(h.render()).includes('interrupted.txt'));
  assert.equal(await file.text(), 'original upload bytes');
});

test('ambiguous attachment metadata failure retains file bytes without deleting the uploaded object', async () => {
  const h = mountedCapture({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'response lost' } }) }) }) }),
    storage: { from: () => ({ upload: async () => ({ error: null }), remove() { assert.fail('ambiguous uploads must never purge bytes'); } }) },
  });
  h.render(); h.label('Edit').props.onClick();
  const input = h.find((node) => node.type === 'input' && node.props.onChange?.toString().includes('addToIdea'));
  const file = new File(['retain these bytes'], 'ambiguous.txt');
  await input.props.onChange({ target: { files: [file] } });
  assert.ok(JSON.stringify(h.render()).includes('ambiguous.txt'));
  assert.match(JSON.stringify(h.render()), /some may already be saved/);
});

test('recovery UI cancels its owned deletion marker, restores in place and stays inside the lock boundary', async () => {
  const calls = [];
  let pending = [];
  const record = { id: 'recovery', kind: 'file', owner_id: 'owner', idea: { id: 'idea', files: [{ name: 'removed.txt' }] } };
  let restored;
  const h = mountedCapture({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: restored, error: null }) }) }) }),
  }, {
    '@/lib/recovery': { listRecovery: async () => [record] },
    '@/lib/recovery-operations': { restoreRecovery: async (_client, value, owner, verify) => {
      assert.equal(value, record); assert.equal(owner, 'owner'); await verify(); calls.push('restore');
    } },
    '@/lib/outbox': { ...load('src/lib/outbox.ts'), listQueued: async () => pending,
      removeQueued: async () => { calls.push('remove'); pending = []; } },
  });
  restored = { ...h.idea, files: [...h.idea.files, { id: 'restored-file', name: 'removed.txt', path: 'owner/idea/restored', size: 2 }] };
  h.render(); await new Promise((resolve) => setImmediate(resolve));
  pending = [{ id: 'idea', owner_id: 'owner', deleted: true }];
  await h.button('Restore').props.onClick();
  assert.deepEqual(calls, ['remove', 'restore']);
  assert.match(JSON.stringify(h.render()), /Restored. The recovery record/);
  const boundary = h.find((node) => node.props?.inert !== undefined);
  assert.ok(treeNodes(boundary).some((node) => node.type === 'details'));
  h.gate.lock();
  await h.button('Restore').props.onClick();
  assert.deepEqual(calls, ['remove', 'restore']);
});

test('offline removal preserves recovery intent before its tombstone and refuses to hide an idea if storage fails', async () => {
  for (const fail of [false, true]) {
    const calls = [], records = [];
    const h = mountedCapture({}, {
      '@/lib/recovery': { listRecovery: async () => records,
        saveRecovery: async (record) => { calls.push('recovery'); if (fail) throw new Error('quota'); records.push(record); } },
      '@/lib/outbox': { ...load('src/lib/outbox.ts'), listQueued: async () => [],
        addQueued: async (record) => { calls.push('tombstone'); assert.equal(record.recovery_id, records[0].id); },
      },
    });
    h.render(); h.navigator.onLine = false;
    await h.label('Delete').props.onClick();
    assert.deepEqual(calls, fail ? ['recovery'] : ['recovery', 'tombstone']);
    if (fail) assert.ok(h.label('Delete'), 'failed recovery writes must keep the idea visible');
    else {
      assert.equal(h.label('Delete'), undefined);
      assert.equal(records[0].prepared, false);
      assert.equal(records[0].idea.content, 'original private text');
      assert.equal(records[0].idea.files[0].url, undefined, 'never persist signed URLs in recovery');
    }
  }
});

test('lock discards delayed pagination/signing results and never starts signing the stale page', async () => {
  for (const signing of [false, true]) {
    let finish;
    let reads = 0;
    const pending = new Promise((resolve) => { finish = resolve; });
    const query = new Proxy({}, { get: (_, name) => name === 'then' ? pending.then.bind(pending) : () => query });
    const h = mountedCapture({ from: () => query }, {
      '@/lib/ideas': { STATUSES: ['raw'], PAGE_SIZE: 1, MAX_FILE_BYTES: 100, formatSize: String,
        withFileUrls() { reads++; assert.fail('stale pagination must not request file URLs'); },
        signFiles() { reads++; return pending; } },
    });
    h.render();
    const operation = h.button(signing ? 'Retry attachment links' : 'Load more').props.onClick();
    h.gate.lock();
    h.gate.unlock();
    finish(signing ? [{ ...h.idea.files[0], url: 'https://fixture.test/stale-secret' }]
      : { data: [{ ...h.idea, id: 'stale', content: 'stale page result' }], error: null });
    await operation;
    const rendered = JSON.stringify(h.render());
    assert.ok(!rendered.includes('stale-secret'));
    assert.ok(!rendered.includes('stale page result'));
    assert.equal(reads, signing ? 1 : 0);
  }
});

test('locking during replay retains the queue record when an old completion arrives after unlock', async () => {
  let finish;
  let started;
  const begin = new Promise((resolve) => { started = resolve; });
  const queued = [{ ...item, owner_id: 'owner', deleted: false }];
  let removals = 0;
  const h = mountedCapture({}, {
    '@/lib/outbox': { ...load('src/lib/outbox.ts'), listQueued: async () => queued,
      removeQueued() { removals++; } },
    '@/lib/sync': { QueueOwnerError: class extends Error {}, NetworkError: class extends Error {},
      pushIdea() { started(); return new Promise((resolve) => { finish = resolve; }); } },
  });
  h.render();
  await begin;
  h.gate.lock();
  h.gate.unlock();
  finish({ idea: { ...h.idea, content: 'stale replay result' }, failures: [] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(removals, 0);
  assert.equal(queued[0].files, item.files);
  assert.ok(!JSON.stringify(h.render()).includes('stale replay result'));
});

test('dashboard stats count existing stages, recent ideas and six UTC months without renaming stages', () => {
  const { vaultStats } = load('src/lib/vault-stats.ts');
  const now = new Date('2026-11-16T12:00:00Z');
  const stats = vaultStats([
    { status: 'raw', created_at: '2026-11-15T00:00:00Z' },
    { status: 'exploring', created_at: '2026-11-01T00:00:00Z' },
    { status: 'building', created_at: '2026-06-30T23:59:59Z' },
    { status: 'done', created_at: '2026-06-01T00:00:00Z' },
    { status: 'done', created_at: '2026-05-31T23:59:59Z' },
    { status: 'archived', created_at: 'not a date' },
  ], now);
  assert.equal(stats.total, 6);
  assert.deepEqual({ ...stats.byStage }, { raw: 1, exploring: 1, building: 1, done: 2 });
  assert.equal(stats.other, 1);
  assert.equal(stats.thisWeek, 1);
  assert.deepEqual(Array.from(stats.months, (m) => m.key), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.deepEqual(Array.from(stats.months, (m) => m.count), [2, 0, 0, 0, 0, 2]);
  assert.equal(vaultStats([], now).months.every((m) => m.count === 0), true);
});
