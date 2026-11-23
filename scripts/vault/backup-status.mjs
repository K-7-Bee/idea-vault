#!/usr/bin/env node
// Phase 6E: how fresh are the backups, and keep only the newest few.
//
//   npm run check:backup                       (uses VAULT_BACKUP_DIR, else the default folder below)
//   node scripts/vault/backup-status.mjs --folder <dir> [--prune 8]
//
// Reads only file names, drill reports and last-run.json: it never opens an archive. Pruning deletes
// only files this tooling creates (vault-live-<ref>-<time>.vaultlive and its .manifest.json) directly
// in the folder, keeping the newest N; anything else, including the pre-reset snapshot
// run-20261116T002012Z and its key, is never touched. Exits 1 when a warning applies.
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_FOLDER = 'S:\\Road to Storm K7\\codex test\\idea-vault-preservation\\live-backups';
export const BACKUP_WARN_DAYS = 10;
export const DRILL_WARN_DAYS = 40;
const ARCHIVE = /^vault-live-[a-z0-9]{20}-(\d{8}T\d{6}Z)\.vaultlive$/;
const MANIFEST = /^(vault-live-[a-z0-9]{20}-\d{8}T\d{6}Z\.vaultlive)\.manifest\.json$/;
const DAY = 86_400_000;

const stampToDate = (s) => new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`);

/** Archives in a folder listing, newest first. */
export function archivesIn(names) {
  return names.map((name) => ({ name, m: ARCHIVE.exec(name) })).filter((a) => a.m)
    .map(({ name, m }) => ({ name, takenAt: stampToDate(m[1]) }))
    .sort((a, b) => b.takenAt - a.takenAt);
}

/** The file names to delete so that only the newest `keep` archives (and their manifests) remain. */
export function planPrune(names, keep) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error('Keep at least one backup.');
  const drop = new Set(archivesIn(names).slice(keep).map((a) => a.name));
  return names.filter((name) => drop.has(name) || drop.has(MANIFEST.exec(name)?.[1])).sort();
}

/** Status from what's on disk. `drills` are parsed drill reports. */
export function summarize({ names, drills, lastRun, now = new Date() }) {
  const archives = archivesIn(names);
  const passing = drills.filter((d) => d.summary && d.summary.identicalTables === d.summary.tables && d.summary.filesOk)
    .map((d) => new Date(d.drillAt)).sort((a, b) => b - a);
  const days = (date) => (now - date) / DAY;
  const warnings = [];
  const newest = archives[0];
  if (!newest) warnings.push('No backup found in this folder.');
  else if (days(newest.takenAt) > BACKUP_WARN_DAYS) warnings.push(`The newest backup is ${Math.floor(days(newest.takenAt))} days old.`);
  if (!passing[0]) warnings.push('No passing restore drill found.');
  else if (days(passing[0]) > DRILL_WARN_DAYS) warnings.push(`The last passing restore drill is ${Math.floor(days(passing[0]))} days old.`);
  if (drills.length && !passing.length) warnings.push('Every restore drill on record failed.');
  if (lastRun && lastRun.backup !== 'ok') warnings.push(`The last scheduled run's backup ${lastRun.backup}: ${lastRun.message ?? 'see its log'}.`);
  if (lastRun && lastRun.drill === 'failed') warnings.push(`The last scheduled run's restore drill failed: ${lastRun.message ?? 'see its log'}.`);
  return { archives: archives.length, newestBackup: newest?.takenAt ?? null, lastPassingDrill: passing[0] ?? null, lastRun: lastRun ?? null, warnings };
}

function readJson(file) {
  // Windows PowerShell writes UTF-8 with a byte-order mark; JSON.parse rejects it.
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { return null; }
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const folder = path.resolve(opt('--folder') ?? process.env.VAULT_BACKUP_DIR ?? DEFAULT_FOLDER);
  if (!fs.existsSync(folder)) throw new Error(`The backup folder doesn't exist: ${folder}`);
  const log = (line) => process.stdout.write(`${line}\n`);

  if (opt('--prune') !== undefined) {
    const keep = Number(opt('--prune'));
    for (const name of planPrune(fs.readdirSync(folder), keep)) {
      fs.rmSync(path.join(folder, name));
      log(`Removed old backup file ${name}`);
    }
  }

  const drillDir = path.join(folder, 'drills');
  const drills = fs.existsSync(drillDir)
    ? fs.readdirSync(drillDir).filter((n) => /^drill-.*\.json$/.test(n)).map((n) => readJson(path.join(drillDir, n))).filter(Boolean)
    : [];
  const s = summarize({ names: fs.readdirSync(folder), drills, lastRun: readJson(path.join(folder, 'last-run.json')) });
  const when = (d) => d ? `${d.toISOString().replace('T', ' ').slice(0, 16)} UTC` : 'never';
  log(`Folder: ${folder}`);
  log(`Backups kept: ${s.archives}. Newest: ${when(s.newestBackup)}. Last passing restore drill: ${when(s.lastPassingDrill)}.`);
  if (s.lastRun) log(`Last scheduled run: ${s.lastRun.finishedAt ?? s.lastRun.startedAt} (backup ${s.lastRun.backup}, drill ${s.lastRun.drill}).`);
  for (const w of s.warnings) log(`WARNING: ${w}`);
  if (s.warnings.length) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('backup-status.mjs')) {
  try { main(); } catch (error) { process.stderr.write(`Backup status failed: ${error.message}\n`); process.exitCode = 1; }
}
