import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPublicRestore } from '../scripts/vault/restore-logical-public.mjs';

function fixture() {
  const names = ['ideas', 'idea_files', 'timevault_state'];
  const tables = ['public.ideas', 'public.idea_files', 'public.timevault_state', 'auth.users', 'storage.objects', 'storage.buckets']
    .map((name) => ({ schema: name.split('.')[0], name: name.split('.')[1], count: 0, rows: [] }));
  tables[0].rows = ['{"content":"O\'Brien", "value":9007199254740993}']; tables[0].count = 1;
  const relations = names.map((relname, i) => ({ oid: String(i + 10), relnamespace: '1', relname, relkind: 'r' }));
  relations.push({ oid: '20', relnamespace: '2', relname: 'users', relkind: 'r' });
  return { database: { tables }, catalog: { namespaces: [{ oid: '1', nspname: 'public' }, { oid: '2', nspname: 'auth' }], relations,
    columns: relations.map((r) => ({ attrelid: r.oid, attnum: 1, attname: 'content', sql_type: 'text', attgenerated: '', attidentity: '' })),
    defaults: [], constraints: [], indexes: [], policies: [], triggers: [], table_grants: [] } };
}
const local = [{ name: 'content', type: 'text', generated: '' }];

test('local restore retains original numeric row text and quotes data without executing it', () => {
  const plan = buildPublicRestore(fixture(), local);
  assert.ok(plan.sql.startsWith('BEGIN;'));
  assert.ok(plan.sql.endsWith('COMMIT;'));
  assert.ok(plan.sql.includes("O''Brien"));
  assert.ok(plan.sql.includes('9007199254740993'));
  assert.ok(!/TRUNCATE|DROP DATABASE|DISABLE TRIGGER/.test(plan.sql));
});

test('local restore refuses schema drift, incompatible Auth columns, unreviewed defaults and public triggers', () => {
  let payload = fixture();
  payload.catalog.relations.push({ oid: '100', relnamespace: '1', relname: 'unknown', relkind: 'r' });
  assert.throws(() => buildPublicRestore(payload, local), /Unexpected public schema/);
  assert.throws(() => buildPublicRestore(fixture(), []), /compatibility/);
  payload = fixture(); payload.catalog.defaults.push({ adrelid: '10', adnum: 1, definition: 'unreviewed_function()' });
  assert.throws(() => buildPublicRestore(payload, local), /default requires review/);
  payload = fixture(); payload.catalog.triggers.push({ tgrelid: '10' });
  assert.throws(() => buildPublicRestore(payload, local), /triggers/);
});

test('authoritative ACLs recover owner-role access omitted from filtered grants and reject other grant targets', () => {
  const grants = [{ table_schema: 'public', table_name: 'timevault_state', grantee: 'authenticated', privilege_type: 'SELECT', is_grantable: 'NO' }];
  const plan = buildPublicRestore(fixture(), local, grants);
  assert.ok(plan.grantStatements.includes('GRANT SELECT ON public."timevault_state" TO "authenticated";'));
  grants[0].table_name = 'unrelated_table';
  assert.throws(() => buildPublicRestore(fixture(), local, grants), /Grant requires review/);
});
