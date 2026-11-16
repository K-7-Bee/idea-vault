import { spawnSync } from 'node:child_process';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { decryptPayload, verifyTables } from './logical-snapshot.mjs';

const root = 'S:\\Road to Storm K7\\codex test\\idea-vault-preservation';
const targetDirectory = path.join(root, 'restore-prep-20261116');
const container = 'supabase_db_idea-vault-restore-prep-20261116';
const ident = (text) => '"' + text.replaceAll('"', '""') + '"';
const lit = (text) => "'" + text.replaceAll("'", "''") + "'";

export function buildPublicRestore(payload, localAuthColumns, resolvedGrants = null) {
  verifyTables(payload.database.tables);
  const catalog = payload.catalog;
  const ns = catalog.namespaces.find((n) => n.nspname === 'public');
  if (catalog.relations.some((r) => r.relnamespace === ns.oid && !['r', 'i'].includes(r.relkind))) throw new Error('Additional public relation kinds require review');
  const tables = catalog.relations.filter((r) => r.relnamespace === ns.oid && r.relkind === 'r');
  if (tables.map((r) => r.relname).sort().join(',') !== 'idea_files,ideas,timevault_state') throw new Error('Unexpected public schema; review required');
  const ids = new Set(tables.map((r) => r.oid));
  if ((catalog.triggers ?? []).some((t) => ids.has(t.tgrelid))) throw new Error('Public triggers require separate review');
  const userRows = payload.database.tables.find((t) => t.schema === 'auth' && t.name === 'users').rows;
  const authNs = catalog.namespaces.find((n) => n.nspname === 'auth');
  const authTable = catalog.relations.find((r) => r.relnamespace === authNs.oid && r.relname === 'users' && r.relkind === 'r');
  const authColumns = catalog.columns.filter((c) => c.attrelid === authTable.oid).sort((a, b) => a.attnum - b.attnum);
  for (const column of authColumns) {
    const local = localAuthColumns.find((c) => c.name === column.attname);
    if (!local || local.type !== column.sql_type || local.generated !== column.attgenerated) throw new Error('Auth user column compatibility failed');
  }
  if (authColumns.length !== localAuthColumns.length) throw new Error('Auth user columns differ');
  const statements = ['BEGIN;', 'SET LOCAL standard_conforming_strings = on;', "SET LOCAL search_path = public, extensions, pg_catalog;", "SET LOCAL statement_timeout = '60s';"];
  const grantStatements = [];
  function insertRows(schema, name, rows, columns) {
    const full = `${ident(schema)}.${ident(name)}`;
    const names = columns.filter((c) => !c.attgenerated).map((c) => ident(c.attname));
    for (const row of rows) statements.push(`INSERT INTO ${full} (${names.join(',')}) SELECT ${names.join(',')} FROM json_populate_record(NULL::${full}, ${lit(row)}::json);`);
  }
  insertRows('auth', 'users', userRows, authColumns);
  const allowedTypes = new Set(['uuid', 'text', 'text[]', 'bigint', 'jsonb', 'timestamp with time zone']);
  const allowedDefaults = new Set(['gen_random_uuid()', 'auth.uid()', 'now()', "'raw'::text", "'{}'::text[]"]);
  for (const table of tables) {
    const columns = catalog.columns.filter((c) => c.attrelid === table.oid).sort((a, b) => a.attnum - b.attnum);
    const fields = columns.map((column) => {
      if (!allowedTypes.has(column.sql_type) || column.attgenerated || column.attidentity) throw new Error('Unsupported public column definition');
      const def = catalog.defaults.find((d) => d.adrelid === table.oid && d.adnum === column.attnum)?.definition;
      if (def && !allowedDefaults.has(def)) throw new Error('Public default requires review');
      return `${ident(column.attname)} ${column.sql_type}${def ? ` DEFAULT ${def}` : ''}${column.attnotnull ? ' NOT NULL' : ''}`;
    });
    statements.push(`CREATE TABLE public.${ident(table.relname)} (${fields.join(',')});`);
    const source = payload.database.tables.find((t) => t.schema === 'public' && t.name === table.relname);
    insertRows('public', table.relname, source.rows, columns);
  }
  const constraints = catalog.constraints.filter((c) => ids.has(c.conrelid)).sort((a, b) => (a.contype === 'f') - (b.contype === 'f'));
  for (const constraint of constraints) {
    if (!['p', 'u', 'c', 'f'].includes(constraint.contype) || /;|--|\/\*/.test(constraint.definition)) throw new Error('Constraint requires review');
    const table = tables.find((t) => t.oid === constraint.conrelid);
    statements.push(`ALTER TABLE public.${ident(table.relname)} ADD CONSTRAINT ${ident(constraint.conname)} ${constraint.definition};`);
  }
  const constraintIndexes = new Set(constraints.map((c) => c.conindid));
  for (const index of catalog.indexes.filter((i) => i.schemaname === 'public')) {
    const relation = catalog.relations.find((r) => r.relnamespace === ns.oid && r.relname === index.indexname);
    if (constraintIndexes.has(relation?.oid)) continue;
    if (/;|--|\/\*/.test(index.indexdef)) throw new Error('Index requires review');
    statements.push(index.indexdef + ';');
  }
  for (const table of tables) {
    if (table.relrowsecurity) statements.push(`ALTER TABLE public.${ident(table.relname)} ENABLE ROW LEVEL SECURITY;`);
    if (table.relforcerowsecurity) statements.push(`ALTER TABLE public.${ident(table.relname)} FORCE ROW LEVEL SECURITY;`);
    const revoke = `REVOKE ALL ON public.${ident(table.relname)} FROM PUBLIC, anon, authenticated, service_role;`;
    statements.push(revoke); grantStatements.push(revoke);
  }
  for (const policy of catalog.policies.filter((p) => p.schemaname === 'public')) {
    if (!['PERMISSIVE', 'RESTRICTIVE'].includes(policy.permissive) || !['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL'].includes(policy.cmd) || [policy.qual, policy.with_check].some((s) => s && /;|--|\/\*/.test(s))) throw new Error('Policy requires review');
    const roles = policy.roles.map((role) => role === 'public' ? 'PUBLIC' : ident(role)).join(',');
    statements.push(`CREATE POLICY ${ident(policy.policyname)} ON public.${ident(policy.tablename)} AS ${policy.permissive} FOR ${policy.cmd} TO ${roles}${policy.qual ? ` USING (${policy.qual})` : ''}${policy.with_check ? ` WITH CHECK (${policy.with_check})` : ''};`);
  }
  const privileges = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']);
  for (const grant of (resolvedGrants ?? catalog.table_grants ?? []).filter((g) => g.table_schema === 'public')) {
    if (!privileges.has(grant.privilege_type) || !tables.some((table) => table.relname === grant.table_name)) throw new Error('Grant requires review');
    const statement = `GRANT ${grant.privilege_type} ON public.${ident(grant.table_name)} TO ${grant.grantee === 'PUBLIC' ? 'PUBLIC' : ident(grant.grantee)}${grant.is_grantable === 'YES' ? ' WITH GRANT OPTION' : ''};`;
    statements.push(statement); grantStatements.push(statement);
  }
  statements.push('COMMIT;');
  return { sql: statements.join('\n'), tables, userRows, grantStatements };
}

async function main() {
  const run = process.argv[2];
  const verifyOnly = process.argv[3] === '--verify-only';
  const applyGrants = process.argv[3] === '--apply-source-grants';
  if (!run || process.argv.length > 4 || (process.argv[3] && !verifyOnly && !applyGrants) || await realpath(path.dirname(run)) !== await realpath(root) || !/^run-\d{8}T\d{6}Z$/.test(path.basename(run))) throw new Error('Verified private run path required');
  if (await realpath(run) !== path.resolve(run) || await realpath(targetDirectory) !== path.resolve(targetDirectory)) throw new Error('Reparse target refused');
  const key = Buffer.from(process.env.VAULT_SNAPSHOT_KEY || '', 'base64');
  delete process.env.VAULT_SNAPSHOT_KEY;
  const payload = decryptPayload(JSON.parse(await readFile(path.join(run, 'snapshot.encrypted.json'), 'utf8')), key);
  const target = JSON.parse(await readFile(path.join(targetDirectory, 'target-identity.private.json'), 'utf8'));
  function docker(args, input) {
    const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    if (result.status !== 0) {
      writeFileSync(path.join(run, `local-operation-failure-${Date.now()}.private.json`), JSON.stringify({ args, input, status: result.status, stdout: result.stdout, stderr: result.stderr }), { flag: 'wx', mode: 0o600 });
      throw new Error(`Local Docker operation failed (${ /permission denied|must be member/.test(result.stderr ?? '') ? 'permission denied' : 'private output suppressed' })`);
    }
    return result.stdout.trim();
  }
  if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT || !docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']).startsWith('npipe://')) throw new Error('Local Docker context required');
  const inspection = JSON.parse(docker(['inspect', container]))[0];
  const networks = Object.keys(inspection.NetworkSettings.Networks);
  if (inspection.Id !== target.containerId || inspection.Image !== target.imageId || networks.length !== 1 || networks[0] !== target.network
    || inspection.Mounts.length !== 1 || inspection.Mounts[0].Name !== target.volume
    || Object.values(inspection.NetworkSettings.Ports).some((ports) => ports?.length)) throw new Error('Exact isolated target identity required');
  const network = JSON.parse(docker(['network', 'inspect', target.network]))[0];
  if (!network.Internal) throw new Error('Outbound-isolated network required');
  function sql(query) { return docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-Atq'], query); }
  const expectedSentinel = `${target.sentinel}|empty-local-preparation-not-approved-for-restore`;
  if (sql('SELECT id::text||\'|\'||purpose FROM preservation_local.target_identity;') !== expectedSentinel) throw new Error('Local sentinel mismatch');
  const initial = JSON.parse(sql(`SELECT json_build_object('version', current_setting('server_version'),
    'public_tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'), 'users',(SELECT count(*) FROM auth.users));`));
  let emptyBootstrapMetadata = false;
  if (Number(initial.public_tables) === 1) {
    const known = sql(`SELECT count(*)=1 AND bool_and(tablename='schema_migrations' AND tableowner='postgres') FROM pg_tables WHERE schemaname='public';`) === 't';
    if (known) {
      const signature = sql(`SELECT string_agg(attname||':'||format_type(atttypid,atttypmod)||':'||attnotnull::text,',' ORDER BY attnum)
        FROM pg_attribute WHERE attrelid='public.schema_migrations'::regclass AND attnum>0 AND NOT attisdropped;`);
      emptyBootstrapMetadata = signature === 'version:character varying(14):true' && sql('SELECT count(*) FROM public.schema_migrations;') === '0';
    }
  }
  if (initial.version !== payload.database.server_version || ((!verifyOnly && !applyGrants) && ((Number(initial.public_tables) !== 0 && !emptyBootstrapMetadata) || Number(initial.users) !== 0))) throw new Error('Matching empty destination required');
  const authColumns = JSON.parse(sql(`SELECT json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'generated',a.attgenerated) ORDER BY a.attnum)
    FROM pg_attribute a WHERE a.attrelid='auth.users'::regclass AND a.attnum>0 AND NOT a.attisdropped;`));
  // information_schema.role_table_grants is visibility-filtered. Resolve the
  // original pg_class.relacl strings saved in the archive, using local PG's ACL
  // parser; do not infer privileges or query production again.
  const publicNs = payload.catalog.namespaces.find((n) => n.nspname === 'public').oid;
  const sourceTables = payload.catalog.relations.filter((r) => r.relnamespace === publicNs && r.relkind === 'r');
  const grantQuery = sourceTables.map((table) => {
    const owner = payload.catalog.roles_without_passwords.find((r) => r.oid === table.relowner)?.rolname;
    if (!owner) throw new Error('Source owner role unavailable');
    const acl = table.relacl ? `ARRAY[${table.relacl.map(lit).join(',')}]::aclitem[]` : `acldefault('r',(SELECT oid FROM pg_roles WHERE rolname=${lit(owner)}))`;
    return `SELECT 'public'::text AS table_schema,${lit(table.relname)}::text AS table_name,CASE WHEN e.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(e.grantee) END AS grantee,e.privilege_type,CASE WHEN e.is_grantable THEN 'YES' ELSE 'NO' END AS is_grantable FROM aclexplode(${acl}) e`;
  }).join(' UNION ALL ');
  const resolvedGrants = JSON.parse(sql(`SELECT json_agg(to_jsonb(g)) FROM (${grantQuery}) g;`));
  const plan = buildPublicRestore(payload, authColumns, resolvedGrants);
  if (!verifyOnly && !applyGrants) {
    await writeFile(path.join(run, 'restore-public.private.sql'), plan.sql, { flag: 'wx', mode: 0o600 });
    sql(plan.sql);
  }
  const result = [];
  for (const source of payload.database.tables.filter((t) => t.schema === 'public' || (t.schema === 'auth' && t.name === 'users'))) {
    const rows = JSON.parse(sql(`SELECT coalesce(json_agg(to_jsonb(t)::text ORDER BY to_jsonb(t)::text COLLATE "C"),'[]'::json) FROM ${ident(source.schema)}.${ident(source.name)} t;`));
    if (!isDeepStrictEqual(rows, source.rows)) throw new Error('Restored row mismatch; retain instance and private evidence');
    result.push({ table: `${source.schema}.${source.name}`, rows: rows.length, exactMatch: true });
  }
  const sourcePolicies = payload.catalog.policies.filter((p) => p.schemaname === 'public');
  const localPolicies = JSON.parse(sql(`SELECT coalesce(json_agg(to_jsonb(p) ORDER BY tablename,policyname),'[]'::json) FROM pg_policies p WHERE schemaname='public';`));
  const sortedPolicies = sourcePolicies.toSorted((a, b) => a.tablename.localeCompare(b.tablename) || a.policyname.localeCompare(b.policyname));
  if (!isDeepStrictEqual(localPolicies, sortedPolicies)) throw new Error('Restored policy mismatch');
  if (applyGrants) sql(['BEGIN;', ...plan.grantStatements, 'COMMIT;'].join('\n'));
  const localGrants = JSON.parse(sql(`SELECT json_agg(json_build_object('table_schema','public','table_name',c.relname,
    'grantee',CASE WHEN e.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(e.grantee) END,'privilege_type',e.privilege_type,
    'is_grantable',CASE WHEN e.is_grantable THEN 'YES' ELSE 'NO' END))
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) e
    WHERE n.nspname='public' AND c.relname IN ('ideas','idea_files','timevault_state') AND c.relkind='r';`));
  const normalized = (grants) => grants.map((g) => JSON.stringify([g.table_schema, g.table_name, g.grantee, g.privilege_type, g.is_grantable])).sort();
  if (!isDeepStrictEqual(normalized(resolvedGrants), normalized(localGrants))) throw new Error('Restored privilege/grant-option mismatch');
  const user = JSON.parse(plan.userRows[0]);
  const ownerCounts = plan.tables.map((table) => Number(sql(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.sub" = ${lit(user.id)};
    SELECT count(*) FROM public.${ident(table.relname)}; ROLLBACK;`)));
  for (const [index, table] of plan.tables.entries()) {
    const source = payload.database.tables.find((t) => t.schema === 'public' && t.name === table.relname);
    const owned = source.rows.filter((row) => JSON.parse(row).user_id === user.id).length;
    if (ownerCounts[index] !== owned) throw new Error('Owner RLS visibility mismatch');
    const other = Number(sql(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';
      SELECT count(*) FROM public.${ident(table.relname)}; ROLLBACK;`));
    if (other !== 0) throw new Error('Second-user RLS denial failed');
    const anonymousHasSelect = sql(`SELECT has_table_privilege('anon',${lit(`public.${ident(table.relname)}`)},'SELECT');`) === 't';
    const anonymous = anonymousHasSelect ? Number(sql(`BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM public.${ident(table.relname)}; ROLLBACK;`)) : 0;
    if (anonymous !== 0) throw new Error('Anonymous RLS denial failed');
  }
  const report = { status: 'public-data-and-owner-row-restore-verified', exactTables: result, publicPolicies: localPolicies.length,
    publicPrivilegesAndGrantOptionsMatch: true,
    ownerReadVerified: true, secondUserDenied: true, anonymousDenied: true, attachmentBytesRestored: false,
    fullAuthStorageRecoveryVerified: false, allServiceTablesRestored: false };
  await writeFile(path.join(run, `restore-public-verification-${Date.now()}.private.json`), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(report));
}

if (process.argv[1] && path.basename(process.argv[1]) === 'restore-logical-public.mjs') main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Local recovery failed'); process.exitCode = 1;
});
