#!/usr/bin/env node
// Phase 6C: runs the database behaviour suites (tests/sql/*.sql) in a fresh, disposable, offline
// Postgres (Docker, no network) and removes it afterwards. The same command runs here and in CI.
//
// Usage: npm run test:sql                      (every suite, in name order)
//        npm run test:sql -- phase2 phase5a    (only suites whose name contains one of these)
//
// Steps: the Storage stand-in, schema.sql and every numbered migration in order; then 004 onwards
// a second time, to prove they are safe to re-run (schema.sql, 002 and 003 predate that rule and
// are not); then each suite. Suites share the one database and run in name order, so every suite
// creates the accounts and rows it needs. A suite passes when psql exits 0 (any failed check
// raises an error); its "OK" notices are counted for the summary. No live project is contacted.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const IMAGE = process.env.SQL_SUITE_IMAGE || 'public.ecr.aws/supabase/postgres:17.11.0.018';
const repo = path.resolve(import.meta.dirname, '..', '..');
const log = (line) => process.stdout.write(`${line}\n`);
const env = { ...process.env, MSYS_NO_PATHCONV: '1' };

function docker(argv, input) {
  return spawnSync('docker', argv, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024, windowsHide: true, env });
}
function must(r, what) {
  if (r.status !== 0) throw new Error(`${what} failed:\n${String(r.stderr || r.stdout).trim().split('\n').slice(-6).join('\n')}`);
  return r.stdout;
}

const filters = process.argv.slice(2);
const suites = fs.readdirSync(path.join(repo, 'tests', 'sql')).filter((f) => f.endsWith('.sql')).sort()
  .filter((f) => !filters.length || filters.some((x) => f.includes(x)));
if (!suites.length) throw new Error(`No suite matches ${filters.join(', ')}`);
const migrations = fs.readdirSync(path.join(repo, 'supabase')).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
const rerunnable = migrations.filter((f) => Number(f.slice(0, 3)) >= 4);

const name = `ivsql-${randomBytes(4).toString('hex')}`;
let removed = false;
const cleanup = () => { if (!removed) { removed = true; docker(['rm', '-f', name]); } };
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { cleanup(); process.exit(130); });

const started = Date.now();
must(docker(['run', '-d', '--name', name, '--network', 'none', '-e', 'POSTGRES_PASSWORD=disposable-local-only', IMAGE]), 'Starting the database');
try {
  const psql = (sql) => docker(['exec', '-i', name, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres', '-q', '-At'], sql);
  // Ready means the image's own setup has finished (the auth schema and API roles exist) and the
  // server answers twice in a row, 3 s apart: the image restarts Postgres once after its setup.
  let streak = 0;
  for (let i = 0; i < 90 && streak < 2; i++) {
    const r = psql("select 1 from pg_roles where rolname = 'authenticated' and exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'users')");
    streak = r.status === 0 && r.stdout.trim() === '1' ? streak + 1 : 0;
    await new Promise((r) => setTimeout(r, streak ? 3000 : 2000));
  }
  if (streak < 2) throw new Error('The database did not become ready within 4 minutes.');

  const apply = (file, dir = 'supabase') => must(psql(fs.readFileSync(path.join(repo, dir, file), 'utf8')), `Applying ${file}`);
  apply('storage-standin.sql', path.join('scripts', 'vault', 'drill'));
  apply('schema.sql');
  for (const file of migrations) apply(file);
  for (const file of rerunnable) apply(file);
  log(`Applied schema.sql and ${migrations.length} migrations, then ${rerunnable[0]}–${rerunnable.at(-1)} again.`);

  const results = [];
  for (const suite of suites) {
    const r = psql(fs.readFileSync(path.join(repo, 'tests', 'sql', suite), 'utf8'));
    const output = `${r.stdout}\n${r.stderr}`;
    const ok = (output.match(/NOTICE: {2}OK /g) || []).length;
    results.push({ suite, ok, passed: r.status === 0 });
    log(`${r.status === 0 ? 'PASS' : 'FAIL'}  ${suite}  (${ok} checks)`);
    // In GitHub Actions, a failing suite also becomes an annotation readable without signing in.
    if (r.status !== 0 && process.env.GITHUB_ACTIONS) log(`::error file=tests/sql/${suite}::${(output.match(/ERROR: .*/) || ['failed'])[0]}`);
    if (r.status !== 0) log(output.split('\n').filter((l) => /ERROR|FAIL|DETAIL|CONTEXT/.test(l)).slice(0, 6).map((l) => `      ${l}`).join('\n'));
  }
  const failed = results.filter((r) => !r.passed);
  const checks = results.reduce((n, r) => n + r.ok, 0);
  log(`${results.length - failed.length}/${results.length} suites passed, ${checks} checks, ${Math.round((Date.now() - started) / 1000)} s.`);
  if (failed.length) process.exitCode = 1;
} catch (error) {
  log(String(error.message || error));
  process.exitCode = 1;
} finally {
  cleanup();
}
