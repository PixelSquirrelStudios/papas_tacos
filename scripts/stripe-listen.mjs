import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

process.loadEnvFile('.env.local');
if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw new Error('A Stripe test secret key is required.');
const portable = join(process.env.LOCALAPPDATA || '', 'StripeCLI', 'stripe.exe');
const binary = process.env.STRIPE_CLI_PATH || (existsSync(portable) ? portable : 'stripe');
const origin = process.env.STRIPE_FORWARD_ORIGIN || 'http://localhost:3000';
const destination = new URL(origin);
if (!['localhost', '127.0.0.1'].includes(destination.hostname) || destination.protocol !== 'http:') throw new Error('Webhook forwarding must use local HTTP.');
const listener = spawn(binary, ['listen', '--events', 'checkout.session.completed,checkout.session.expired,charge.refunded', '--forward-to', `${destination.origin}/api/stripe/webhook`], {
  env: { ...process.env, STRIPE_API_KEY: process.env.STRIPE_SECRET_KEY }, stdio: ['inherit', 'pipe', 'pipe'],
});
let configured = false;
let pending = '';
let writes = Promise.resolve();
function output(chunk) {
  pending += chunk.toString();
  const rows = pending.split(/\r?\n/);
  pending = rows.pop() || '';
  for (const row of rows) {
    const secret = row.match(/whsec_[a-zA-Z0-9]+/)?.[0];
    if (secret && !configured) {
      configured = true;
      writes = writes.then(async () => {
        const file = await readFile('.env.local', 'utf8');
        const line = `STRIPE_WEBHOOK_SECRET=${secret}`;
        const next = /^STRIPE_WEBHOOK_SECRET\s*=.*$/m.test(file) ? file.replace(/^STRIPE_WEBHOOK_SECRET\s*=.*$/m, line) : `${file.trimEnd()}\n${line}\n`;
        if (file !== next) await writeFile('.env.local', next);
        console.log('Local webhook signing secret saved to .env.local (value hidden). Restart Next.js if it does not reload the environment.');
      }).catch(() => console.error('Unable to save the local webhook signing secret.'));
    }
    console.log(row.replace(/(?:whsec_|sk_test_|sk_live_)[a-zA-Z0-9]+/g, '[REDACTED]'));
  }
}
listener.stdout.on('data', output);
listener.stderr.on('data', output);
listener.on('error', () => { console.error('Stripe CLI could not start. Install it or set STRIPE_CLI_PATH.'); process.exitCode = 1; });
listener.on('exit', (code) => { process.exitCode = code ?? 1; });
process.on('SIGINT', () => listener.kill('SIGINT'));
process.on('SIGTERM', () => listener.kill('SIGTERM'));