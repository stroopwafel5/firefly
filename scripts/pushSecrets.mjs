#!/usr/bin/env node
/**
 * Uploads every key in functions/.secret.local to Google Secret Manager, where the deployed
 * Cloud Functions read them. Works on Windows, macOS and Linux (needs the Firebase CLI:
 * `npm i -g firebase-tools`, then `firebase login` and `firebase use --add`).
 *
 * Keys that aren't there yet (Agoda before approval, SMTP…) are stored as the placeholder
 * "unset": Firebase refuses to deploy a function whose secret doesn't exist, and the server
 * treats "unset" as "not configured".
 *
 *   npm run push-secrets
 *   firebase deploy --only functions
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = [
  'TRIPADVISOR_KEY', 'GOOGLE_SERVER_KEY', 'TICKETMASTER_KEY', 'SERPAPI_KEY', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET',
  'SMTP_USER', 'SMTP_PASS', 'ANTHROPIC_API_KEY', 'AGODA_SITE_ID', 'AGODA_API_KEY',
  'GROW_USER_ID', 'GROW_PAGE_CODE', 'GROW_API_KEY',
];

let text;
try {
  text = readFileSync(join(root, 'functions/.secret.local'), 'utf8');
} catch {
  console.error('Missing functions/.secret.local (see HOW_TO_TEST.md §2).');
  process.exit(1);
}
const values = Object.fromEntries(
  text
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);

const dir = mkdtempSync(join(tmpdir(), 'firefly-secrets-'));
let failed = 0;
try {
  for (const name of NAMES) {
    const value = values[name] || 'unset';
    const file = join(dir, name);
    writeFileSync(file, value);
    const r = spawnSync('firebase', ['functions:secrets:set', name, '--data-file', file, '--force'], {
      cwd: root,
      shell: process.platform === 'win32', // firebase is firebase.cmd on Windows
      encoding: 'utf8',
    });
    if (r.status === 0) console.log(`✔ ${name}: ${values[name] ? 'set' : 'placeholder (not configured yet)'}`);
    else {
      failed++;
      console.log(`✘ ${name}: ${(r.stderr || r.stdout || r.error?.message || '').trim().split('\n').slice(-2).join(' ')}`);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true }); // the key files never stay on disk
}
console.log(failed ? `\n${failed} failed — are you logged in (firebase login) and is a project selected (firebase use --add)?` : '\nDone. Now: firebase deploy --only functions');
process.exit(failed ? 1 : 0);
