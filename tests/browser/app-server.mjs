import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

// Explicit synthetic settings override inherited service settings; no .env file is written.
const env = { ...process.env, VAULT_E2E: '1', NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:4317',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture-public-key-not-a-real-credential',
  ALLOWED_EMAIL: 'owner@fixture.invalid',
  // Phase 3A: synthetic Google on the fixture; the key is random for every run.
  GOOGLE_CLIENT_ID: 'fixture-client-id', GOOGLE_CLIENT_SECRET: 'fixture-client-secret',
  DRIVE_TOKEN_KEY: randomBytes(32).toString('base64'), DRIVE_GOOGLE_TEST_BASE: 'http://127.0.0.1:4317/google',
  DRIVE_GOOGLE_ACCOUNT: '',
  // Phase 5A: the assistant on, against the fixture's fake Gemini (never the real one).
  AI_ENABLED: '1', GEMINI_API_KEY: 'fixture-gemini-key-never-in-the-browser', GEMINI_TEST_BASE: 'http://127.0.0.1:4317/gemini',
  GEMINI_MODEL: '', AI_MONTHLY_USD: '5', AI_DAILY_REQUESTS: '40',
  // Phase 6B: the Content-Security-Policy enforced (not report-only); violations go to the fixture,
  // and tests/browser/zz-csp.spec.ts fails the run if any test caused one.
  CSP_ENFORCE: '1', CSP_REPORT_URI: 'http://127.0.0.1:4317/_csp-report', NEXT_PUBLIC_GOOGLE_PICKER_API_KEY: 'fixture-picker-key', NEXT_PUBLIC_GOOGLE_APP_ID: '1', DRIVE_UPLOADS_ENABLED: '1' };
let child;
const run = (args) => new Promise((resolve, reject) => {
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...args], { env, stdio: 'inherit', windowsHide: true });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Fixture app exited ${code}`)));
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child?.kill(); process.exit(0); });
await run(['build']);
await run(['start', '-H', '127.0.0.1', '-p', '4318']);
