import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { DAY, HOUR, Lang, cached, haversineKm } from '../util';
import { BuildDeps, CachedPlace, SEARCH_MAX_AGE_MS, buildEuropeCache, cacheDocs, firestoreSearchStore } from './build';
import { AttractionOut } from './merge';
import { OVERPASS_URL, osmRestaurants, OverpassJson, restaurantsQuery } from './osm';
import {
  CommonsInfo,
  SparqlJson,
  USER_AGENT,
  WDQS_URL,
  aroundQuery,
  commonsCreditsUrl,
  parseCommonsCredits,
  parsePlaces,
  wdToAttraction,
} from './wikidata';

/** POST a SPARQL query to the Wikidata Query Service. */
export async function sparql(query: string, timeoutMs = 45_000): Promise<SparqlJson> {
  const res = await fetch(WDQS_URL, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query }).toString(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  return (await res.json()) as SparqlJson;
}

async function commons(url: string): Promise<CommonsInfo> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Commons HTTP ${res.status}`);
  return (await res.json()) as CommonsInfo;
}

/**
 * Wikidata attractions around a point (live; cached 30 days per area — Wikidata is CC0).
 * Never throws: on any problem it returns [] and the caller carries on with what it has.
 */
export async function wikidataNear(lat: number, lon: number, radiusKm: number, lang: Lang, minSitelinks = 3): Promise<AttractionOut[]> {
  const r = Math.round(Math.max(1, Math.min(60, radiusKm)));
  const key = `wd:v1:${lat.toFixed(2)},${lon.toFixed(2)}:${r}:${lang}:${minSitelinks}`;
  try {
    const { value } = await cached(
      key,
      30 * DAY,
      async () => {
        // In the busiest city centres a wide circle can still be slow: then a smaller circle of
        // better-known places (the trip planner needs the famous ones most).
        const places = await sparql(aroundQuery(lat, lon, r, lang, 250, minSitelinks), 30_000)
          .catch(() => sparql(aroundQuery(lat, lon, Math.max(2, r / 2), lang, 150, Math.max(10, minSitelinks * 3)), 20_000))
          .then(parsePlaces);
        const files = places.slice(0, 50).map((p) => p.imageFile).filter((f): f is string => !!f);
        const credits = files.length ? await commons(commonsCreditsUrl(files)).then(parseCommonsCredits).catch(() => new Map()) : new Map();
        return places.map((p) => wdToAttraction(p, lang, p.imageFile ? credits.get(p.imageFile) : undefined)) as AttractionOut[];
      },
      (v) => v.length > 0,
    );
    return value;
  } catch (e) {
    logger.warn('Wikidata lookup failed', { lat, lon, r, error: (e as Error).message });
    return [];
  }
}

/* ---------------- the Europe-wide backup list (attractionCache/*) ---------------- */

let europe: { places: CachedPlace[]; at: number } | null = null;

/** functions/data/attractions-europe.json, written by `npm run attractions:build`. */
function bundledCache(): CachedPlace[] {
  try {
    return JSON.parse(readFileSync(join(__dirname, '..', '..', 'data', 'attractions-europe.json'), 'utf8')) as CachedPlace[];
  } catch {
    return [];
  }
}

async function europeCache(): Promise<CachedPlace[]> {
  if (europe && Date.now() - europe.at < 6 * HOUR) return europe.places;
  try {
    const db = getFirestore();
    const meta = (await db.collection('attractionCache').doc('meta').get()).data() as { parts?: number } | undefined;
    const places: CachedPlace[] = [];
    for (let i = 0; i < (meta?.parts ?? 0); i++) {
      const part = (await db.collection('attractionCache').doc(`part-${i}`).get()).data() as { places?: CachedPlace[] } | undefined;
      places.push(...(part?.places ?? []));
    }
    // Not built in Firestore yet: the copy deployed with the functions (functions/data/), if any.
    if (!places.length) places.push(...bundledCache());
    europe = { places, at: Date.now() };
  } catch (e) {
    logger.warn('attraction cache read failed', e);
    europe = { places: [], at: Date.now() };
  }
  return europe.places;
}

/** Places from the backup list within `radiusKm`. */
export async function cacheNear(lat: number, lon: number, radiusKm: number, lang: Lang): Promise<AttractionOut[]> {
  const places = await europeCache();
  return places
    .filter((p) => haversineKm(lat, lon, p.lat, p.lon) <= radiusKm)
    .map((p) => wdToAttraction(p, lang, p.credit) as AttractionOut);
}

/** Wikidata near a point: the live answer, topped up from the backup list (no duplicates). */
export async function freeAttractionsNear(lat: number, lon: number, radiusKm: number, lang: Lang, minSitelinks = 3): Promise<AttractionOut[]> {
  const [live, backup] = await Promise.all([wikidataNear(lat, lon, radiusKm, lang, minSitelinks), cacheNear(lat, lon, radiusKm, lang)]);
  const ids = new Set(live.map((a) => a.id));
  return [...live, ...backup.filter((a) => !ids.has(a.id))];
}

/* ---------------- OpenStreetMap restaurants (backup) ---------------- */

export async function osmRestaurantsNear(lat: number, lon: number, radiusKm: number, lang: Lang, want: number) {
  const key = `osm:rest:v1:${lat.toFixed(3)},${lon.toFixed(3)}:${radiusKm}:${lang}`;
  try {
    const { value } = await cached(
      key,
      7 * DAY,
      async () => {
        const res = await fetch(OVERPASS_URL, {
          method: 'POST',
          headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: restaurantsQuery(lat, lon, radiusKm) }).toString(),
          signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
        return osmRestaurants((await res.json()) as OverpassJson, lang);
      },
      (v) => v.length > 0,
    );
    return value.slice(0, want);
  } catch (e) {
    logger.warn('OpenStreetMap restaurants failed', { lat, lon, error: (e as Error).message });
    return [];
  }
}

/* ---------------- building the backup list ---------------- */

const deps: BuildDeps = {
  sparql: (q) => sparql(q, 55_000),
  commons,
  log: (m) => logger.info(`attraction cache: ${m}`),
};

/**
 * Runs the searches that are missing or more than 30 days old, as many as fit in `budgetMs`
 * (each answer is saved straight away, so the next run carries on), then saves the new list.
 */
export async function rebuildAttractionCache(budgetMs: number) {
  const db = getFirestore();
  const meta = (await db.collection('attractionCache').doc('meta').get()).data() as
    | { missing?: number; oldestSearchAt?: number }
    | undefined;
  // Nothing to do: every search answered and none older than 30 days (one read, no Wikidata calls).
  if (meta && meta.missing === 0 && typeof meta.oldestSearchAt === 'number' && Date.now() - meta.oldestSearchAt < SEARCH_MAX_AGE_MS) {
    return { count: 0, upToDate: true };
  }
  const r = await buildEuropeCache({ ...deps, store: firestoreSearchStore(db) }, { budgetMs, onlyIfChanged: !!meta });
  if (!r.changed && meta) return { count: 0, upToDate: false, missing: r.missing };
  if (r.places.length < 500) throw new Error(`only ${r.places.length} places found so far; keeping the previous list`);
  const batch = db.batch();
  for (const d of cacheDocs(r.places, Date.now(), { missing: r.missing, oldestSearchAt: r.oldestAt })) {
    batch.set(db.collection('attractionCache').doc(d.id), d.data);
  }
  await batch.commit();
  europe = null;
  return { count: r.places.length, missing: r.missing };
}

/**
 * Every night at 03:30 Israel time: refreshes the oldest saved searches (a few hundred at most;
 * most nights there is nothing to do). Twenty minutes of searching leaves time for names, photo
 * credits and saving inside the 30-minute limit.
 */
export const refreshAttractionCache = onSchedule(
  { schedule: '30 3 * * *', timeZone: 'Asia/Jerusalem', timeoutSeconds: 1800, memory: '1GiB' },
  async () => {
    await rebuildAttractionCache(20 * 60_000);
  },
);

/** Admins can rebuild it on demand (the first time, or after changing the rules). */
export const buildAttractionCache = onCall({ timeoutSeconds: 3600, memory: '1GiB' }, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Admins only');
  return rebuildAttractionCache(45 * 60_000);
});
