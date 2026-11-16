import { spawnSync } from 'node:child_process';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { decryptPayload, verifyTables } from './logical-snapshot.mjs';

const root = 'S:\\Road to Storm K7\\codex test\\idea-vault-preservation';
const container = 'supabase_db_idea-vault-restore-prep-20261116';
const ident = (value) => '"' + value.replaceAll('"', '""') + '"';
const lit = (value) => "'" + value.replaceAll("'", "''") + "'";

export function buildSupplementalDefinitions(catalog, actual) {
  const statements=['BEGIN;','SET LOCAL standard_conforming_strings=on;',"SET LOCAL statement_timeout='60s';"];
  const policyNames=new Set(['owner can delete own files','owner can upload own files','owner can read own files']);
  const indexNames=new Set(['idx_users_email','idx_users_created_at_desc','idx_users_last_sign_in_at_desc','idx_users_name']);
  const policies=(catalog.policies ?? []).filter((p) => p.schemaname==='storage' && p.tablename==='objects');
  const indexes=(catalog.indexes ?? []).filter((i) => i.schemaname==='auth' && i.tablename==='users' && indexNames.has(i.indexname));
  if (policies.length!==3 || policies.some((p) => !policyNames.has(p.policyname)) || indexes.length!==4) throw new Error('Unexpected supplemental definitions');
  for (const policy of policies) {
    const existing=actual.policies.find((p) => p.schemaname===policy.schemaname && p.tablename===policy.tablename && p.policyname===policy.policyname);
    if (existing) { if (!isDeepStrictEqual(existing,policy)) throw new Error('Existing policy differs'); continue; }
    if (!['PERMISSIVE','RESTRICTIVE'].includes(policy.permissive) || !['SELECT','INSERT','DELETE'].includes(policy.cmd)
      || !Array.isArray(policy.roles) || policy.roles.length!==1 || policy.roles[0]!=='authenticated'
      || [policy.qual,policy.with_check].some((s) => s && /;|--|\/\*/.test(s))) throw new Error('Storage policy requires review');
    statements.push(`CREATE POLICY ${ident(policy.policyname)} ON storage.objects AS ${policy.permissive} FOR ${policy.cmd} TO ${policy.roles.map(ident).join(',')}${policy.qual ? ` USING (${policy.qual})` : ''}${policy.with_check ? ` WITH CHECK (${policy.with_check})` : ''};`);
  }
  for (const index of indexes) {
    const existing=actual.indexes.find((i) => i.schemaname===index.schemaname && i.indexname===index.indexname);
    if (existing) { if (!isDeepStrictEqual(existing,index)) throw new Error('Existing index differs'); continue; }
    if (!index.indexdef.startsWith(`CREATE INDEX ${index.indexname} ON auth.users USING btree `) || /;|--|\/\*/.test(index.indexdef)) throw new Error('Auth index requires review');
    statements.push(index.indexdef+';');
  }
  statements.push('COMMIT;');
  return statements.join('\n');
}

export function compareStorageHistory(sourceRows, localRows) {
  const project = (rows) => rows.map((row) => {
    const {id,name,hash} = JSON.parse(row);
    if (!Number.isInteger(id) || typeof name !== 'string' || typeof hash !== 'string') throw new Error('Invalid migration history');
    return {id,name,hash};
  }).sort((a,b) => a.id-b.id);
  const source = project(sourceRows), local = project(localRows);
  if ([source,local].some((rows) => new Set(rows.map((r) => r.id)).size !== rows.length)) throw new Error('Duplicate migration history IDs');
  return { sourceCount:source.length, localCount:local.length, identifiersAndHashesMatch:isDeepStrictEqual(source,local),
    differingIds:[...new Set([...source,...local].map((r) => r.id))].filter((id) => !isDeepStrictEqual(source.find((r) => r.id===id),local.find((r) => r.id===id))) };
}

export function compareServiceTables(payload, local) {
  verifyTables(payload.database.tables);
  return payload.database.tables.map((table) => {
    const ns = payload.catalog.namespaces.find((n) => n.nspname === table.schema);
    const relation = payload.catalog.relations.find((r) => r.relnamespace === ns.oid && r.relname === table.name && ['r', 'p'].includes(r.relkind));
    const sourceColumns = payload.catalog.columns.filter((c) => c.attrelid === relation.oid)
      .map((c) => ({ name: c.attname, type: c.sql_type, generated: c.attgenerated, identity: c.attidentity, required: c.attnotnull }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const actual = local.find((t) => t.schema === table.schema && t.name === table.name);
    if (!actual) return { table: `${table.schema}.${table.name}`, sourceRows: table.rows.length, status: 'missing-local-table' };
    const schemaMatches = isDeepStrictEqual(sourceColumns, actual.columns.toSorted((a, b) => a.name.localeCompare(b.name)));
    const rowsMatch = isDeepStrictEqual(table.rows, actual.rows);
    return { table: `${table.schema}.${table.name}`, sourceRows: table.rows.length, localRows: actual.rows.length,
      schemaMatches, exactRowsMatch: rowsMatch,
      status: !schemaMatches ? 'column-drift' : rowsMatch ? 'columns-and-rows-match' : actual.rows.length === 0 ? 'compatible-empty-target-needs-restore' : 'nonempty-different-target-stop' };
  });
}

async function main() {
  const run = process.argv[2];
  const restoreAuth = process.argv[3] === '--restore-compatible-auth';
  const initializeStorage = process.argv[3] === '--initialize-storage';
  const restoreStorage = process.argv[3] === '--restore-compatible-storage';
  const initializeRealtime = process.argv[3] === '--initialize-realtime';
  const restoreDefinitions=process.argv[3] === '--restore-local-definitions';
  const repairSequences=process.argv[3] === '--repair-local-sequences';
  const verifyWorkflows=process.argv[3] === '--verify-local-workflows';
  if ((process.argv.length !== 3 && !(process.argv.length === 4 && (restoreAuth || initializeStorage || restoreStorage || initializeRealtime || restoreDefinitions || repairSequences || verifyWorkflows))) || !run || !/^run-\d{8}T\d{6}Z$/.test(path.basename(run)) || await realpath(path.dirname(run)) !== await realpath(root)
    || await realpath(run) !== path.resolve(run)) throw new Error('Verified private run required');
  const key = Buffer.from(process.env.VAULT_SNAPSHOT_KEY || '', 'base64');
  delete process.env.VAULT_SNAPSHOT_KEY;
  const archive = await readFile(path.join(run, 'snapshot.encrypted.json'));
  const saved = JSON.parse(await readFile(path.join(run, 'verification.private.json'), 'utf8'));
  if (createHash('sha256').update(archive).digest('hex') !== saved.archiveSha256) throw new Error('Archive hash mismatch');
  const payload = decryptPayload(JSON.parse(archive), key);
  key.fill(0);
  const targetDir = path.join(root, 'restore-prep-20261116');
  if (await realpath(targetDir) !== path.resolve(targetDir)) throw new Error('Target reparse refused');
  const target = JSON.parse(await readFile(path.join(targetDir, 'target-identity.private.json'), 'utf8'));
  const docker = (args, input) => {
    const result = spawnSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0) throw new Error('Local audit failed; private SQL output suppressed');
    return result.stdout.trim();
  };
  if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT || !docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']).startsWith('npipe://')) throw new Error('Local Docker required');
  const inspected = JSON.parse(docker(['inspect', container]))[0];
  const networks = Object.keys(inspected.NetworkSettings.Networks);
  if (inspected.Id !== target.containerId || inspected.Image !== target.imageId || inspected.Mounts.length !== 1 || inspected.Mounts[0].Name !== target.volume
    || networks.length !== 1 || networks[0] !== target.network || Object.values(inspected.NetworkSettings.Ports).some((ports) => ports?.length)
    || !JSON.parse(docker(['network', 'inspect', target.network]))[0].Internal) throw new Error('Isolated target identity mismatch');
  const sql = (query) => docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-Atq'],
    `BEGIN READ ONLY; SET LOCAL statement_timeout='60s'; ${query}\nCOMMIT;`);
  if (sql('SELECT id::text FROM preservation_local.target_identity;') !== target.sentinel) throw new Error('Sentinel mismatch');
  if (restoreDefinitions) {
    if (docker(['ps','--filter',`network=${target.network}`,'--format','{{.Names}}']) !== container) throw new Error('Stop other local services before restoring definitions');
    const actual=JSON.parse(sql(`SELECT json_build_object('policies',(SELECT coalesce(json_agg(to_jsonb(p)),'[]') FROM pg_policies p WHERE schemaname='storage'),
      'indexes',(SELECT coalesce(json_agg(to_jsonb(i)),'[]') FROM pg_indexes i WHERE schemaname='auth' AND tablename='users'));`));
    const supplementalSql=buildSupplementalDefinitions(payload.catalog,actual);
    await writeFile(path.join(run,`restore-local-definitions-${Date.now()}.private.sql`),supplementalSql,{flag:'wx',mode:0o600});
    docker(['exec','-i',container,'psql','-U','supabase_admin','-d','postgres','-X','-v','ON_ERROR_STOP=1','-Atq'],supplementalSql);
  }
  if (initializeRealtime) {
    const image='public.ecr.aws/supabase/realtime@sha256:c56af0fbfd06362a1d3bea30a6419cc616240852d2a50cb4c2f41aeef5ee7b00';
    if (docker(['ps','--filter',`network=${target.network}`,'--format','{{.Names}}']) !== container) throw new Error('Stop other local services before initialization');
    if (sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='realtime' AND c.relkind IN ('r','p');") !== '0'
      || sql("SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='realtime';") !== 'supabase_admin') throw new Error('Expected empty bootstrap Realtime schema required');
    const prior=payload.database.tables.filter((t) => t.schema!=='realtime' && !(t.schema==='storage' && t.name==='migrations'));
    const baseline=JSON.parse(sql(`SELECT json_agg(to_jsonb(t)) FROM (${prior.map((t) => `SELECT ${lit(t.schema+'.'+t.name)} AS name,coalesce(json_agg(to_jsonb(r)::text ORDER BY to_jsonb(r)::text COLLATE "C"),'[]'::json) AS rows FROM ${ident(t.schema)}.${ident(t.name)} r`).join(' UNION ALL ')}) t;`));
    if (prior.some((t) => !isDeepStrictEqual(t.rows,baseline.find((r) => r.name===t.schema+'.'+t.name)?.rows))) throw new Error('Previously recovered rows differ');
    const versions=payload.database.tables.find((t) => t.schema==='realtime' && t.name==='schema_migrations').rows.map((r) => JSON.parse(r).version);
    if (versions.length!==96 || versions.some((v) => !Number.isSafeInteger(v)) || Math.max(...versions)!==20261103130000) throw new Error('Unexpected archived Realtime history');
    docker(['image','inspect',image]);
    const stamp=Date.now();
    await writeFile(path.join(run,`before-realtime-${stamp}.private.sql`),docker(['exec',container,'pg_dump','-U','supabase_admin','-d','postgres','--no-password']),{flag:'wx',mode:0o600});
    const password=inspected.Config.Env.find((v) => v.startsWith('POSTGRES_PASSWORD='))?.slice('POSTGRES_PASSWORD='.length);
    if (!password || /[\r\n]/.test(password)) throw new Error('Local development credential unavailable');
    const envFile=path.join(targetDir,`realtime-migrate-${stamp}.private.env`);
    await writeFile(envFile,[`DB_HOST=${container}`,'DB_PORT=5432','DB_NAME=postgres','DB_USER=supabase_admin',`DB_PASSWORD=${password}`,
      'DB_IP_VERSION=ipv4','DB_SSL=false','RUN_JANITOR=false','TENANT_METRICS_PUSHER_ENABLED=false',
      'APP_NAME=local-preservation-migrations',`SECRET_KEY_BASE=${randomBytes(48).toString('hex')}`,
      `METRICS_JWT_SECRET=${randomBytes(32).toString('hex')}`,'ERL_FLAGS=+S 2:2 +SDcpu 1 +SDio 1'].join('\n'),{flag:'wx',mode:0o600});
    // Same dynamic-repository API as the official dev/scripts/migrate_tenant_db.exs.
    // Load Ecto/Postgrex only; do not start the Realtime application or server.
    const code=`{:ok, _} = Application.ensure_all_started(:ecto_sql)
{:ok, _} = Application.ensure_all_started(:postgrex)
migrations = Realtime.Tenants.Migrations.migrations()
if Enum.sort(Enum.map(migrations, &elem(&1, 0))) != Enum.sort([${versions.join(',')}]), do: raise("Tenant migration versions differ")
config = [hostname: System.fetch_env!("DB_HOST"), port: 5432, database: "postgres", username: "supabase_admin", password: System.fetch_env!("DB_PASSWORD"), ssl: false]
Realtime.Repo.with_dynamic_repo(config, fn repo ->
  ran = Ecto.Migrator.run(Realtime.Repo, migrations, :up, all: true, prefix: "realtime", dynamic_repo: repo, log: false)
  if length(ran) != ${versions.length}, do: raise("Unexpected applied migration count")
  IO.puts("Local tenant migrations applied: #{length(ran)}")
end)`;
    await writeFile(path.join(targetDir,`realtime-migrate-${stamp}.private.exs`),code,{flag:'wx',mode:0o600});
    const migrate=spawnSync('docker',['run','--name',`idea-vault-realtime-migrate-${stamp}`,'--network',target.network,
      '--env-file',envFile,'--entrypoint','/app/bin/realtime',image,'eval',code],
    {encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:16*1024*1024});
    await writeFile(path.join(targetDir,`realtime-migrate-${stamp}.private.log`),`${migrate.stdout ?? ''}\n${migrate.stderr ?? ''}`,{flag:'wx',mode:0o600});
    if (migrate.status!==0) throw new Error('Local Realtime migrations failed; retain private log and restore point');
  }
  if (initializeStorage) {
    const image = 'public.ecr.aws/supabase/storage-api@sha256:b2a04ca607b6cfdeafc47f5fa8cc22fc386d40cc25e7f11bbfda65954f3ae949';
    if (docker(['ps','--filter',`network=${target.network}`,'--format','{{.Names}}']) !== container) throw new Error('Stop other local services before initialization');
    if (sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage' AND c.relkind IN ('r','p');") !== '0') throw new Error('Storage must have no existing tables');
    if (sql("SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='storage';") !== 'supabase_admin'
      || sql("SELECT has_schema_privilege('supabase_storage_admin','storage','CREATE');") !== 't') throw new Error('Unexpected Storage bootstrap owner or existing permission');
    // Check every previously recovered table before allowing managed schema changes.
    for (const table of payload.database.tables.filter((t) => !['storage','realtime'].includes(t.schema))) {
      const rows = JSON.parse(sql(`SELECT coalesce(json_agg(to_jsonb(t)::text ORDER BY to_jsonb(t)::text COLLATE "C"),'[]'::json) FROM ${ident(table.schema)}.${ident(table.name)} t;`));
      if (!isDeepStrictEqual(rows,table.rows)) throw new Error('Previously recovered rows differ; initialization refused');
    }
    docker(['image','inspect',image]);
    const stamp = Date.now();
    const restorePoint = docker(['exec',container,'pg_dump','-U','supabase_admin','-d','postgres','--no-password']);
    await writeFile(path.join(run,`before-storage-${stamp}.private.sql`),restorePoint,{flag:'wx',mode:0o600});
    const password = inspected.Config.Env.find((value) => value.startsWith('POSTGRES_PASSWORD='))?.slice('POSTGRES_PASSWORD='.length);
    if (!password || /[\r\n]/.test(password)) throw new Error('Local development credential unavailable');
    const envFile = path.join(targetDir,`storage-migrate-${stamp}.private.env`);
    await writeFile(envFile,[
      `DATABASE_URL=postgresql://supabase_storage_admin:${encodeURIComponent(password)}@${container}:5432/postgres`,
      'DB_SUPER_USER=supabase_storage_admin','DB_INSTALL_ROLES=false','DB_ALLOW_MIGRATION_REFRESH=false',
      'DB_MIGRATIONS_FREEZE_AT=revoke-extra-lifecycle-postgres-grants','MULTI_TENANT=false',
      'PG_QUEUE_ENABLE=false','PG_QUEUE_WORKERS_ENABLE=false','VECTOR_STORE_MIGRATIONS_ENABLED=false',
      'AUTH_JWT_SECRET=local-preservation-only-no-service-started','STORAGE_BACKEND=file','TENANT_ID=local-preservation',
    ].join('\n'),{flag:'wx',mode:0o600});
    const migrate = spawnSync('docker',['run','--name',`idea-vault-storage-migrate-${stamp}`,'--network',target.network,
      '--env-file',envFile,'--entrypoint','node',image,'dist/scripts/migrate-call.js'],
    {encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:16*1024*1024});
    await writeFile(path.join(targetDir,`storage-migrate-${stamp}.private.log`),`${migrate.stdout ?? ''}\n${migrate.stderr ?? ''}`,{flag:'wx',mode:0o600});
    if (migrate.status !== 0) throw new Error('Local Storage migrations failed; private logs and restore point retained');
  }
  const names = payload.database.tables.map((t) => `(${lit(t.schema)},${lit(t.name)})`).join(',');
  const metadata = JSON.parse(sql(`SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'name',c.relname,'columns',
    (SELECT json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'generated',a.attgenerated,'identity',a.attidentity,'required',a.attnotnull))
      FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped))),'[]'::json)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND (n.nspname,c.relname) IN (${names});`));
  const union = metadata.map((table) => `SELECT ${lit(table.schema)}::text AS schema,${lit(table.name)}::text AS name,
    coalesce(json_agg(to_jsonb(t)::text ORDER BY to_jsonb(t)::text COLLATE "C"),'[]'::json) AS rows FROM ${ident(table.schema)}.${ident(table.name)} t`).join(' UNION ALL ');
  const rows = JSON.parse(sql(`SELECT json_agg(to_jsonb(t)) FROM (${union}) t;`));
  const local = metadata.map((table) => ({ ...table, rows: rows.find((r) => r.schema === table.schema && r.name === table.name).rows }));
  let tables = compareServiceTables(payload, local);
  if (restoreAuth || restoreStorage) {
    const allowed = new Set(restoreStorage ? ['storage.buckets','storage.objects'] : ['auth.identities','auth.mfa_amr_claims','auth.one_time_tokens','auth.refresh_tokens','auth.sessions']);
    const pending = tables.filter((t) => allowed.has(t.table));
    if (pending.length !== allowed.size || pending.some((t) => t.status !== 'compatible-empty-target-needs-restore')) throw new Error('Expected compatible empty service tables required; no overwrite permitted');
    if (restoreStorage && payload.database.tables.find((t) => t.schema === 'storage' && t.name === 'buckets').rows
      .some((row) => { const bucket=JSON.parse(row); return bucket.lifecycle_configuration !== null || bucket.lifecycle_configuration_generation !== null; })) throw new Error('Bucket lifecycle insert side effects require separate review');
    if (docker(['ps','--filter',`network=${target.network}`,'--format','{{.Names}}']) !== container) throw new Error('Stop other services before restoring session data');
    const sourceRelations = payload.catalog.relations.filter((r) => pending.some((p) => p.table === `${payload.catalog.namespaces.find((n) => n.oid === r.relnamespace)?.nspname}.${r.relname}`));
    const remaining = new Map(sourceRelations.map((r) => [r.oid,r]));
    const ordered = [];
    while (remaining.size) {
      const next = [...remaining.values()].find((r) => !(payload.catalog.constraints ?? []).some((c) => c.contype === 'f' && c.conrelid === r.oid && c.confrelid !== r.oid && remaining.has(c.confrelid)));
      if (!next) throw new Error('Service dependency cycle requires review');
      remaining.delete(next.oid); ordered.push(next);
    }
    const statements = ['BEGIN;', 'SET LOCAL standard_conforming_strings=on;', "SET LOCAL statement_timeout='60s';"];
    for (const relation of ordered) {
      const schema = payload.catalog.namespaces.find((n) => n.oid === relation.relnamespace).nspname;
      const source = payload.database.tables.find((t) => t.schema === schema && t.name === relation.relname);
      const columns = payload.catalog.columns.filter((c) => c.attrelid === relation.oid && !c.attgenerated).sort((a,b) => a.attnum-b.attnum);
      if (columns.some((c) => c.attidentity)) throw new Error('Identity-column restore requires review');
      const names = columns.map((c) => ident(c.attname)).join(',');
      const full = `${ident(schema)}.${ident(source.name)}`;
      for (const row of source.rows) statements.push(`INSERT INTO ${full} (${names}) SELECT ${names} FROM json_populate_record(NULL::${full},${lit(row)}::json);`);
    }
    statements.push('COMMIT;');
    const restoreSql = statements.join('\n');
    await writeFile(path.join(run, `restore-${restoreStorage ? 'storage' : 'auth'}-service-${Date.now()}.private.sql`), restoreSql, {flag:'wx',mode:0o600});
    docker(['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1','-Atq'],restoreSql);
    const checked = JSON.parse(sql(`SELECT json_agg(to_jsonb(t)) FROM (${union}) t;`));
    const updated = metadata.map((table) => ({...table,rows:checked.find((r) => r.schema === table.schema && r.name === table.name).rows}));
    tables = compareServiceTables(payload,updated);
    if (tables.some((t) => allowed.has(t.table) && t.status !== 'columns-and-rows-match')) throw new Error('Service restored rows do not match; preserve local evidence');
  }
  const summary = tables.reduce((result, table) => { result[table.status] = (result[table.status] ?? 0) + 1; return result; }, {});
  const storageHistory = local.find((t) => t.schema === 'storage' && t.name === 'migrations');
  const migrationHistory = storageHistory ? compareStorageHistory(payload.database.tables.find((t) => t.schema === 'storage' && t.name === 'migrations').rows,storageHistory.rows) : null;
  const realtimeHistory=local.find((t) => t.schema==='realtime' && t.name==='schema_migrations');
  const realtimeMigrationVersionsMatch=realtimeHistory ? isDeepStrictEqual(
    payload.database.tables.find((t) => t.schema==='realtime' && t.name==='schema_migrations').rows.map((r) => JSON.parse(r).version).sort(),
    realtimeHistory.rows.map((r) => JSON.parse(r).version).sort()) : null;
  const localCatalog=JSON.parse(sql(`SELECT json_build_object(
    'policies',(SELECT coalesce(json_agg(to_jsonb(p)),'[]') FROM pg_policies p WHERE schemaname IN ('public','auth','storage','realtime')),
    'constraints',(SELECT coalesce(json_agg(json_build_object('table',n.nspname||'.'||r.relname,'name',c.conname,'definition',pg_get_constraintdef(c.oid,true))),'[]') FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE (n.nspname,r.relname) IN (${names})),
    'indexes',(SELECT coalesce(json_agg(to_jsonb(i)),'[]') FROM pg_indexes i WHERE (schemaname,tablename) IN (${names})),
    'triggers',(SELECT coalesce(json_agg(json_build_object('table',n.nspname||'.'||r.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid,true))),'[]') FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE NOT t.tgisinternal AND (n.nspname,r.relname) IN (${names})),
    'security',(SELECT coalesce(json_agg(json_build_object('table',n.nspname||'.'||r.relname,'rls',r.relrowsecurity,'force',r.relforcerowsecurity)),'[]') FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace WHERE r.relkind IN ('r','p') AND (n.nspname,r.relname) IN (${names}))
  );`));
  const fullName=(oid) => { const r=payload.catalog.relations.find((r) => r.oid===oid); return r ? payload.catalog.namespaces.find((n) => n.oid===r.relnamespace).nspname+'.'+r.relname : null; };
  const captured=new Set(payload.database.tables.map((t) => t.schema+'.'+t.name));
  const sourceCatalog={
    policies:(payload.catalog.policies ?? []).filter((p) => ['public','auth','storage','realtime'].includes(p.schemaname)),
    constraints:(payload.catalog.constraints ?? []).filter((c) => captured.has(fullName(c.conrelid))).map((c) => ({table:fullName(c.conrelid),name:c.conname,definition:c.definition})),
    indexes:(payload.catalog.indexes ?? []).filter((i) => captured.has(i.schemaname+'.'+i.tablename)),
    triggers:(payload.catalog.triggers ?? []).filter((t) => captured.has(fullName(t.tgrelid))).map((t) => ({table:fullName(t.tgrelid),name:t.tgname,definition:t.definition})),
    security:payload.catalog.relations.filter((r) => captured.has(fullName(r.oid)) && ['r','p'].includes(r.relkind)).map((r) => ({table:fullName(r.oid),rls:r.relrowsecurity,force:r.relforcerowsecurity})),
  };
  const catalogComparison=Object.fromEntries(Object.keys(sourceCatalog).map((category) => {
    const key=(r) => category==='policies' ? r.schemaname+'.'+r.tablename+'.'+r.policyname : category==='indexes' ? r.schemaname+'.'+r.tablename+'.'+r.indexname : r.table+(r.name ? '.'+r.name : '');
    const source=sourceCatalog[category], actual=localCatalog[category];
    return [category,{sourceCount:source.length,localCount:actual.length,
      missing:source.filter((r) => !actual.some((a) => key(a)===key(r))).map(key),
      changed:source.filter((r) => actual.some((a) => key(a)===key(r) && !isDeepStrictEqual(a,r))).map(key),
      additional:actual.filter((a) => !source.some((r) => key(r)===key(a))).map(key)}];
  }));
  const grantsQuery=(relations) => `SELECT coalesce(json_agg(to_jsonb(g)),'[]') FROM (${relations}) g;`;
  const grantProjection="e.privilege_type, e.is_grantable, CASE WHEN e.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(e.grantee) END AS grantee";
  const archivedGrants=payload.catalog.relations.filter((r) => captured.has(fullName(r.oid)) && ['r','p'].includes(r.relkind)).map((r) => {
    const owner=payload.catalog.roles_without_passwords.find((role) => role.oid===r.relowner)?.rolname;
    if (!owner) throw new Error('Archived table owner missing');
    const acl=r.relacl ? `ARRAY[${r.relacl.map(lit).join(',')}]::aclitem[]` : `acldefault('r',(SELECT oid FROM pg_roles WHERE rolname=${lit(owner)}))`;
    return `SELECT ${lit(fullName(r.oid))} AS table,${grantProjection} FROM aclexplode(${acl}) e`;
  }).join(' UNION ALL ');
  const sourcePrivileges=JSON.parse(sql(grantsQuery(archivedGrants)));
  const localPrivileges=JSON.parse(sql(grantsQuery(`SELECT n.nspname||'.'||r.relname AS table,${grantProjection} FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) e WHERE r.relkind IN ('r','p') AND (n.nspname,r.relname) IN (${names})`)));
  const normalizePrivileges=(rows) => rows.map((r) => JSON.stringify([r.table,r.grantee,r.privilege_type,r.is_grantable])).sort();
  const privileges={sourceCount:sourcePrivileges.length,localCount:localPrivileges.length,exactPrivilegesAndGrantOptionsMatch:isDeepStrictEqual(normalizePrivileges(sourcePrivileges),normalizePrivileges(localPrivileges))};
  const owner=JSON.parse(payload.database.tables.find((t) => t.schema==='auth' && t.name==='users').rows[0]).id;
  const readAccess=[];
  for (const table of payload.database.tables.filter((t) => t.schema==='public' || (t.schema==='storage' && t.name==='objects'))) {
    const full=`${ident(table.schema)}.${ident(table.name)}`;
    const expected=table.rows.filter((row) => { const value=JSON.parse(row); return table.schema==='storage' ? value.name.split('/')[0]===owner : value.user_id===owner; }).length;
    const countAs=(role,id) => Number(sql(`SET LOCAL ROLE ${ident(role)}; SET LOCAL "request.jwt.claim.sub"=${lit(id)}; SELECT count(*) FROM ${full};`));
    const ownerCount=countAs('authenticated',owner), otherCount=countAs('authenticated','00000000-0000-0000-0000-000000000001');
    const anonCanRead=sql(`SELECT has_table_privilege('anon',${lit(full)},'SELECT');`)==='t';
    const anonymousCount=anonCanRead ? countAs('anon','') : 0;
    readAccess.push({table:table.schema+'.'+table.name,expectedOwnerRows:expected,ownerRows:ownerCount,unrelatedRows:otherCount,anonymousRows:anonymousCount,passed:ownerCount===expected && otherCount===0 && anonymousCount===0});
  }
  const sequencePositions=[];
  const sequences=JSON.parse(sql(`SELECT coalesce(json_agg(json_build_object('schema',sn.nspname,'name',s.relname,'tableSchema',tn.nspname,'tableName',t.relname,'column',a.attname)),'[]') FROM pg_class s JOIN pg_namespace sn ON sn.oid=s.relnamespace JOIN pg_depend d ON d.objid=s.oid AND d.deptype IN ('a','i') JOIN pg_class t ON t.oid=d.refobjid JOIN pg_namespace tn ON tn.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid WHERE s.relkind='S' AND (tn.nspname,t.relname) IN (${names});`));
  for (const sequence of sequences) {
    const position=JSON.parse(sql(`SELECT json_build_object('lastValue',s.last_value::text,'called',s.is_called,'maxRowValue',(SELECT max(${ident(sequence.column)})::text FROM ${ident(sequence.tableSchema)}.${ident(sequence.tableName)})) FROM ${ident(sequence.schema)}.${ident(sequence.name)} s;`));
    const safe=position.maxRowValue===null || (BigInt(position.lastValue)+(position.called ? 1n : 0n))>BigInt(position.maxRowValue);
    sequencePositions.push({...sequence,...position,nextValueAboveExistingRows:safe});
  }
  if (repairSequences) {
    const histories=new Set(['storage.migrations','realtime.schema_migrations']);
    if (tables.some((t) => !histories.has(t.table) && t.status!=='columns-and-rows-match') || !privileges.exactPrivilegesAndGrantOptionsMatch
      || !migrationHistory?.identifiersAndHashesMatch || !realtimeMigrationVersionsMatch || readAccess.some((r) => !r.passed)
      || Object.values(catalogComparison).some((c) => c.missing.length || c.changed.length || c.additional.length)
      || docker(['ps','--filter',`network=${target.network}`,'--format','{{.Names}}'])!==container) throw new Error('Full local recovery checks required before sequence adjustment');
    const pending=sequencePositions.filter((s) => !s.nextValueAboveExistingRows);
    if (pending.some((s) => s.schema!=='auth' || s.name!=='refresh_tokens_id_seq' || s.tableSchema!=='auth' || s.tableName!=='refresh_tokens' || s.column!=='id')) throw new Error('Unreviewed sequence adjustment refused');
    if (sql("SELECT seqincrement::text||','||seqcycle::text FROM pg_sequence WHERE seqrelid='auth.refresh_tokens_id_seq'::regclass;")!=='1,false') throw new Error('Sequence increment/cycle requires review');
    await writeFile(path.join(run,`sequence-before-${Date.now()}.private.json`),JSON.stringify(sequencePositions,null,2),{flag:'wx',mode:0o600});
    for (const sequence of pending) {
      docker(['exec','-i',container,'psql','-U','supabase_admin','-d','postgres','-X','-v','ON_ERROR_STOP=1','-Atq'],
        `BEGIN; SET LOCAL statement_timeout='60s'; LOCK TABLE auth.refresh_tokens IN ACCESS EXCLUSIVE MODE;
SELECT setval('auth.refresh_tokens_id_seq',greatest((SELECT last_value FROM auth.refresh_tokens_id_seq),(SELECT max(id) FROM auth.refresh_tokens)),true); COMMIT;`);
      const position=JSON.parse(sql("SELECT json_build_object('lastValue',s.last_value::text,'called',s.is_called,'maxRowValue',(SELECT max(id)::text FROM auth.refresh_tokens)) FROM auth.refresh_tokens_id_seq s;"));
      Object.assign(sequence,position,{nextValueAboveExistingRows:BigInt(position.lastValue)+(position.called ? 1n : 0n)>BigInt(position.maxRowValue),adjustedLocally:true});
      if (!sequence.nextValueAboveExistingRows) throw new Error('Sequence adjustment verification failed');
    }
  }
  let databaseWorkflowVerified=false;
  if (verifyWorkflows) {
    if (tables.some((t) => !['storage.migrations','realtime.schema_migrations'].includes(t.table) && t.status!=='columns-and-rows-match')
      || readAccess.some((r) => !r.passed) || !privileges.exactPrivilegesAndGrantOptionsMatch
      || docker(['ps','--filter',`network=${target.network}`,'--format','{{.Names}}'])!==container) throw new Error('Verified recovered local database required for workflow checks');
    const id=randomUUID(), rejectedId=randomUUID();
    const workflowSql=`BEGIN; SET LOCAL statement_timeout='60s'; SET LOCAL standard_conforming_strings=on;
SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.sub"=${lit(owner)};
INSERT INTO public.ideas (id,user_id,content,status,tags) VALUES (${lit(id)},${lit(owner)},'preservation workflow check','raw',ARRAY['preservation-check']);
UPDATE public.ideas SET content='preservation workflow edited',status='building' WHERE id=${lit(id)};
DO $check$ BEGIN IF (SELECT count(*) FROM public.ideas WHERE id=${lit(id)} AND content ILIKE '%workflow edited%' AND status='building' AND tags @> ARRAY['preservation-check'])<>1 THEN RAISE EXCEPTION 'Owner edit/filter check failed'; END IF; END $check$;
SET LOCAL "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
DO $check$ DECLARE affected integer; BEGIN
UPDATE public.ideas SET content='unexpected unrelated edit' WHERE id=${lit(id)}; GET DIAGNOSTICS affected=ROW_COUNT;
IF affected<>0 THEN RAISE EXCEPTION 'Unrelated update was allowed'; END IF;
DELETE FROM public.ideas WHERE id=${lit(id)}; GET DIAGNOSTICS affected=ROW_COUNT;
IF affected<>0 THEN RAISE EXCEPTION 'Unrelated delete was allowed'; END IF;
BEGIN INSERT INTO public.ideas (id,user_id,content,status,tags) VALUES (${lit(rejectedId)},${lit(owner)},'forbidden','raw','{}');
RAISE EXCEPTION 'Cross-owner insert was allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $check$;
SET LOCAL "request.jwt.claim.sub"=${lit(owner)};
DELETE FROM public.ideas WHERE id=${lit(id)};
DO $check$ BEGIN IF EXISTS(SELECT 1 FROM public.ideas WHERE id=${lit(id)}) THEN RAISE EXCEPTION 'Owner delete failed'; END IF; END $check$;
ROLLBACK;`;
    await writeFile(path.join(run,`verify-local-workflow-${Date.now()}.private.sql`),workflowSql,{flag:'wx',mode:0o600});
    docker(['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-v','ON_ERROR_STOP=1','-Atq'],workflowSql);
    if (sql(`SELECT count(*) FROM public.ideas WHERE id IN (${lit(id)},${lit(rejectedId)});`)!=='0') throw new Error('Workflow test records remain; preserve evidence');
    databaseWorkflowVerified=true;
  }
  const report = { capturedAt: new Date().toISOString(), operation: verifyWorkflows ? 'local-rolled-back-database-workflow-and-audit' : repairSequences ? 'local-sequence-readiness-adjustment-and-audit' : restoreDefinitions ? 'local-supplemental-definitions-and-audit' : initializeRealtime ? 'local-official-realtime-initialize-and-audit' : initializeStorage ? 'local-official-storage-initialize-and-audit' : restoreStorage ? 'local-compatible-storage-metadata-restore-and-audit' : restoreAuth ? 'local-compatible-auth-restore-and-audit' : 'local-read-only-audit', summary, tables, migrationHistory, realtimeMigrationVersionsMatch, catalogComparison, privileges, readAccess, sequencePositions, databaseWorkflowVerified,
    limitations: ['Compared captured table columns/rows, policies, constraints, indexes, triggers, RLS flags and table privilege/grant options; function bodies and API behavior are not fully verified',
      'Empty matching tables are not proof of full service recovery',
      verifyWorkflows ? 'Owner database CRUD/filter and cross-owner mutation denial checked in a rolled-back transaction; browser/API workflows remain unverified' : repairSequences ? 'Local refresh-token sequence advanced above recovered row IDs; original production sequence position is unknown; data rows unchanged' : restoreDefinitions ? 'Three archived Storage policies and four Auth indexes restored; no data rows written' : initializeRealtime ? 'Official Realtime tenant migrations only; local execution timestamps retained; no API or replication started' : initializeStorage ? 'Official Storage migrations only; archived metadata not restored; migration execution timestamps differ' : restoreStorage ? 'Bucket and object metadata restored; attachment bytes and API/policy behavior unverified' : restoreAuth ? 'Five reviewed Auth tables restored; sequence current values and login/session behavior not verified' : 'No rows written',
      'No services started, production accessed or attachment bytes downloaded'] };
  await writeFile(path.join(run, `service-recovery-audit-${Date.now()}.private.json`), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ summary, migrationHistory, realtimeMigrationVersionsMatch, catalogComparison, privileges, readAccess, databaseWorkflowVerified,
    sequenceReadiness:sequencePositions.map((s) => ({sequence:s.schema+'.'+s.name,nextValueAboveExistingRows:s.nextValueAboveExistingRows})),outstanding: tables.filter((t) => t.status !== 'columns-and-rows-match') }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Audit failed'); process.exitCode = 1;
});
