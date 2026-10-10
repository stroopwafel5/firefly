import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';

/**
 * Finds the service-account key in the project folder: service-account.json, or any .json file
 * holding a service-account key. Windows hides known extensions, so a key saved as
 * "service-account.json" often ends up as service-account.json.json; that is found too.
 */
function findServiceAccount(dir: string): string | undefined {
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json'));
  files.sort((a, b) => Number(b.startsWith('service-account')) - Number(a.startsWith('service-account')));
  for (const f of files) {
    try {
      if (JSON.parse(readFileSync(join(dir, f), 'utf8')).type === 'service_account') return join(dir, f);
    } catch {
      /* not a JSON key */
    }
  }
  return undefined;
}

/**
 * Connects the admin scripts (seed, set-admin, agoda-city) to Firebase.
 *  - emulator: the local emulator project (demo-firefly unless GCLOUD_PROJECT says otherwise)
 *  - otherwise: the real project, signed in with the service-account key from the project folder
 *    (or the file GOOGLE_APPLICATION_CREDENTIALS points to). No shell variable is needed, so the
 *    same command works in PowerShell, cmd and bash.
 */
export function initAdmin(emulator: boolean): void {
  if (emulator) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-firefly' });
    return;
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const found = findServiceAccount(process.cwd());
    if (found) process.env.GOOGLE_APPLICATION_CREDENTIALS = found;
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'No service-account key in the project folder. Firebase console → Project settings → ' +
        'Service accounts → Generate new private key, and save it as service-account.json next to package.json.',
    );
  }
  initializeApp({ credential: applicationDefault() });
}
