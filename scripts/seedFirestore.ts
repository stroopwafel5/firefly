/**
 * Seeds Firestore with the Different Route camp catalogue (camps/{id}).
 * The PayPal function charges the price stored here, never a price sent by the app.
 *
 *   (uses service-account.json from the project folder)
 *   npm run seed                      # production project from the service account
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=demo-firefly npm run seed   # emulator
 */
import { initAdmin } from './adminInit';
import { getFirestore } from 'firebase-admin/firestore';
import { CAMPS } from '../src/data/camps';
import { DEFAULT_PROVIDER } from '../src/models/Camp';

async function main() {
  initAdmin(!!process.env.FIRESTORE_EMULATOR_HOST);
  const db = getFirestore();
  const batch = db.batch();
  // provider and disability are written explicitly, so admins see (and can edit) them in the console.
  for (const camp of CAMPS) {
    const doc = { provider: DEFAULT_PROVIDER, disability: [], ...camp };
    batch.set(db.collection('camps').doc(String(camp.id)), JSON.parse(JSON.stringify(doc)));
  }
  await batch.commit();
  console.log(`Seeded ${CAMPS.length} camps.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
