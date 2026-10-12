import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { DAY, HOUR, Lang, cached, haversineKm } from '../util';
import { BuildDeps, CachedPlace, SEARCH_MAX_AGE_MS, buildEuropeCache, cacheDocs, citySearchKey, firestoreSearchStore } from './build';
import { AttractionOut, typicalHours } from './merge';
import { KIND_TYPES, Kind, NOT_A_SIGHT, isPersonDescription } from './kinds';
import { GPlace, Lang as GLang, PLACES_FIELD_MASK, PLACES_NEARBY_URL, SIGHT_TYPES, googleToAttraction, nearbyBody, photoMediaUrl } from './googlePlaces';
import {
  EntitiesJson,
  EntityInfo,
  OVERPASS_URL,
  OsmSight,
  OverpassJson,
  PageImagesJson,
  entitiesUrl,
  localSights,
  localSightsQuery,
  osmRestaurants,
  osmSights,
  pageImagesUrl,
  readEntities,
  readPageImages,
  restaurantsQuery,
  sightsQuery,
  peopleQuery,
  readQids,
} from './osm';
import { EUROPE_CITIES } from './europeCities';
import { GeoHit, WikiPage, detailsUrl as wpDetailsUrl, geosearchUrl as wpGeosearchUrl, readGeosearch, wikiAttractions } from './wikipediaNearby';
import {
  CommonsInfo,
  SparqlJson,
  USER_AGENT,
  WDQS_URL,
  aroundQuery,
  commonsCreditsUrl,
  commonsImageUrl,
  commonsPage,
  parseCommonsCredits,
  parsePlaces,
  visitMinutesFor,
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

/**
 * The saved answers of the backup-list build for the cities around a point
 * (attractionSearches/*): usable as soon as those cities were searched, even before the whole
 * list is finished. A few document reads.
 */
async function savedSearchesNear(lat: number, lon: number, radiusKm: number): Promise<CachedPlace[]> {
  const near = EUROPE_CITIES.filter(([, , cLat, cLon]) => haversineKm(lat, lon, cLat, cLon) <= radiusKm + 15).slice(0, 8);
  if (!near.length) return [];
  try {
    const db = getFirestore();
    const snaps = await db.getAll(...near.map(([, cc, cLat, cLon]) => db.collection('attractionSearches').doc(citySearchKey(cc, cLat, cLon))));
    return snaps.flatMap((s: { data(): unknown }) => ((s.data() as { places?: CachedPlace[] } | undefined)?.places ?? []));
  } catch (e) {
    logger.warn('saved attraction searches read failed', e);
    return [];
  }
}

/** Places from the backup list (and the build's saved answers) within `radiusKm`. */
export async function cacheNear(lat: number, lon: number, radiusKm: number, lang: Lang): Promise<AttractionOut[]> {
  const [list, saved] = await Promise.all([europeCache(), savedSearchesNear(lat, lon, radiusKm)]);
  const seen = new Set<string>();
  return [...list, ...saved]
    .filter((p) => haversineKm(lat, lon, p.lat, p.lon) <= radiusKm && !seen.has(p.qid) && !!seen.add(p.qid))
    .map((p) => wdToAttraction(p, lang, p.credit) as AttractionOut);
}

/* ---------------- OpenStreetMap sights + Wikidata's API (third free source) ---------------- */

async function getJson<T>(url: string, init: RequestInit = {}, ms = 20_000): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  return (await res.json()) as T;
}

/**
 * Sights from OpenStreetMap that link to Wikidata, ranked by how many Wikipedias cover them
 * (Wikidata's own API — a different service from the query service the map search uses), with
 * names in the three languages and the lead photo of their Wikipedia article.
 * Cached 30 days per area; never throws.
 */
export async function osmSightsNear(lat: number, lon: number, radiusKm: number, lang: Lang, minSitelinks = 3): Promise<AttractionOut[]> {
  const r = Math.round(Math.max(1, Math.min(20, radiusKm)));
  // v3: people (a tomb linked to the person's Wikidata item) are left out.
  const key = `osm:sights:v3:${lat.toFixed(2)},${lon.toFixed(2)}:${r}:${minSitelinks}`;
  try {
    const { value } = await cached(
      key,
      30 * DAY,
      async () => {
        const osm = await getJson<OverpassJson>(
          OVERPASS_URL,
          { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: sightsQuery(lat, lon, r) }).toString() },
          35_000,
        );
        const sights = osmSights(osm);
        // Which items are people (asked at the same time as their names; a failed check only
        // leaves the description test below).
        const ids = sights.slice(0, 300).map((x) => x.qid);
        const people = (async () => {
          const found = new Set<string>();
          for (let i = 0; i < ids.length; i += 150) {
            const j = await sparql(peopleQuery(ids.slice(i, i + 150)), 15_000).catch(() => null);
            if (j) readQids(j as Parameters<typeof readQids>[0]).forEach((q) => found.add(q));
          }
          return found;
        })();
        const info = new Map<string, EntityInfo>();
        for (let i = 0; i < Math.min(sights.length, 300); i += 50) {
          const batch = sights.slice(i, i + 50).map((s) => s.qid);
          const j = await getJson<EntitiesJson>(entitiesUrl(batch)).catch(() => null);
          if (j) readEntities(j).forEach((v, k) => info.set(k, v));
        }
        const person = await people;
        const known = sights
          .filter((s) => !person.has(s.qid))
          .map((s) => ({ s, e: info.get(s.qid) }))
          .filter((x): x is { s: OsmSight; e: EntityInfo } => !!x.e && x.e.sitelinks >= minSitelinks && !isPersonDescription(x.e.description))
          .sort((a, b) => b.e.sitelinks - a.e.sitelinks)
          .slice(0, 150);
        // Lead photos of the English articles, for places without a photo on the map.
        const titles = known.filter((x) => !x.s.imageFile && x.e.articles.en).map((x) => x.e.articles.en!);
        const photos = new Map<string, string>();
        for (let i = 0; i < Math.min(titles.length, 100); i += 50) {
          const j = await getJson<PageImagesJson>(pageImagesUrl(titles.slice(i, i + 50))).catch(() => null);
          if (j) readPageImages(j).forEach((v, k) => photos.set(k, v));
        }
        const places: Array<CachedPlace & { hours?: OsmSight['hours'] }> = known.map(({ s, e }) => {
          const url = (l: Lang) => (e.articles[l] ? `https://${l}.wikipedia.org/wiki/${encodeURIComponent(e.articles[l]!.replace(/ /g, '_'))}` : undefined);
          return {
            qid: s.qid,
            name: e.labels.en || s.names.en || s.name,
            description: e.description,
            lat: s.lat,
            lon: s.lon,
            sitelinks: e.sitelinks,
            kind: s.kind,
            imageFile: s.imageFile ?? (e.articles.en ? photos.get(e.articles.en) : undefined),
            article: url('en'),
            names: { en: e.labels.en || s.names.en || s.name, he: e.labels.he || s.names.he, ru: e.labels.ru || s.names.ru },
            articles: { en: url('en'), he: url('he'), ru: url('ru') },
            hours: s.hours,
          };
        });
        const files = places.slice(0, 50).map((p) => p.imageFile).filter((f): f is string => !!f);
        const credits = files.length ? await commons(commonsCreditsUrl(files)).then(parseCommonsCredits).catch(() => new Map()) : new Map();
        for (const p of places) if (p.imageFile) p.credit = credits.get(p.imageFile);
        return places;
      },
      (v) => v.length > 0,
    );
    return value.map((p) => {
      const a = wdToAttraction(p, lang, p.credit) as AttractionOut;
      return p.hours ? { ...a, weeklyHours: p.hours, openingHours: typicalHours(p.hours), hoursSource: 'openstreetmap' as const } : a;
    });
  } catch (e) {
    logger.warn('OpenStreetMap sights failed', { lat, lon, r, error: (e as Error).message });
    return [];
  }
}

/**
 * Wikipedia's articles about places to visit around a point (wikipediaNearby.ts): where
 * Wikidata's classes and the map know little — West Africa, much of Asia. Cached 7 days per
 * area; never throws.
 */
export async function wikipediaNear(lat: number, lon: number, radiusKm: number, lang: Lang): Promise<AttractionOut[]> {
  const r = Math.round(Math.max(2, Math.min(10, radiusKm)));
  try {
    const { value } = await cached(
      `wp:sights:v2:${lat.toFixed(2)},${lon.toFixed(2)}:${r}:${lang}`,
      7 * DAY,
      async () => {
        const geo = await getJson<{ query?: { geosearch?: GeoHit[] } }>(wpGeosearchUrl(lat, lon, r), {}, 12_000);
        const hits = readGeosearch(geo);
        const pages: WikiPage[] = [];
        const batches: number[][] = [];
        for (let i = 0; i < Math.min(hits.length, 200); i += 50) batches.push(hits.slice(i, i + 50).map((h) => h.pageid));
        await Promise.all(
          batches.map(async (ids) => {
            const j = await getJson<{ query?: { pages?: WikiPage[] } }>(wpDetailsUrl(ids, lang), {}, 12_000).catch(() => null);
            pages.push(...(j?.query?.pages ?? []));
          }),
        );
        return wikiAttractions(hits, pages, lang);
      },
      (v) => v.length > 0,
    );
    return value;
  } catch (e) {
    logger.warn('Wikipedia sights failed', { lat, lon, error: (e as Error).message });
    return [];
  }
}

/**
 * Named sights on the map with or without a Wikidata link (village museums, springs, ruins,
 * viewpoints, nature reserves) — for the countryside and quiet towns, where few places are in
 * Wikipedia. Ranked by how well they are described on the map (6.0–7.4, below the well-known
 * places). Cached 30 days per area (OpenStreetMap data, ODbL); never throws.
 */
export async function localSightsNear(lat: number, lon: number, radiusKm: number, lang: Lang): Promise<AttractionOut[]> {
  const r = Math.round(Math.max(2, Math.min(50, radiusKm)));
  const key = `osm:local:v1:${lat.toFixed(2)},${lon.toFixed(2)}:${r}`;
  try {
    const { value } = await cached(
      key,
      30 * DAY,
      async () => {
        const osm = await getJson<OverpassJson>(
          OVERPASS_URL,
          { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: localSightsQuery(lat, lon, r) }).toString() },
          35_000,
        );
        return localSights(osm).slice(0, 150);
      },
      (v) => v.length > 0,
    );
    return value
      .filter((s) => !NOT_A_SIGHT.has(s.kind as never))
      .map((s): AttractionOut => {
        const wiki = s.wikipedia?.match(/^([a-z-]+):(.+)$/);
        const article = wiki ? `https://${wiki[1]}.wikipedia.org/wiki/${encodeURIComponent(wiki[2].replace(/ /g, '_'))}` : undefined;
        const photo = s.imageFile ? commonsImageUrl(s.imageFile) : undefined;
        return {
          id: s.id,
          name: s.names[lang] || s.name,
          description: s.description,
          descriptionSource: s.description ? 'openstreetmap' : undefined,
          types: KIND_TYPES[s.kind],
          country: '',
          price: null,
          link: article ?? s.page,
          photo_urls: photo ? [photo] : [],
          photoSources: photo ? [{ url: photo, sourcePage: commonsPage(s.imageFile!), credit: 'Wikimedia Commons' }] : [],
          location: { locLat: s.lat, locLon: s.lon },
          openingHours: typicalHours(s.hours),
          weeklyHours: s.hours,
          hoursSource: s.hours ? 'openstreetmap' : undefined,
          provider: 'openstreetmap',
          category: s.kind,
          kind: s.kind,
          popularity: s.popularity,
          suggestedMinutes: visitMinutesFor(s.kind),
          address: '',
          website: s.website ?? '',
          wikidataId: s.qid,
        };
      });
  } catch (e) {
    logger.warn('OpenStreetMap local sights failed', { lat, lon, r, error: (e as Error).message });
    return [];
  }
}

/* ---------------- Google Places (needs "Places API (New)" on the server key) ---------------- */

/** After a refusal (API not enabled, key restricted, billing off) Google rests for a few hours. */
let googleOffUntil = 0;
/**
 * The same city asked twice within a few minutes (a trip re-planned) is answered from memory.
 * Nothing from Google is written to Firestore: its terms don't allow storing its content.
 */
const googleMemory = new Map<string, { at: number; items: AttractionOut[] }>();
const GOOGLE_MEMORY_MS = 15 * 60_000;

async function googleNearby(lat: number, lon: number, radiusKm: number, lang: GLang, key: string, types: string[], rank: 'POPULARITY' | 'DISTANCE' = 'POPULARITY') {
  return fetch(PLACES_NEARBY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': PLACES_FIELD_MASK },
    body: JSON.stringify(nearbyBody(lat, lon, radiusKm, lang, types, rank)),
    signal: AbortSignal.timeout(15_000),
  });
}

/**
 * Google's 20 best-known sights within `radiusKm` (up to 50 km): ratings, opening hours kept up
 * to date by the places themselves, and a short description — anywhere in the world. Never throws.
 */
export async function googleSightsNear(
  lat: number,
  lon: number,
  radiusKm: number,
  lang: Lang,
  key: string,
  types: string[] = SIGHT_TYPES,
  allow: ReadonlySet<Kind> = new Set(),
): Promise<AttractionOut[]> {
  if (!key || Date.now() < googleOffUntil || !types.length) return [];
  const memo = `${lat.toFixed(3)},${lon.toFixed(3)}:${Math.round(radiusKm)}:${lang}:${types === SIGHT_TYPES ? '' : types.join(',')}`;
  const hit = googleMemory.get(memo);
  if (hit && Date.now() - hit.at < GOOGLE_MEMORY_MS) return hit.items;
  try {
    let res = await googleNearby(lat, lon, radiusKm, lang, key, types);
    // A type this API version doesn't know: the one type every version has.
    if (res.status === 400 && types === SIGHT_TYPES) res = await googleNearby(lat, lon, radiusKm, lang, key, ['tourist_attraction']);
    if (res.status === 403 || res.status === 401) {
      googleOffUntil = Date.now() + 3 * HOUR;
      logger.warn('Google Places refused (enable "Places API (New)" for GOOGLE_SERVER_KEY); trying again in 3 hours', {
        status: res.status,
        body: (await res.text()).slice(0, 300),
      });
      return [];
    }
    if (!res.ok) {
      logger.warn('Google Places error', { status: res.status, body: (await res.text()).slice(0, 300) });
      return [];
    }
    const j = (await res.json()) as { places?: GPlace[] };
    const items = (j.places ?? []).map((p) => googleToAttraction(p, allow)).filter((a): a is AttractionOut => !!a);
    googleMemory.set(memo, { at: Date.now(), items });
    if (googleMemory.size > 500) googleMemory.delete(googleMemory.keys().next().value!);
    return items;
  } catch (e) {
    logger.warn('Google Places failed', { lat, lon, error: (e as Error).message });
    return [];
  }
}

const restaurantMemory = new Map<string, { at: number; places: GPlace[] }>();

/**
 * Restaurants on Google Maps around a point (its 20 best-known within `radiusKm`), or null when
 * Google could not be asked (no key, refused, down) — then nothing can be checked. Never throws.
 */
export async function googleRestaurantsNear(
  lat: number,
  lon: number,
  radiusKm: number,
  lang: Lang,
  key: string,
  rank: 'POPULARITY' | 'DISTANCE' = 'POPULARITY',
): Promise<GPlace[] | null> {
  if (!key || Date.now() < googleOffUntil) return null;
  const memo = `${lat.toFixed(3)},${lon.toFixed(3)}:${Math.round(radiusKm * 10)}:${lang}:${rank}`;
  const hit = restaurantMemory.get(memo);
  if (hit && Date.now() - hit.at < GOOGLE_MEMORY_MS) return hit.places;
  try {
    const res = await googleNearby(lat, lon, radiusKm, lang, key, ['restaurant'], rank);
    if (res.status === 403 || res.status === 401) {
      googleOffUntil = Date.now() + 3 * HOUR;
      logger.warn('Google Places refused restaurants; trying again in 3 hours', { status: res.status, body: (await res.text()).slice(0, 300) });
      return null;
    }
    if (!res.ok) {
      logger.warn('Google Places restaurants error', { status: res.status, body: (await res.text()).slice(0, 300) });
      return null;
    }
    const places = ((await res.json()) as { places?: GPlace[] }).places ?? [];
    restaurantMemory.set(memo, { at: Date.now(), places });
    if (restaurantMemory.size > 500) restaurantMemory.delete(restaurantMemory.keys().next().value!);
    return places;
  } catch (e) {
    logger.warn('Google Places restaurants failed', { lat, lon, error: (e as Error).message });
    return null;
  }
}

/**
 * Photos for the Google places in the answer that have none from another source (one request per
 * photo, so only for the places actually returned). Google's photo links need no key.
 */
export async function addGooglePhotos(items: AttractionOut[], key: string, max = 8): Promise<void> {
  const need = items.filter((a) => !a.photo_urls.length && typeof a.googlePhoto === 'string').slice(0, max);
  await Promise.all(
    need.map(async (a) => {
      try {
        const res = await fetch(photoMediaUrl(a.googlePhoto as string, key), { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return;
        const { photoUri } = (await res.json()) as { photoUri?: string };
        if (!photoUri) return;
        const c = a.googlePhotoCredit as { credit: string; sourcePage: string } | undefined;
        a.photo_urls = [photoUri];
        a.photoSources = [{ url: photoUri, sourcePage: c?.sourcePage ?? String(a.link ?? ''), credit: c?.credit ?? 'Google Maps' }];
      } catch {
        /* no photo: the card shows its placeholder */
      }
    }),
  );
}

/** Removes the photo references used only on the server before answering. */
export function stripGoogleRefs(items: AttractionOut[]): void {
  for (const a of items) {
    delete a.googlePhoto;
    delete a.googlePhotoCredit;
  }
}

export interface FreeCounts {
  wikidata: number;
  osm: number;
  backup: number;
  /** Map sights without a Wikidata link (quiet areas only). */
  local?: number;
}

/** A source that takes too long counts as empty (the planner can't wait for it). */
export const within = <T>(ms: number, p: Promise<T>, fallback: T) => Promise.race([p, new Promise<T>((ok) => setTimeout(() => ok(fallback), ms))]);

const unique = (lists: AttractionOut[][]) => {
  const ids = new Set<string>();
  const items: AttractionOut[] = [];
  for (const a of lists.flat()) {
    if (ids.has(a.id)) continue;
    ids.add(a.id);
    items.push(a);
  }
  return items.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
};

/**
 * The free sources together: Wikidata's map search, OpenStreetMap + Wikidata's API, and the
 * backup list — one entry per place (same Wikidata item = same place), with how many each gave.
 */
export async function freeAttractionsNear(
  lat: number,
  lon: number,
  radiusKm: number,
  lang: Lang,
  minSitelinks = 3,
  waitMs = 60_000,
): Promise<{ items: AttractionOut[]; counts: FreeCounts }> {
  const [live, osm, backup] = await Promise.all([
    within(waitMs, wikidataNear(lat, lon, radiusKm, lang, minSitelinks), []),
    within(waitMs, osmSightsNear(lat, lon, Math.min(radiusKm, 20), lang, minSitelinks), []),
    within(Math.min(waitMs, 20_000), cacheNear(lat, lon, radiusKm, lang), []),
  ]);
  return { items: unique([live, osm, backup]), counts: { wikidata: live.length, osm: osm.length, backup: backup.length } };
}

/** Fewer places than this around a town → the search widens (countryside, small towns, deserts). */
export const QUIET_AREA = 15;

/**
 * The second, wider look for quiet areas: Wikidata places known to even one Wikipedia, and the
 * map's own sights (springs, ruins, village museums, reserves) up to `radiusKm` around.
 */
export async function quietAreaAttractionsNear(lat: number, lon: number, radiusKm: number, lang: Lang, waitMs = 30_000) {
  const [live, local, backup] = await Promise.all([
    within(waitMs, wikidataNear(lat, lon, radiusKm, lang, 1), []),
    within(waitMs, localSightsNear(lat, lon, Math.min(radiusKm, 40), lang), []),
    within(Math.min(waitMs, 15_000), cacheNear(lat, lon, radiusKm, lang), []),
  ]);
  return { items: unique([live, backup, local]), counts: { wikidata: live.length, local: local.length, backup: backup.length } };
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
 * most nights there is nothing to do). Seventeen minutes of searching leaves time for names, photo
 * credits and saving (about 5 minutes for 10,000 places) inside the 30-minute limit.
 */
export const refreshAttractionCache = onSchedule(
  { schedule: '30 3 * * *', timeZone: 'Asia/Jerusalem', timeoutSeconds: 1800, memory: '1GiB' },
  async () => {
    await rebuildAttractionCache(17 * 60_000); // + ~5 min of names and photo credits for 10,000 places
  },
);

/** Admins can rebuild it on demand (the first time, or after changing the rules). */
export const buildAttractionCache = onCall({ timeoutSeconds: 3600, memory: '1GiB' }, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Admins only');
  return rebuildAttractionCache(45 * 60_000);
});
