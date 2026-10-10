/**
 * Builds Firefly's backup list of ~5,000 European attractions from Wikidata (free, no key,
 * public domain) and saves it to Firestore (attractionCache/*) and to
 * functions/data/attractions-europe.json, so you can open and check it.
 *
 *   npm run attractions:build              (carries on from where the last run stopped)
 *   npm run attractions:build -- --fresh   (runs every search again)
 *
 * Every answer is saved as it arrives, so it is safe to stop with Ctrl+C at any time: the next
 * run only does the searches that are still missing. The server keeps the list fresh by itself
 * afterwards (a few searches every night).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getFirestore } from 'firebase-admin/firestore';
import { initAdmin } from './adminInit';
import { buildEuropeCache, cacheDocs, firestoreSearchStore } from '../functions/src/attractions/build';
import { USER_AGENT, WDQS_URL, type CommonsInfo, type SparqlJson } from '../functions/src/attractions/wikidata';

async function sparql(query: string): Promise<SparqlJson> {
  const res = await fetch(WDQS_URL, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query }).toString(),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  return (await res.json()) as SparqlJson;
}

async function commons(url: string): Promise<CommonsInfo> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Commons HTTP ${res.status}`);
  return (await res.json()) as CommonsInfo;
}

async function main() {
  initAdmin(!!process.env.FIRESTORE_EMULATOR_HOST);
  const db = getFirestore();
  const fresh = process.argv.includes('--fresh');
  console.log('Building the backup attraction list from Wikidata. Safe to stop with Ctrl+C — the next run carries on.\n');
  const r = await buildEuropeCache(
    { sparql, commons, log: (m) => console.log(m), store: firestoreSearchStore(db) },
    fresh ? { maxAgeMs: 0 } : {},
  );
  if (r.places.length < 500) {
    console.log(
      `\nOnly ${r.places.length} places so far — not saved yet. ${r.missing} of ${r.total} searches still have no answer ` +
        '(Wikidata may be busy). What was found is kept: run `npm run attractions:build` again later and it carries on.',
    );
    process.exit(1);
  }
  const dir = join(process.cwd(), 'functions', 'data');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'attractions-europe.json'), JSON.stringify(r.places, null, 1));
  const batch = db.batch();
  for (const d of cacheDocs(r.places, Date.now(), { missing: r.missing, oldestSearchAt: r.oldestAt })) {
    batch.set(db.collection('attractionCache').doc(d.id), d.data);
  }
  await batch.commit();
  const byKind = r.places.reduce<Record<string, number>>((m, p) => ((m[p.kind] = (m[p.kind] ?? 0) + 1), m), {});
  console.log(`\nSaved ${r.places.length} attractions (Firestore attractionCache + functions/data/attractions-europe.json).`);
  console.log('By kind:', byKind);
  if (r.missing) {
    console.log(`\n${r.missing} of ${r.total} searches got no answer this time. The list is saved and works; run the command again later to fill those in (only they are redone).`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
