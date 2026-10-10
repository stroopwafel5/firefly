/**
 * Tells Firefly which Agoda city id to use for a town (Agoda's affiliate API searches by its own
 * numeric city ids; Agoda provides them to partners). Add every name the town goes by: the
 * server looks the town up by the English name Google/OpenStreetMap give for the map point.
 *
 *   (uses service-account.json from the project folder)
 *   npm run agoda-city -- CZ 5085 "Prague" "Praha"
 *   npm run agoda-city -- --list
 * Emulator: prefix with FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-firefly
 */
import { initAdmin } from './adminInit';
import { getFirestore } from 'firebase-admin/firestore';
import { agodaCityKey } from '../functions/src/hotels/agodaMap';

async function main() {
  initAdmin(!!process.env.FIRESTORE_EMULATOR_HOST);
  const db = getFirestore();
  const [first, ...rest] = process.argv.slice(2);
  if (first === '--list') {
    const snap = await db.collection('agodaCities').get();
    snap.docs.forEach((d: { id: string; data(): { cityId?: number } }) => console.log(`${d.id} → ${d.data().cityId}`));
    return;
  }
  const [cityId, ...names] = rest;
  if (!first || !Number(cityId) || !names.length) throw new Error('Usage: npm run agoda-city -- <country code> <Agoda city id> "<name>" ["<other name>" …]');
  for (const name of names) {
    const key = agodaCityKey(first, name);
    await db.collection('agodaCities').doc(key).set({ cityId: Number(cityId), city: name, country: first.toUpperCase(), updatedAt: Date.now() });
    console.log(`agodaCities/${key} → ${cityId}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
