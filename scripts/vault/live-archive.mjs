import { createHash, randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Phase 6A: the encrypted archive format for backups of the live database and Storage, and helpers
// shared by backup-live.mjs and restore-drill.mjs. Same cryptography as preservation.mjs
// (AES-256-GCM, PBKDF2-SHA256 with 600,000 iterations); the content is gzipped JSON. Node
// built-ins only. Whole archives are processed in memory and limited to 256 MiB.

export const FORMAT = 'idea-vault-live-backup-v1';
const ITERATIONS = 600000;
export const MAX_BYTES = 256 * 1024 * 1024;
export const MAX_ROWS_PER_TABLE = 20000;

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = (message) => { throw new Error(message); };

function keyFor(passphrase, salt) {
  if (typeof passphrase !== 'string' || passphrase.length < 16) fail('Use a backup passphrase of at least 16 characters (VAULT_BACKUP_PASSPHRASE).');
  return pbkdf2Sync(passphrase, salt, ITERATIONS, 32, 'sha256');
}

export function encryptArchive(archive, passphrase) {
  if (archive?.format !== FORMAT) fail('Not a live backup archive');
  const plain = gzipSync(Buffer.from(JSON.stringify(archive), 'utf8'));
  if (plain.length > MAX_BYTES) fail('Backup exceeds 256 MiB; a reviewed streaming method is needed');
  const salt = randomBytes(16), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(passphrase, salt), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  return { format: FORMAT, cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, compression: 'gzip',
    salt: salt.toString('base64'), iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64') };
}

export function decryptArchive(envelope, passphrase) {
  if (envelope?.format !== FORMAT || envelope.cipher !== 'AES-256-GCM' || envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations !== ITERATIONS) {
    fail('Unsupported or damaged backup file');
  }
  const salt = Buffer.from(envelope.salt, 'base64'), iv = Buffer.from(envelope.iv, 'base64'), data = Buffer.from(envelope.ciphertext, 'base64');
  if (salt.length !== 16 || iv.length !== 12 || data.length < 17) fail('Invalid encryption parameters');
  const decipher = createDecipheriv('aes-256-gcm', keyFor(passphrase, salt), iv);
  decipher.setAuthTag(data.subarray(-16));
  let archive;
  try { archive = JSON.parse(gunzipSync(Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()])).toString('utf8')); }
  catch { fail('Backup authentication failed (wrong passphrase or damaged backup)'); }
  if (archive?.format !== FORMAT) fail('Not a live backup archive');
  return archive;
}

// The fingerprint of a table: its rows as Postgres renders them (row_to_json), sorted by code
// point, joined with newlines. Equal fingerprints mean identical content, independent of row order.
export function tableDigest(jsonRows) {
  const sorted = [...jsonRows].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { count: sorted.length, sha256: sha256(Buffer.from(sorted.join('\n'), 'utf8')) };
}

// Checks every file in the archive against its recorded size and hash.
export function verifyFiles(archive) {
  const problems = [];
  for (const f of archive.files ?? []) {
    const bytes = Buffer.from(f.base64, 'base64');
    if (bytes.length !== f.size || sha256(bytes) !== f.sha256) problems.push(`${f.bucket}/${f.name}`);
  }
  return problems;
}

// Public-schema security and structure, plus our Storage policies and buckets, as one JSON text.
// Run identically on production (via the CLI) and on the restored database (via psql) and compared.
export const CATALOG_SQL = `
select json_build_object(
  'tables', (select json_agg(json_build_object('name', c.relname, 'rls', c.relrowsecurity) order by c.relname)
             from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'),
  'columns', (select json_agg(json_build_object('table', table_name, 'column', column_name, 'type', data_type, 'udt', udt_name,
               'nullable', is_nullable, 'default', column_default, 'identity', is_identity) order by table_name, ordinal_position)
              from information_schema.columns where table_schema = 'public'),
  'policies', (select json_agg(json_build_object('schema', schemaname, 'table', tablename, 'name', policyname, 'cmd', cmd,
                'roles', roles::text, 'qual', qual, 'check', with_check) order by schemaname, tablename, policyname)
               from pg_policies where schemaname = 'public'
                  or (schemaname = 'storage' and coalesce(qual, '') || coalesce(with_check, '') ~ '(attachments|library|showcase|profile-files)')),
  'table_privileges', (select json_agg(json_build_object('table', c.relname, 'role', r, 'privilege', p) order by c.relname, r, p)
                       from pg_class c cross join unnest(array['anon', 'authenticated']) r cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
                       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and has_table_privilege(r, c.oid, p)),
  'column_privileges', (select json_agg(json_build_object('table', c.relname, 'column', a.attname, 'role', r, 'privilege', p) order by c.relname, a.attname, r, p)
                        from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                        cross join unnest(array['anon', 'authenticated']) r cross join unnest(array['SELECT', 'UPDATE']) p
                        where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
                          and has_column_privilege(r, c.oid, a.attnum, p) and not has_table_privilege(r, c.oid, p)),
  'functions', (select json_agg(json_build_object('name', p.oid::regprocedure::text, 'secdef', p.prosecdef, 'md5', md5(pg_get_functiondef(p.oid)),
                 'anon', has_function_privilege('anon', p.oid, 'EXECUTE'), 'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'))
                 order by p.oid::regprocedure::text)
                from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'),
  'triggers', (select json_agg(json_build_object('table', t.tgrelid::regclass::text, 'name', t.tgname) order by t.tgrelid::regclass::text, t.tgname)
               from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and c.relnamespace = 'public'::regnamespace),
  'buckets', (select json_agg(json_build_object('id', id, 'public', public, 'limit', file_size_limit, 'types', allowed_mime_types) order by id)
              from storage.buckets)
)::text as catalog`;

// Differences between two catalogs, per section, as readable lines. Schema prefixes are ignored:
// Postgres prints "auth.uid()" or "uid()" depending on the session's search path, not the definition.
const unqualified = (x) => JSON.stringify(x).replace(/\b(auth|public|extensions|pg_catalog|storage)\./g, '');
export function compareCatalogs(expected, actual) {
  const lines = [];
  for (const section of new Set([...Object.keys(expected ?? {}), ...Object.keys(actual ?? {})])) {
    const a = new Set((expected?.[section] ?? []).map(unqualified));
    const b = new Set((actual?.[section] ?? []).map(unqualified));
    for (const x of a) if (!b.has(x)) lines.push(`${section}: missing after restore: ${x}`);
    for (const x of b) if (!a.has(x)) lines.push(`${section}: only in the restore: ${x}`);
  }
  return lines;
}

// Runs one read-only SQL statement against the hosted project through the Supabase CLI login and
// returns its rows. The CLI decides credentials; this script never sees a password or key.
export function cliQuery({ cli, ref, workdir, sqlFile }) {
  const result = spawnSync(process.execPath, [cli, 'db', 'query', `--remote=${ref}`, '--read-only', '--workdir', workdir, '--output', 'json', '--file', sqlFile],
    { encoding: 'utf8', maxBuffer: MAX_BYTES, windowsHide: true, timeout: 180000 });
  if (result.status !== 0) fail(`Supabase CLI query failed (exit ${result.status}). ${String(result.stderr).split('\n').filter((l) => /error/i.test(l)).slice(0, 2).join(' ')}`);
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch { fail('Supabase CLI returned output that is not JSON'); }
  if (!Array.isArray(parsed.rows)) fail('Supabase CLI returned no rows array');
  return parsed.rows;
}

export function cliStorageCopy({ cli, ref, workdir, bucket, destination }) {
  const result = spawnSync(process.execPath, [cli, 'storage', 'cp', '--experimental', `--remote=${ref}`, '--workdir', workdir, '-r', `ss:///${bucket}`, destination],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true, timeout: 900000 });
  if (result.status !== 0) fail(`Supabase CLI couldn't download the "${bucket}" bucket (exit ${result.status}).`);
}

// A destination must be outside the repository, so backups never end up in git.
export function assertOutsideRepo(target) {
  const repo = path.resolve(import.meta.dirname, '..', '..');
  const resolved = path.resolve(target);
  const rel = path.relative(repo, resolved);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) fail('Choose a folder outside this repository for backups and drill output.');
  return resolved;
}

export const quoteIdent = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) fail(`Unexpected table name: ${name}`);
  return `"${name}"`;
};
