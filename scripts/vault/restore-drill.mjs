#!/usr/bin/env node
// Phase 6A: restores a live backup into a fresh, disposable, offline Postgres (Docker, no network)
// and checks it: every table's row count and content fingerprint, every file's hash, and the
// security catalog (RLS, policies, grants, functions, triggers, buckets) against production's.
//
// Usage (PowerShell):
//   $env:VAULT_BACKUP_PASSPHRASE = <the backup's passphrase>
//   node scripts/vault/restore-drill.mjs <backup.vaultlive> <report folder outside the repo>
//
// It touches nothing but its own container, which it removes at the end. It proves the database
// rows, permissions and file bytes. It cannot prove Supabase Auth logins, the Storage API or the
// running app; the report says so.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { CATALOG_SQL, assertOutsideRepo, compareCatalogs, decryptArchive, quoteIdent, sha256, tableDigest, verifyFiles } from './live-archive.mjs';

const IMAGE = 'public.ecr.aws/supabase/postgres:17.11.0.018';
const repo = path.resolve(import.meta.dirname, '..', '..');
const log = (line) => process.stdout.write(`${line}\n`);

function docker(argv, input) {
  const r = spawnSync('docker', argv, { encoding: 'utf8', input, maxBuffer: 512 * 1024 * 1024, windowsHide: true, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
  if (r.status !== 0) throw new Error(`docker ${argv[0]} failed: ${String(r.stderr).trim().split('\n').slice(-2).join(' ')}`);
  return r.stdout;
}

async function main() {
  const [archivePath, reportDir] = process.argv.slice(2);
  if (!archivePath || !reportDir) throw new Error('Usage: restore-drill.mjs <backup.vaultlive> <report folder outside the repo>');
  const out = assertOutsideRepo(reportDir);
  const archive = decryptArchive(JSON.parse(fs.readFileSync(archivePath, 'utf8')), process.env.VAULT_BACKUP_PASSPHRASE);
  log(`Backup of ${archive.projectRef} taken ${archive.createdAt}: ${Object.keys(archive.tables).length} tables, ${archive.files.length} files.`);

  const report = { archive: path.basename(archivePath), backupTakenAt: archive.createdAt, drillAt: new Date().toISOString(), tables: {}, files: {}, catalog: [], notes: [] };
  const badFiles = verifyFiles(archive);
  report.files = { count: archive.files.length, bytes: archive.files.reduce((n, f) => n + f.size, 0), mismatched: badFiles };
  const migrationDrift = Object.entries(archive.migrations ?? {}).filter(([file, hash]) => {
    const local = path.join(repo, 'supabase', file);
    return !fs.existsSync(local) || hash !== sha256(fs.readFileSync(local));
  }).map(([file]) => file);
  if (migrationDrift.length) report.notes.push(`Migrations changed since the backup: ${migrationDrift.join(', ')}. The restore uses today's files.`);

  const name = `ivdrill-${randomBytes(4).toString('hex')}`;
  docker(['run', '-d', '--name', name, '--network', 'none', '-e', 'POSTGRES_PASSWORD=disposable-local-only', IMAGE]);
  try {
    for (let i = 0; i < 60; i++) {
      if (spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres', '-h', 'localhost'], { windowsHide: true }).status === 0) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    await new Promise((r) => setTimeout(r, 8000));
    const psql = (sql) => docker(['exec', '-i', name, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres', '-q', '-At'], sql);

    // Schema from today's migrations, in order, on top of the Storage stand-in.
    const migrations = fs.readdirSync(path.join(repo, 'supabase')).filter((f) => /^(schema|\d{3}_.*)\.sql$/.test(f))
      .sort((a, b) => (a === 'schema.sql' ? -1 : b === 'schema.sql' ? 1 : a.localeCompare(b)));
    psql(fs.readFileSync(path.join(repo, 'scripts', 'vault', 'drill', 'storage-standin.sql'), 'utf8'));
    for (const file of migrations) psql(fs.readFileSync(path.join(repo, 'supabase', file), 'utf8'));
    log(`Applied the Storage stand-in and ${migrations.length} migrations.`);

    // Tables production has but the migrations don't create are rebuilt from the captured columns.
    const existing = new Set(psql("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'").split('\n').filter(Boolean));
    for (const table of Object.keys(archive.tables).filter((t) => !existing.has(t))) {
      const cols = archive.catalog.columns.filter((c) => c.table === table);
      const def = cols.map((c) => `${quoteIdent(c.column)} ${c.type === 'ARRAY' ? `${c.udt.replace(/^_/, '')}[]` : c.type === 'USER-DEFINED' ? c.udt : c.type}`).join(', ');
      psql(`create table public.${quoteIdent(table)} (${def});`);
      report.notes.push(`public.${table} isn't created by any migration; rebuilt from its captured columns (no keys, policies or grants).`);
    }

    // Data, with triggers and foreign-key checks off so rows load exactly as they were.
    const tag = `vd_${randomBytes(8).toString('hex')}`;
    const literal = (rows) => `$${tag}$[${rows.join(',')}]$${tag}$`;
    let load = 'set session_replication_role = replica;\n';
    // The drill image's auth.users may be an older layout; load the account columns both sides have.
    const authColumns = new Set(psql("select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'users'").split('\n').filter(Boolean));
    const wanted = ['id', 'aud', 'role', 'email', 'email_confirmed_at', 'last_sign_in_at', 'raw_app_meta_data', 'raw_user_meta_data', 'created_at', 'updated_at'];
    const usable = wanted.filter((c) => authColumns.has(c));
    if (usable.length < wanted.length) report.notes.push(`Account columns not in the drill image's auth.users, so not restored: ${wanted.filter((c) => !authColumns.has(c)).join(', ')}.`);
    load += `insert into auth.users (${usable.join(', ')}) select ${usable.join(', ')}
      from jsonb_populate_recordset(null::auth.users, ${literal(archive.authUsers)}::jsonb);\n`;
    for (const b of archive.storage.buckets) {
      load += `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) select id, name, public, file_size_limit, allowed_mime_types
        from jsonb_populate_record(null::storage.buckets, $${tag}$${JSON.stringify(b)}$${tag}$::jsonb)
        on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;\n`;
    }
    load += `insert into storage.objects (id, bucket_id, name, owner, created_at, metadata) select id, bucket_id, name, owner, created_at, metadata
      from jsonb_populate_recordset(null::storage.objects, ${literal(archive.storage.objects.map((o) => JSON.stringify(o)))}::jsonb);\n`;
    for (const [table, rows] of Object.entries(archive.tables)) {
      // Rows created by migrations themselves (none today) would clash; start each table empty.
      load += `delete from public.${quoteIdent(table)};\n`;
      if (rows.length) load += `insert into public.${quoteIdent(table)} overriding system value select * from jsonb_populate_recordset(null::public.${quoteIdent(table)}, ${literal(rows)}::jsonb);\n`;
    }
    load += 'set session_replication_role = origin;\n';
    psql(load);
    log('Loaded the backup into the disposable database.');

    // Compare every table's fingerprint with the one taken from production.
    let mismatched = 0;
    for (const [table, expected] of Object.entries(archive.digests)) {
      const rows = psql(`select row_to_json(t)::text from public.${quoteIdent(table)} t`).split('\n').filter(Boolean);
      const actual = tableDigest(rows);
      const ok = actual.count === expected.count && actual.sha256 === expected.sha256;
      if (!ok) mismatched++;
      report.tables[table] = { expected: expected.count, restored: actual.count, identical: ok };
    }
    report.catalog = compareCatalogs(archive.catalog, JSON.parse(psql(CATALOG_SQL).trim()));
    report.summary = {
      tables: Object.keys(report.tables).length, identicalTables: Object.keys(report.tables).length - mismatched,
      filesOk: badFiles.length === 0, catalogDifferences: report.catalog.length,
      notCovered: 'Supabase Auth logins, the Storage API (serving files), Vercel and the running app are not part of this drill.',
    };
  } finally {
    spawnSync('docker', ['rm', '-f', name], { windowsHide: true });
  }

  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `drill-${report.drillAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2), { flag: 'wx' });
  const s = report.summary;
  log(`Tables identical: ${s.identicalTables} of ${s.tables}. Files: ${s.filesOk ? 'all hashes match' : `${badFiles.length} mismatched`}. Catalog differences: ${s.catalogDifferences}.`);
  for (const note of report.notes) log(`Note: ${note}`);
  log(`Report: ${file}`);
  if (s.identicalTables !== s.tables || !s.filesOk) process.exitCode = 2;
}

main().catch((error) => { process.stderr.write(`Drill failed: ${error.message}\n`); process.exitCode = 1; });
