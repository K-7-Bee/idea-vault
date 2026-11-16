import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSupplementalDefinitions, compareServiceTables, compareStorageHistory } from '../scripts/vault/audit-service-recovery.mjs';

test('supplemental recovery refuses widened Storage roles, changed existing definitions and extra SQL', () => {
  const policies=['delete','upload','read'].map((verb,i) => ({schemaname:'storage',tablename:'objects',policyname:`owner can ${verb} own files`,permissive:'PERMISSIVE',roles:['authenticated'],cmd:['DELETE','INSERT','SELECT'][i],qual:i===1 ? null : '(auth.uid() = owner)',with_check:i===1 ? '(auth.uid() = owner)' : null}));
  const indexes=['email','created_at_desc','last_sign_in_at_desc','name'].map((suffix) => ({schemaname:'auth',tablename:'users',indexname:`idx_users_${suffix}`,tablespace:null,indexdef:`CREATE INDEX idx_users_${suffix} ON auth.users USING btree (email)`}));
  const catalog={policies,indexes}, actual={policies:[],indexes:[]};
  assert.match(buildSupplementalDefinitions(catalog,actual),/^BEGIN;[\s\S]*COMMIT;$/);
  assert.throws(() => buildSupplementalDefinitions({...catalog,policies:policies.map((p) => ({...p,roles:['public']}))},actual),/requires review/);
  assert.throws(() => buildSupplementalDefinitions(catalog,{...actual,policies:[{...policies[0],qual:'true'}]}),/differs/);
  assert.throws(() => buildSupplementalDefinitions({...catalog,indexes:indexes.map((i) => ({...i,indexdef:i.indexdef+'; DROP TABLE auth.users'}))},actual),/requires review/);
});

test('migration provenance compares identifiers and hashes separately from local execution timestamps', () => {
  const row = {id:1,name:'initial',hash:'abc',executed_at:'source-time'};
  const source = [JSON.stringify(row)];
  const local = [JSON.stringify({...row,executed_at:'local-time'})];
  assert.equal(compareStorageHistory(source,local).identifiersAndHashesMatch,true);
  assert.deepEqual(compareStorageHistory(source,[JSON.stringify({...row,hash:'changed'})]).differingIds,[1]);
  assert.equal(compareStorageHistory(source,[]).identifiersAndHashesMatch,false);
  assert.throws(() => compareStorageHistory(source,[...local,...local]),/Duplicate/);
});

test('service audit separates missing tables, schema drift, un-restored rows and nonempty conflicts', () => {
  const names = ['public.ideas','public.idea_files','public.timevault_state','auth.users','storage.objects','storage.buckets'];
  const tables = names.map((full) => ({ schema: full.split('.')[0], name: full.split('.')[1], rows: ['{"value":9007199254740993}'], count: 1 }));
  const namespaces = ['public','auth','storage'].map((nspname, i) => ({ nspname, oid: String(i) }));
  const relations = tables.map((t, i) => ({ relnamespace: namespaces.find((n) => n.nspname === t.schema).oid, relname: t.name, relkind: 'r', oid: String(i) }));
  const columns = relations.map((r) => ({ attrelid: r.oid, attname: 'value', sql_type: 'numeric', attgenerated: '', attidentity: '', attnotnull: false }));
  const local = tables.map((t) => ({ ...t, columns: [{ name: 'value', type: 'numeric', generated: '', identity: '', required: false }] }));
  local[1].rows = [];
  local[2].rows = ['{"value":9007199254740992}'];
  local[3].columns = [{ ...local[3].columns[0], type: 'text' }];
  local.pop();
  const results = compareServiceTables({ database: { tables }, catalog: { namespaces, relations, columns } }, local);
  assert.deepEqual(results.map((r) => r.status), ['columns-and-rows-match','compatible-empty-target-needs-restore','nonempty-different-target-stop','column-drift','columns-and-rows-match','missing-local-table']);
  assert.equal(results[2].exactRowsMatch, false);
});
