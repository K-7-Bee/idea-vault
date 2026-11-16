import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { decryptPayload, encryptPayload, verifyTables } from '../scripts/vault/logical-snapshot.mjs';

test('logical snapshot authenticates private rows, catalog and binary bytes', () => {
  const key = randomBytes(32);
  const payload = { rows: [{ content: 'private fixture 한국어', extra: null }], catalog: { policies: ['fixture'] },
    objects: [{ data_base64: Buffer.from([0, 255, 9]).toString('base64') }] };
  const encrypted = encryptPayload(payload, key);
  assert.ok(!JSON.stringify(encrypted).includes('private fixture'));
  assert.deepEqual(decryptPayload(encrypted, key), payload);
  assert.throws(() => decryptPayload(encrypted, randomBytes(32)));
  const changed = structuredClone(encrypted);
  const bytes = Buffer.from(changed.ciphertext, 'base64'); bytes[0] ^= 1;
  changed.ciphertext = bytes.toString('base64');
  assert.throws(() => decryptPayload(changed, key));
  assert.throws(() => encryptPayload(payload, Buffer.alloc(0)), /key/);
});

test('table completeness rejects missing timevault, truncated rows and duplicate inventories while retaining repeated rows', () => {
  const tables = ['public.ideas', 'public.idea_files', 'public.timevault_state', 'auth.users', 'storage.objects', 'storage.buckets']
    .map((name) => ({ schema: name.split('.')[0], name: name.split('.')[1], count: 0, rows: [] }));
  verifyTables(tables);
  assert.throws(() => verifyTables(tables.filter((t) => t.name !== 'timevault_state')), /missing/);
  assert.throws(() => verifyTables([...tables, tables[0]]), /mismatch/);
  tables[0].count = 1;
  assert.throws(() => verifyTables(tables), /mismatch/);
  tables[0].rows = ['{"value":9007199254740993}', '{"value":9007199254740993}']; tables[0].count = 2;
  verifyTables(tables);
  assert.equal(tables[0].rows[0], '{"value":9007199254740993}');
});
