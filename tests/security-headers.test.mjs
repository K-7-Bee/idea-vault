import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Phase 6B: the security headers and the Content-Security-Policy, and the report endpoint.
const root = path.join(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const source = ts.transpileModule(read('src/lib/security-headers.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const sec = {};
vm.runInNewContext(source, { exports: sec, URL, process: { env: {} } });
const byKey = (headers) => Object.fromEntries(headers.map((h) => [h.key, h.value]));
const directives = (csp) => Object.fromEntries(csp.split('; ').map((d) => { const [name, ...values] = d.split(' '); return [name, values]; }));

test('the five protective headers are always sent', () => {
  const h = byKey(sec.securityHeaders({ NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co' }));
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
  assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(h['Permissions-Policy'], 'microphone=(self), camera=(), geolocation=(), payment=(), usb=(), browsing-topics=()');
  assert.equal(h['Cross-Origin-Opener-Policy'], 'same-origin-allow-popups');
});

test('the CSP is report-only unless CSP_ENFORCE=1', () => {
  const live = byKey(sec.securityHeaders({ NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co' }));
  assert.ok(live['Content-Security-Policy-Report-Only']);
  assert.equal(live['Content-Security-Policy'], undefined);
  const enforced = byKey(sec.securityHeaders({ NODE_ENV: 'production', CSP_ENFORCE: '1' }));
  assert.ok(enforced['Content-Security-Policy']);
  assert.equal(enforced['Content-Security-Policy-Report-Only'], undefined);
  assert.equal(byKey(sec.securityHeaders({ CSP_ENFORCE: 'true' }))['Content-Security-Policy'], undefined, 'only exactly "1" enforces');
});

test('the policy allows only this site, the Supabase project and the Google hosts the Picker needs', () => {
  const d = directives(sec.contentSecurityPolicy({ supabaseUrl: 'https://abc.supabase.co/some/path', reportUri: '/api/csp-report' }));
  assert.deepEqual(d['default-src'], ["'self'"]);
  assert.deepEqual(d['object-src'], ["'none'"]);
  assert.deepEqual(d['frame-ancestors'], ["'none'"]);
  assert.deepEqual(d['base-uri'], ["'self'"]);
  assert.deepEqual(d['form-action'], ["'self'"]);
  assert.deepEqual(d['script-src'], ["'self'", "'unsafe-inline'", 'https://apis.google.com']);
  assert.ok(!d['script-src'].includes("'unsafe-eval'"), 'no eval in production');
  assert.deepEqual(d['connect-src'], ["'self'", 'https://abc.supabase.co', 'https://www.googleapis.com']);
  assert.deepEqual(d['img-src'], ["'self'", 'data:', 'blob:', 'https://abc.supabase.co']);
  assert.deepEqual(d['frame-src'], ['https://docs.google.com']);
  assert.ok('upgrade-insecure-requests' in d);
  assert.deepEqual(d['report-uri'], ['/api/csp-report']);
  for (const values of Object.values(d)) assert.ok(!values.includes('*') && !values.includes('https:'), 'no wildcards');
});

test('local http test builds skip the https upgrade; development allows eval and hot reload', () => {
  const test = directives(sec.contentSecurityPolicy({ supabaseUrl: 'http://127.0.0.1:4317' }));
  assert.ok(!('upgrade-insecure-requests' in test));
  assert.ok(test['connect-src'].includes('http://127.0.0.1:4317'));
  const dev = directives(sec.contentSecurityPolicy({ supabaseUrl: 'https://abc.supabase.co', dev: true }));
  assert.ok(dev['script-src'].includes("'unsafe-eval'") && dev['connect-src'].includes('ws:'));
  const bad = directives(sec.contentSecurityPolicy({ supabaseUrl: 'not a url' }));
  assert.deepEqual(bad['connect-src'], ["'self'", 'https://www.googleapis.com'], 'a bad URL adds nothing');
});

test('every route gets the headers, and the report endpoint logs only directive and origin', () => {
  const config = read('next.config.ts');
  assert.ok(config.includes('{ source: "/:path*", headers: headers.filter((h) => !isCsp(h)) }'), 'protective headers everywhere');
  assert.ok(config.includes('{ source: "/((?!api/drive/file/).*)", headers: headers.filter(isCsp) }'), 'Drive files keep their own sandbox policy');
  const route = read('src/app/api/csp-report/route.ts');
  assert.ok(route.includes('const MAX_BYTES = 8 * 1024;'));
  assert.ok(/console\.warn\(`csp-violation directive=\$\{directive\} blocked=\$\{origin\(/.test(route));
  assert.ok(!/document-uri|documentURL|source-file|sample/.test(route.replace(/\/\/.*$/gm, '')), 'no page addresses or samples logged');
  assert.ok(!/from\(|insert|writeFile/.test(route), 'nothing stored');
});
