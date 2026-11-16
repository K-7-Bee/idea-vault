import { spawnSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const root = 'S:\\Road to Storm K7\\codex test\\idea-vault-preservation';
const project = 'kpeyjktueihyxtsfnsyr';
const limit = 64 * 1024 * 1024;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const ident = (s) => '"' + s.replaceAll('"', '""') + '"';
const literal = (s) => "'" + s.replaceAll("'", "''") + "'";

export function encryptPayload(payload, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid encryption key');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('idea-vault-logical-snapshot-v1'));
  const plaintext = Buffer.from(JSON.stringify(payload));
  if (plaintext.length > limit) throw new Error('Snapshot exceeds reviewed 64 MiB limit');
  return { format: 'idea-vault-logical-snapshot-v1', iv: iv.toString('base64'),
    ciphertext: Buffer.concat([cipher.update(plaintext), cipher.final()]).toString('base64'),
    tag: cipher.getAuthTag().toString('base64') };
}

export function decryptPayload(envelope, key) {
  if (envelope.format !== 'idea-vault-logical-snapshot-v1') throw new Error('Invalid archive format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(Buffer.from(envelope.format));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]));
}

export function verifyTables(tables) {
  const seen = new Set();
  for (const table of tables) {
    const name = `${table.schema}.${table.name}`;
    if (seen.has(name) || !Array.isArray(table.rows) || Number(table.count) !== table.rows.length) throw new Error('Table inventory mismatch');
    for (const row of table.rows) {
      if (typeof row !== 'string' || !row.startsWith('{')) throw new Error('Original PostgreSQL JSON row text required');
      JSON.parse(row); // Validate only; retain original text to preserve arbitrary-precision numbers.
    }
    seen.add(name);
  }
  for (const name of ['public.ideas', 'public.idea_files', 'public.timevault_state', 'auth.users', 'storage.objects', 'storage.buckets']) {
    if (!seen.has(name)) throw new Error('Required live table missing');
  }
}

async function capture(run) {
  const key = Buffer.from(process.env.VAULT_SNAPSHOT_KEY || '', 'base64');
  delete process.env.VAULT_SNAPSHOT_KEY;
  if (key.length !== 32) throw new Error('A protected snapshot key is required');
  const cli = path.join(root, 'tools/node_modules/supabase/dist/supabase.js');
  const workdir = path.join(root, 'tools');
  async function query(sql, label) {
    const file = path.join(run, `${label}.sql`);
    await writeFile(file, sql, { flag: 'wx', mode: 0o600 });
    const result = spawnSync(process.execPath, [cli, 'db', 'query', `--remote=${project}`, '--read-only', '--workdir', workdir, '--output', 'json', '--file', file],
      { encoding: 'utf8', maxBuffer: limit, timeout: 120000, windowsHide: true });
    if (result.status !== 0) throw new Error(`Read-only query failed: ${label} (private output suppressed)`);
    let response;
    try { response = JSON.parse(result.stdout); } catch { throw new Error(`Invalid CLI JSON: ${label}`); }
    if (!Array.isArray(response.rows) || response.rows.length !== 1) throw new Error('Unexpected query response');
    return response.rows[0];
  }
  const schemas = "('public','auth','storage','vault','supabase_functions','supabase_migrations','realtime')";
  const inventorySql = `SELECT current_setting('transaction_read_only') AS read_only,
    (SELECT jsonb_agg(jsonb_build_object('schema', n.nspname, 'name', c.relname) ORDER BY n.nspname,c.relname)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind IN ('r','p') AND NOT c.relispartition AND n.nspname IN ${schemas}) AS tables;`;
  const inventory = await query(inventorySql, 'inventory');
  if (inventory.read_only !== 'on') throw new Error('Read-only boundary not established');
  const union = inventory.tables.map((table) => `SELECT ${literal(table.schema)} AS schema, ${literal(table.name)} AS name,
    count(*) AS count, coalesce(jsonb_agg(to_jsonb(t)::text ORDER BY to_jsonb(t)::text COLLATE "C"),'[]'::jsonb) AS rows
    FROM ${ident(table.schema)}.${ident(table.name)} t`).join('\nUNION ALL\n');
  const sql = `SELECT current_setting('transaction_read_only') AS read_only, current_setting('server_version') AS server_version,
    (SELECT jsonb_agg(to_jsonb(all_tables) ORDER BY schema,name) FROM (${union}) all_tables) AS tables;`;
  const before = await query(sql, 'rows-before');
  if (before.read_only !== 'on') throw new Error('Read-only boundary not established');
  verifyTables(before.tables);
  console.log(`Captured ${before.tables.length} tables; private row content suppressed.`);
  const catalogSql = `SELECT
    (SELECT jsonb_agg(to_jsonb(e)) FROM pg_extension e) AS extensions,
    (SELECT jsonb_agg(to_jsonb(r)) FROM pg_roles r) AS roles_without_passwords,
    (SELECT jsonb_agg(to_jsonb(m)) FROM pg_auth_members m) AS role_memberships,
    (SELECT jsonb_agg(to_jsonb(n)) FROM pg_namespace n WHERE nspname IN ${schemas}) AS namespaces,
    (SELECT jsonb_agg(to_jsonb(c)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${schemas}) AS relations,
    (SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('sql_type',format_type(a.atttypid,a.atttypmod))) FROM pg_attribute a
      JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${schemas} AND a.attnum>0 AND NOT a.attisdropped) AS columns,
    (SELECT jsonb_agg(to_jsonb(d)||jsonb_build_object('definition',pg_get_expr(d.adbin,d.adrelid))) FROM pg_attrdef d JOIN pg_class c ON c.oid=d.adrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${schemas}) AS defaults,
    (SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('definition',pg_get_constraintdef(c.oid,true))) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN ${schemas}) AS constraints,
    (SELECT jsonb_agg(to_jsonb(i)) FROM pg_indexes i WHERE schemaname IN ${schemas}) AS indexes,
    (SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname IN ${schemas}) AS policies,
    (SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('definition',pg_get_functiondef(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ${schemas} AND p.prokind IN ('f','p')) AS functions,
    (SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('definition',pg_get_triggerdef(t.oid,true))) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${schemas} AND NOT t.tgisinternal) AS triggers,
    (SELECT jsonb_agg(to_jsonb(t)) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ${schemas}) AS types,
    (SELECT jsonb_agg(to_jsonb(e)) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ${schemas}) AS enums,
    (SELECT jsonb_agg(to_jsonb(v)) FROM pg_views v WHERE schemaname IN ${schemas}) AS views,
    (SELECT jsonb_agg(to_jsonb(g)) FROM information_schema.role_table_grants g WHERE table_schema IN ${schemas}) AS table_grants;`;
  const catalog = await query(catalogSql, 'catalog');
  await writeFile(path.join(run, 'database.partial.encrypted.json'), JSON.stringify(encryptPayload({ status: 'incomplete-no-files-or-consistency-verification', database: before, catalog }, key)), { flag: 'wx', mode: 0o600 });
  const objectTable = before.tables.find((t) => t.schema === 'storage' && t.name === 'objects');
  const objects = [];
  const after = await query(sql, 'rows-after');
  const inventoryAfter = await query(inventorySql, 'inventory-after');
  verifyTables(after.tables);
  if (after.read_only !== 'on' || !isDeepStrictEqual(before, after) || !isDeepStrictEqual(inventory, inventoryAfter)) throw new Error('Source changed during capture; retain incomplete run and repeat');
  const payload = { format: 'idea-vault-logical-snapshot-v1', source: project, captured_at: new Date().toISOString(),
    kind: 'logical-data-and-catalog', database: before, catalog, objects,
    attachmentsCaptured: false,
    limitations: ['Not pg_dump SQL; no tested application restore yet', 'Role passwords and external encryption/configuration keys not exported',
      'Device preservation confirmed by owner; browser archives not independently inspected', 'Schemas limited to explicitly inventoried application, auth, storage and service namespaces'] };
  const archive = path.join(run, 'snapshot.encrypted.json');
  await writeFile(archive, JSON.stringify(encryptPayload(payload, key)), { flag: 'wx', mode: 0o600 });
  const verified = decryptPayload(JSON.parse(await readFile(archive, 'utf8')), key);
  if (!isDeepStrictEqual(payload, verified)) throw new Error('Decrypted payload mismatch');
  for (const object of verified.objects) if (hash(Buffer.from(object.data_base64, 'base64')) !== object.sha256) throw new Error('Archived object hash mismatch');
  const report = { status: 'encrypted-database-snapshot-verified-attachments-pending', tables: before.tables.map(({ schema, name, count }) => ({ schema, name, count })),
    attachmentMetadataObjects: objectTable.rows.length,
    objects: objects.length, objectBytes: objects.reduce((n, o) => n + o.size, 0), archiveBytes: (await stat(archive)).size,
    archiveSha256: hash(await readFile(archive)), sourceBeforeAfterMatch: true, encryptionVerified: true, restoreVerified: false };
  await writeFile(path.join(run, 'verification.private.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, tables: report.tables.length, objects: report.objects,
    objectBytes: report.objectBytes, archiveBytes: report.archiveBytes, sourceBeforeAfterMatch: true }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const run = process.argv[2];
    if (!run || process.argv.length !== 3) throw new Error('A fresh private run path is required; attachment downloads are disabled');
    const parent = await realpath(path.dirname(run));
    const approved = await realpath(root);
    if (parent !== approved || !/^run-\d{8}T\d{6}Z$/.test(path.basename(run))) throw new Error('Private direct-child run path required');
    await mkdir(run, { mode: 0o700 });
    await capture(run);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Snapshot failed; retain private incomplete artifacts');
    process.exitCode = 1;
  }
}
