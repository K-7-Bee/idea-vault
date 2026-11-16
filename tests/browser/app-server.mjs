import { spawn } from 'node:child_process';

// Explicit synthetic settings override inherited service settings; no .env file is written.
const env = { ...process.env, VAULT_E2E: '1', NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:4317',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture-public-key-not-a-real-credential',
  ALLOWED_EMAIL: 'owner@fixture.invalid' };
let child;
const run = (args) => new Promise((resolve, reject) => {
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...args], { env, stdio: 'inherit', windowsHide: true });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Fixture app exited ${code}`)));
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child?.kill(); process.exit(0); });
await run(['build']);
await run(['start', '-H', '127.0.0.1', '-p', '4318']);
