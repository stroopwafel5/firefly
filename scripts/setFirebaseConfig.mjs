#!/usr/bin/env node
/**
 * Fills the Firebase lines of .env and writes .firebaserc (which project `firebase deploy` uses).
 *
 *   npm run firebase-config               looks in the project folder for the files below
 *   npm run firebase-config -- <file>     reads that file instead
 *
 * It understands three files, best first:
 *  1. firebase-config.txt — the "Config" block pasted from Firebase console → Project settings →
 *     General → Your apps → firefly (Web app) → SDK setup and configuration → Config.
 *     Has everything, including apiKey and authDomain.
 *  2. google-services.json — the Android app's config file (same page, Android app). Has the
 *     apiKey, project ID, storage bucket and sender ID.
 *  3. service-account.json — the admin key used by `npm run seed`. Has the project ID only;
 *     it holds no apiKey, so the app stays in preview mode until 1 or 2 is added.
 *
 * Every file is checked against the web app already in .env (sender ID 838969269106): a file
 * from a different Firebase project is refused, so the app never mixes two projects.
 * No network, no dependencies; works on Windows, macOS and Linux.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIELDS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const ENV_NAME = {
  apiKey: 'FIREBASE_API_KEY',
  authDomain: 'FIREBASE_AUTH_DOMAIN',
  projectId: 'FIREBASE_PROJECT_ID',
  storageBucket: 'FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'FIREBASE_MESSAGING_SENDER_ID',
  appId: 'FIREBASE_APP_ID',
};
const PACKAGE = 'net.differentroute.firefly';

/** Reads a file and returns { kind, values } with whatever Firebase settings it holds. */
export function parseConfigText(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  if (json?.type === 'service_account') {
    return { kind: 'service account key', values: { projectId: json.project_id } };
  }
  if (json?.project_info) {
    const clients = json.client ?? [];
    const client =
      clients.find((c) => c.client_info?.android_client_info?.package_name === PACKAGE) ?? clients[0];
    return {
      kind: 'google-services.json',
      values: {
        apiKey: client?.api_key?.[0]?.current_key,
        projectId: json.project_info.project_id,
        storageBucket: json.project_info.storage_bucket,
        messagingSenderId: json.project_info.project_number,
        // client.client_info.mobilesdk_app_id is the Android app's id; the web app id stays.
      },
    };
  }
  // The pasted Config block (JavaScript object) or the same thing as JSON.
  const values = {};
  for (const m of text.matchAll(/["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g)) {
    if (FIELDS.includes(m[1])) values[m[1]] = m[2].trim();
  }
  return { kind: 'Config block', values };
}

/** Applies the values to the text of .env; returns the new text and what changed. */
export function applyToEnv(envText, found) {
  const eol = envText.includes('\r\n') ? '\r\n' : '\n';
  const lines = envText.split(/\r?\n/);
  const current = {};
  for (const l of lines) {
    const m = /^(FIREBASE_\w+)=(.*)$/.exec(l);
    if (m) current[m[1]] = m[2].trim();
  }

  const sender = current.FIREBASE_MESSAGING_SENDER_ID;
  if (found.messagingSenderId && sender && String(found.messagingSenderId) !== sender) {
    return {
      error:
        `This file is from the Firebase project with number ${found.messagingSenderId}, but the web app ` +
        `"firefly" in .env belongs to project number ${sender}. Download the file from the project ` +
        `that holds the firefly web app (Project settings → General shows the project number).`,
    };
  }
  if (found.appId && current.FIREBASE_APP_ID && found.appId !== current.FIREBASE_APP_ID) {
    const num = found.appId.split(':')[1];
    if (sender && num && num !== sender) {
      return { error: `The appId ${found.appId} belongs to project number ${num}, not ${sender}.` };
    }
  }

  const values = { ...found };
  if (values.projectId) {
    values.authDomain ??= `${values.projectId}.firebaseapp.com`;
    values.storageBucket ??= `${values.projectId}.firebasestorage.app`;
  }
  const changed = [];
  const out = lines.map((l) => {
    const m = /^(FIREBASE_\w+)=(.*)$/.exec(l);
    if (!m) return l;
    const field = Object.keys(ENV_NAME).find((k) => ENV_NAME[k] === m[1]);
    const v = field && values[field] != null ? String(values[field]) : undefined;
    if (v === undefined || v === m[2].trim()) return l;
    changed.push(`${m[1]}=${v}`);
    return `${m[1]}=${v}`;
  });
  // A line the .env doesn't have yet (older copies) is added at the end.
  for (const [field, name] of Object.entries(ENV_NAME)) {
    if (values[field] != null && !(name in current)) {
      out.push(`${name}=${values[field]}`);
      changed.push(`${name}=${values[field]}`);
    }
  }
  const after = {};
  for (const l of out) {
    const m = /^(FIREBASE_\w+)=(.*)$/.exec(l);
    if (m) after[m[1]] = m[2].trim();
  }
  return { text: out.join(eol), changed, after };
}

function candidates() {
  const list = ['firebase-config.txt', 'firebase-config.js', 'firebase-config.json', 'google-services.json', 'android/app/google-services.json'];
  const found = list.map((f) => join(root, f)).filter((f) => existsSync(f));
  for (const f of readdirSync(root)) {
    if (!f.endsWith('.json') || ['package.json', 'package-lock.json', 'tsconfig.json', 'eas.json', 'firebase.json', 'firestore.indexes.json', 'google-services.json'].includes(f)) continue;
    try {
      if (JSON.parse(readFileSync(join(root, f), 'utf8')).type === 'service_account') found.push(join(root, f));
    } catch {
      /* not JSON */
    }
  }
  return found;
}

function main() {
  const files = process.argv[2] ? [process.argv[2]] : candidates();
  if (!files.length) {
    console.log(
      'Nothing to read. Copy the "Config" block from Firebase console → Project settings → General →\n' +
        'Your apps → firefly (Web app) → SDK setup and configuration → Config, paste it into a file\n' +
        'called firebase-config.txt next to package.json, and run this again.',
    );
    process.exit(1);
  }

  // Merge every file found; the earlier (richer) file wins on each field.
  const merged = {};
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, 'utf8');
    } catch (e) {
      console.error(`Can't read ${f}: ${e.message}`);
      process.exit(1);
    }
    const { kind, values } = parseConfigText(text);
    const keys = Object.keys(values).filter((k) => values[k]);
    console.log(`• ${f.replace(root, '.')} (${kind}): ${keys.length ? keys.join(', ') : 'no Firebase settings found'}`);
    for (const k of keys) merged[k] ??= values[k];
    if (values.projectId && merged.projectId !== values.projectId) {
      console.log(
        `  ⚠ this file is for project "${values.projectId}", the one above for "${merged.projectId}".\n` +
          `    Using "${merged.projectId}". If this is the service-account key, npm run seed would write to the\n` +
          `    other project: download the key again from "${merged.projectId}" (Project settings → Service accounts).`,
      );
    }
  }
  if (merged.projectId && merged.authDomain && !merged.authDomain.startsWith(merged.projectId)) {
    console.log(`  note: authDomain ${merged.authDomain} doesn't match project ${merged.projectId}; keeping both as given.`);
  }

  const envPath = join(root, '.env');
  const envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : readFileSync(join(root, '.env.example'), 'utf8');
  const r = applyToEnv(envText, merged);
  if (r.error) {
    console.error(`\n✘ Not written. ${r.error}`);
    process.exit(1);
  }
  writeFileSync(envPath, r.text);
  console.log(r.changed.length ? `\n✔ .env updated:\n  ${r.changed.join('\n  ')}` : '\n✔ .env already up to date');

  if (merged.projectId) {
    writeFileSync(join(root, '.firebaserc'), JSON.stringify({ projects: { default: merged.projectId } }, null, 2) + '\n');
    console.log(`✔ .firebaserc → project ${merged.projectId} (used by firebase deploy and npm run push-secrets)`);
  }

  const missing = ['FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_APP_ID'].filter((n) => !r.after[n]);
  if (missing.length) {
    console.log(
      `\nStill missing: ${missing.join(', ')} — the app stays in preview mode until they're set.\n` +
        'The service-account key has no apiKey: paste the web app\'s Config block into firebase-config.txt\n' +
        '(or put google-services.json next to package.json) and run this again.',
    );
  } else {
    console.log('\nThe app will connect to Firebase on the next build (npx expo run:android).');
  }
}

if (/setFirebaseConfig\.mjs$/.test(process.argv[1] ?? '')) main(); // run, not imported (works with any path spelling)
