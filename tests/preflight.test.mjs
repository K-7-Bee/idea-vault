import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../scripts/vault/preflight.ps1', import.meta.url));
const repository = fileURLToPath(new URL('../', import.meta.url));
function preflight(root) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-BackupRoot', root], { encoding: 'utf8' });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2, result.stderr);
  const report = JSON.parse(result.stdout.replace(/^\uFEFF/, ''));
  assert.equal(report.ready, false);
  assert.deepEqual(report.checks.map(c => [c.name, c.passed]), [['destination', false]]);
  assert.ok(!result.stdout.includes(root), 'sanitized report must not echo arbitrary input');
}
test('preflight refuses repository as backup destination', { skip: process.platform !== 'win32' }, () => preflight(repository));
test('preflight refuses network destinations before any tools run', { skip: process.platform !== 'win32' }, () => preflight('\\\\untrusted-host\\private'));
test('preflight refuses missing destinations without creating them', { skip: process.platform !== 'win32' }, () => {
  const missing = `${repository}missing-preflight-target-${Date.now()}`;
  preflight(missing);
  assert.equal(existsSync(missing), false);
});
