#!/usr/bin/env node
// Phase 6A: a read-only, encrypted backup of the live Vault: every public table (found at run time),
// the account list (no password hashes), Storage settings and object list, the security catalog,
// and the bytes of every Storage object, each with a SHA-256.
//
// Usage (PowerShell; see scripts/vault/README.md):
//   $env:VAULT_BACKUP_PASSPHRASE = <from a password manager, read without echo>
//   node scripts/vault/backup-live.mjs --cli <path to supabase.js> --ref <project ref> --out <private folder outside the repo>
//
// It never writes to production. Avoid edits in the Vault while it runs (each table is read in its
// own query). Downloaded file bytes sit briefly in a temporary folder inside --out and are deleted
// after the archive is written.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { CATALOG_SQL, FORMAT, MAX_ROWS_PER_TABLE, assertOutsideRepo, cliQuery, cliStorageCopy, encryptArchive, quoteIdent, sha256, tableDigest } from './live-archive.mjs';

function args() {
  const out = {};
  const list = process.argv.slice(2);
  for (let i = 0; i < list.length; i += 2) {
    if (!['--cli', '--ref', '--out'].includes(list[i]) || !list[i + 1]) throw new Error('Usage: backup-live.mjs --cli <supabase.js> --ref <project ref> --out <folder outside the repo>');
    out[list[i].slice(2)] = list[i + 1];
  }
  if (!out.cli || !out.ref || !out.out) throw new Error('Usage: backup-live.mjs --cli <supabase.js> --ref <project ref> --out <folder outside the repo>');
  if (!/^[a-z0-9]{20}$/.test(out.ref)) throw new Error('The project ref is 20 lowercase letters and digits.');
  return out;
}

const log = (line) => process.stdout.write(`${line}\n`);

async function main() {
  const opts = args();
  const passphrase = process.env.VAULT_BACKUP_PASSPHRASE;
  if (!passphrase || passphrase.length < 16) throw new Error('Set VAULT_BACKUP_PASSPHRASE (at least 16 characters) before running.');
  const outDir = assertOutsideRepo(opts.out);
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const work = fs.mkdtempSync(path.join(outDir, `.backup-${stamp}-`));
  const workdir = path.resolve(path.dirname(opts.cli), '..', '..', '..');
  const query = (sql) => {
    const file = path.join(work, `${randomBytes(6).toString('hex')}.sql`);
    fs.writeFileSync(file, sql);
    try { return cliQuery({ cli: opts.cli, ref: opts.ref, workdir, sqlFile: file }); } finally { fs.rmSync(file, { force: true }); }
  };

  try {
    log(`Backing up project ${opts.ref} (read-only)...`);
    const tables = query("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1")
      .map((r) => r.table_name);
    const archive = { format: FORMAT, createdAt: new Date().toISOString(), projectRef: opts.ref, tables: {}, digests: {}, counts: {} };

    for (const table of tables) {
      const [{ n }] = query(`select count(*)::int as n from public.${quoteIdent(table)}`);
      if (n > MAX_ROWS_PER_TABLE) throw new Error(`public.${table} has ${n} rows; this tool reads tables whole and needs a paged method above ${MAX_ROWS_PER_TABLE}.`);
      const rows = query(`select row_to_json(t)::text as j from public.${quoteIdent(table)} t`).map((r) => r.j);
      if (rows.length !== n) throw new Error(`public.${table}: counted ${n} rows but exported ${rows.length}. Nothing was written; try again with the Vault idle.`);
      archive.tables[table] = rows;
      archive.counts[table] = n;
      archive.digests[table] = tableDigest(rows);
      log(`  public.${table}: ${n} rows`);
    }

    // Accounts without secrets: no password hashes, tokens or recovery codes.
    archive.authUsers = query(`select row_to_json(t)::text as j from (select id, aud, role, email, email_confirmed_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at from auth.users) t`).map((r) => r.j);
    archive.storage = {
      buckets: query('select row_to_json(t)::text as j from (select id, name, public, file_size_limit, allowed_mime_types from storage.buckets) t').map((r) => JSON.parse(r.j)),
      objects: query('select row_to_json(t)::text as j from (select id, bucket_id, name, owner, created_at, updated_at, metadata from storage.objects) t').map((r) => JSON.parse(r.j)),
    };
    archive.catalog = JSON.parse(query(CATALOG_SQL)[0].catalog);
    log(`  ${archive.authUsers.length} account(s), ${archive.storage.objects.length} stored file(s) in ${archive.storage.buckets.length} buckets`);

    // File bytes, bucket by bucket, checked against the object list.
    archive.files = [];
    for (const bucket of [...new Set(archive.storage.objects.map((o) => o.bucket_id))].sort()) {
      const target = path.join(work, 'files', bucket);
      fs.mkdirSync(target, { recursive: true });
      cliStorageCopy({ cli: opts.cli, ref: opts.ref, workdir, bucket, destination: target });
      for (const object of archive.storage.objects.filter((o) => o.bucket_id === bucket)) {
        const local = path.join(target, ...object.name.split('/'));
        if (!path.resolve(local).startsWith(path.resolve(target) + path.sep) || !fs.existsSync(local)) {
          throw new Error(`Storage object ${bucket}/${object.name} wasn't downloaded. Nothing was written.`);
        }
        const bytes = fs.readFileSync(local);
        const expected = Number(object.metadata?.size);
        if (Number.isFinite(expected) && expected !== bytes.length) throw new Error(`Storage object ${bucket}/${object.name}: ${bytes.length} bytes downloaded, ${expected} expected.`);
        archive.files.push({ bucket, name: object.name, size: bytes.length, sha256: sha256(bytes), base64: bytes.toString('base64') });
      }
    }

    // Source migrations at backup time, so a restore can tell which schema the data belongs to.
    const migrations = path.resolve(import.meta.dirname, '..', '..', 'supabase');
    archive.migrations = Object.fromEntries(fs.readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()
      .map((f) => [f, sha256(fs.readFileSync(path.join(migrations, f)))]));

    const envelope = encryptArchive(archive, passphrase);
    const file = path.join(outDir, `vault-live-${opts.ref}-${stamp}.vaultlive`);
    fs.writeFileSync(file, JSON.stringify(envelope), { flag: 'wx', mode: 0o600 });
    const manifest = {
      format: FORMAT, createdAt: archive.createdAt, projectRef: opts.ref, archive: path.basename(file), archiveSha256: sha256(fs.readFileSync(file)),
      tables: archive.digests, accounts: archive.authUsers.length,
      files: archive.files.map(({ bucket, name, size, sha256: hash }) => ({ bucket, name, size, sha256: hash })),
      note: 'Counts and fingerprints only; no content. The archive is encrypted.',
    };
    fs.writeFileSync(`${file}.manifest.json`, JSON.stringify(manifest, null, 2), { flag: 'wx' });
    log(`Wrote ${file}`);
    log(`and ${path.basename(file)}.manifest.json (${Object.keys(archive.tables).length} tables, ${archive.files.length} files).`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error) => { process.stderr.write(`Backup failed: ${error.message}\n`); process.exitCode = 1; });
