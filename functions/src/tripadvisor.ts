import { AsyncLocalStorage } from 'node:async_hooks';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { HotelOut, Stay } from './hotels/types';
import { BOOKING_AFFILIATE_ID, GOOGLE_PLACES_SIGHTS, GOOGLE_SERVER_KEY, TRIPADVISOR_KEY, TRIPADVISOR_QPS } from './params';
import { RateGate } from './rateGate';
import { LimiterStore, SharedLimiter, isSearchPath } from './terraLimiter';
import { QUIET_AREA, addGooglePhotos, cacheNear, freeAttractionsNear, googleRestaurantsNear, googleSightsNear, osmRestaurantsNear, osmSightsNear, quietAreaAttractionsNear, stripGoogleRefs, wikidataNear, wikipediaNear, within } from './attractions';
import { AttractionOut, isLandmark, mergeSources, uniqueRestaurants } from './attractions/merge';
import { NOT_A_MEAL, NOT_A_SIGHT, isNotARestaurant, Kind, eateryKind, isEventDescription, isOrganization, isPersonDescription } from './attractions/kinds';
import { extraTypesFor, googleToRestaurant, isGoogleRestaurant } from './attractions/googlePlaces';
import { mapAccessNear, parseNeeds, withAccessibility } from './accessibility';
import { AreaStore, NearbyQuery, TerraTransport, areaKey, locationsById, nearbyPlaces } from './terraFlow';
import {
  TERRA_MAX_RADIUS_KM,
  TERRA_REVIEW_LANG,
  TerraLocation,
  TerraPage,
  TerraPhoto,
  TerraReview,
  isLodging,
  isTaRestaurant,
  localesFor,
  onlyFood,
  servesFood,
  terraHeaders,
  terraUrl,
  toAttraction,
  toHotel,
  toRestaurant,
  toReview,
} from './tripadvisorMap';
import { Lang, isLang, isWarmup, requireAuth, requireNumber, requireString, secret } from './util';

export { toAttraction } from './tripadvisorMap';

/**
 * Tripadvisor Terra API — attractions, restaurants, hotels, photos and reviews (mapping in
 * tripadvisorMap.ts). Each place links to its Tripadvisor page and each review to the review.
 *
 * The request logic (allowlist, paging, fallbacks) is in terraFlow.ts, tested against a simulated
 * Terra server. Only Location IDs are kept in Firestore (taAreas/*), as Terra's caching policy
 * allows; content is never cached.
 */

/**
 * Two limits (docs.terra.tripadvisor.com → Rate Limits):
 *  - searches (`/locations/nearby`, `/locations/search` and their catalog versions) share ONE
 *    bucket of 1 request per second, burst 5, on every plan. Attractions, restaurants and hotels
 *    run on separate servers, so their searches take turns through a schedule kept in Firestore
 *    (terraLimiter.ts). Firefly used to send up to 3 a second from each server: everything after
 *    the first five was refused with 429 — which the Terra dashboard doesn't show — so areas were
 *    never added to the allowlist and Tripadvisor gave no attractions.
 *  - everything else (details, photos, reviews): the plan's own limit (Discover: 10 per second),
 *    kept per server with `TRIPADVISOR_QPS`.
 */
let gate: RateGate | null = null;
const tripadvisorGate = () => (gate ??= new RateGate(Number(TRIPADVISOR_QPS.value()) || 3, 30_000));

const limiterStore: LimiterStore = {
  update: (fn) =>
    getFirestore().runTransaction(async (tx: { get(r: unknown): Promise<{ data(): unknown }>; set(r: unknown, v: unknown): void }) => {
      const ref = getFirestore().collection('rateLimits').doc('terraSearch');
      const tat = Number((((await tx.get(ref)).data() as { tat?: number } | undefined) ?? {}).tat) || 0;
      const r = fn(tat);
      if (r.tat !== tat) tx.set(ref, { tat: r.tat, at: Date.now() });
      return r.result;
    }),
};
let searchLimiter: SharedLimiter | null = null;
const searches = () =>
  (searchLimiter ??= new SharedLimiter(limiterStore, undefined, undefined, undefined, (m, e) => logger.warn(m, { error: (e as Error)?.message })));

/** The HTTP answers Tripadvisor gave inside one request of ours (for the trip's "sources" line). */
const statusLog = new AsyncLocalStorage<number[]>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(path: string, params: Record<string, string | number | boolean | string[] | undefined>, init: RequestInit = {}) {
  const search = isSearchPath(path);
  for (let attempt = 1; ; attempt++) {
    // Wait for our turn; "busy" at once when the queue is too long (the other sources answer).
    const go = search ? await searches().take() : await tripadvisorGate().wait();
    if (!go) {
      statusLog.getStore()?.push(429);
      logger.info('Tripadvisor queue too long: answering busy', { path });
      return { status: 429, body: null as T | null };
    }
    const res = await fetch(terraUrl(path, params), {
      ...init,
      headers: { ...terraHeaders(secret(TRIPADVISOR_KEY)), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    statusLog.getStore()?.push(res.status);
    if (res.status === 429) {
      const after = Number(res.headers.get('retry-after'));
      const ms = Number.isFinite(after) && after > 0 ? Math.min(10_000, after * 1000) : 2000 * attempt;
      // Everyone holds back (not just this request), so the bucket can refill.
      if (search) await searches().pause(ms);
      if (attempt < 3) {
        logger.info('Tripadvisor 429: trying again', { path, attempt, waitMs: ms, body: text.slice(0, 200) });
        if (!search) await sleep(ms);
        continue;
      }
      if (!search) tripadvisorGate().coolDown();
      logger.warn('Tripadvisor still answers 429 (rate limit or the daily quota); the free sources answer meanwhile', { path, body: text.slice(0, 300) });
    } else if (!res.ok && res.status !== 404) logger.warn('Tripadvisor error', { path, status: res.status, body: text.slice(0, 300) });
    let body: T | null = null;
    try {
      body = JSON.parse(text) as T;
    } catch {
      /* not JSON */
    }
    return { status: res.status, body };
  }
}

/** The real Terra API, for terraFlow.ts. */
const transport: TerraTransport = {
  get: (path, params) => call(path, params),
  post: (path, body) => call(path, {}, { method: 'POST', body: JSON.stringify(body) }),
};

/** Licensed areas: Location IDs only (taAreas/*), as Terra's caching policy allows. */
const areas: AreaStore = {
  get: async (key) => (await getFirestore().collection('taAreas').doc(key).get()).data() as { ids?: number[]; want?: number; at?: number } | undefined,
  set: async (key, value) => {
    await getFirestore().collection('taAreas').doc(key).set(value);
  },
};

async function places(q: NearbyQuery) {
  const r = await nearbyPlaces(transport, areas, q);
  if (r.licensed) logger.info('Tripadvisor allowlist updated', { area: areaKey(q), added: r.licensed });
  if (r.fallback) logger.warn('Tripadvisor: using catalog data', { area: areaKey(q) });
  return r.items;
}

const terra = <T>(path: string, params: Record<string, string | number | boolean | string[] | undefined> = {}) => call<T>(path, params);

function args(data: unknown) {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    lat: requireNumber(d.lat, 'lat', -90, 90),
    lon: requireNumber(d.lon, 'lon', -180, 180),
    lang: (isLang(d.lang) ? d.lang : 'en') as Lang,
    d,
  };
}

const notConfigured = () => {
  if (!secret(TRIPADVISOR_KEY)) throw new HttpsError('failed-precondition', 'TRIPADVISOR_KEY is not configured');
};

/* ---------------- callables ---------------- */

type TripadvisorState = 'ok' | 'busy' | 'off' | 'error';

/**
 * Attractions asked from Tripadvisor per city: its 20 best-rated — one page, so one search (of the
 * one-a-second bucket) per city once the area is licensed; the other sources fill in the rest.
 */
const TRIPADVISOR_ATTRACTIONS = 20;
/** The answer goes out by then, with whatever the sources have given (the app waits up to 90 s). */
const ANSWER_BY_MS = 50_000;
/** …or already after this long, when the sources that answered give the town ENOUGH_PLACES. */
const EARLY_ANSWER_MS = 12_000;
const ENOUGH_PLACES = 25;
/** Accessibility checks (venue websites): 15–35 s, ending by 100 s after the request at the latest. */
const ACCESS_MIN_MS = 15_000;
const ACCESS_MAX_MS = 35_000;
const ACCESS_BY_MS = 100_000;
/** Restaurants per town: one page as well. */
const TRIPADVISOR_RESTAURANTS = 20;

/** Tripadvisor attractions, or [] with the reason and the HTTP answers seen (never throws). */
async function tripadvisorAttractions(
  lat: number,
  lon: number,
  radiusKm: number,
  lang: Lang,
  want: number,
): Promise<{ items: AttractionOut[]; state: TripadvisorState; http: number[] }> {
  if (!secret(TRIPADVISOR_KEY)) return { items: [], state: 'off', http: [] };
  if (tripadvisorGate().cooling) return { items: [], state: 'busy', http: [429] };
  const http: number[] = [];
  try {
    const list = await statusLog.run(http, () =>
      places({ lat, lon, radiusKm: Math.min(TERRA_MAX_RADIUS_KM, radiusKm), category: 'ATTRACTION', lang, want: Math.min(TRIPADVISOR_ATTRACTIONS, want) }),
    );
    // Hotels and places filed only under food are not attractions, whatever the search returned.
    const items = list
      .filter((n) => !isLodging(n.location) && !onlyFood(n.location))
      .map((n) => toAttraction(n.location, n.photo ? [n.photo] : [], lang)) as unknown as AttractionOut[];
    const refused = http.some((h) => h === 429) && !items.length;
    const failed = !items.length && http.some((h) => h >= 400 && h !== 404 && h !== 429);
    if (!items.length) logger.warn('Tripadvisor gave no attractions', { lat, lon, http });
    return { items, state: refused ? 'busy' : failed ? 'error' : 'ok', http: [...new Set(http)] };
  } catch (e) {
    logger.warn('Tripadvisor attractions failed', e);
    return { items: [], state: tripadvisorGate().cooling ? 'busy' : 'error', http: [...new Set(http)] };
  }
}

/**
 * Attractions near a point, from every source at once, duplicates merged (attractions/merge.ts):
 * Tripadvisor (main source), Google Places (worldwide, with opening hours), Wikidata (live map
 * search + the Europe-wide list) and OpenStreetMap. Where they find fewer than 15 places — the
 * countryside, small towns, deserts — the search widens to ~35–40 km and also takes the map's
 * own sights (springs, ruins, village museums). Bike rentals, bars and spas are never returned;
 * shops, night clubs and cafés only for the trip types that want them (`types`). `landmarks: true` asks only for world-class nature and heritage sites (used to find
 * stops like Plitvice between two cities).
 */
export const attractionsNear = onCall({ secrets: [TRIPADVISOR_KEY, GOOGLE_SERVER_KEY], timeoutSeconds: 180 }, async (req) => {
  if (isWarmup(req)) return { warm: true };
  requireAuth(req);
  const { lat, lon, lang, d } = args(req.data);
  const want = Math.min(80, Math.max(1, Math.round(Number(d.want) || 10)));
  const radiusKm = Math.max(1, Math.min(60, Number(d.radiusKm) || TERRA_MAX_RADIUS_KM));
  if (d.landmarks === true) {
    // Landmarks on the way: the backup list answers at once; the live searches get 20 s at most.
    const free = await freeAttractionsNear(lat, lon, radiusKm, lang, 25, 20_000);
    return { items: free.items.filter((a) => isLandmark(a)).slice(0, want), tripadvisor: 'off' as TripadvisorState };
  }
  // Places to visit and activities only: never bars or shops, nor tour companies, agencies and guest houses.
  // Nor people (a tomb on the map linked to the person's Wikidata item: "Sultan of Morocco…") or
  // events (Wikipedia's "2010 Mount Carmel forest fire").
  // The traveller's trip types: shops, night clubs, and cafés / sweets (with Food) only when chosen.
  const types = Array.isArray(d.types) ? d.types.filter((t): t is string => typeof t === 'string').slice(0, 12) : [];
  const allowKinds = new Set<Kind>([...(types.includes('Shopping') ? (['shopping'] as const) : []), ...(types.includes('Night Clubs') ? (['nightlife'] as const) : [])]);
  const eatOk = (a: AttractionOut) => {
    const e = eateryKind(a);
    return e === null || (e === 'sweets' && types.includes('Food'));
  };
  const sight = (a: AttractionOut) =>
    (!a.kind || !NOT_A_SIGHT.has(a.kind) || allowKinds.has(a.kind)) &&
    !isOrganization(a) &&
    eatOk(a) &&
    !(a.provider === 'wikidata' && (isPersonDescription(String(a.description ?? '')) || isEventDescription(String(a.description ?? ''), a.name)));
  const gKey = GOOGLE_PLACES_SIGHTS.value() === 'off' ? '' : secret(GOOGLE_SERVER_KEY);
  // Every source runs at once and the answer goes out by ANSWER_BY_MS whatever happens, with what
  // has arrived by then (the app gives up after 90 s, and a slow source must never cost the trip
  // all its sights). The free sources look a little wider than Tripadvisor's 8 km.
  const started = Date.now();
  const left = () => ANSWER_BY_MS - (Date.now() - started);
  // Accessibility needs (only when the traveller chose some): OpenStreetMap's tags for the area
  // are asked now, alongside the sources.
  const needs = parseNeeds(d.needs);
  const mapAccess = needs.length ? mapAccessNear(lat, lon, Math.max(radiusKm, 12), needs) : undefined;
  const got: {
    ta?: { items: AttractionOut[]; state: TripadvisorState; http: number[] };
    google?: AttractionOut[];
    wikidata?: AttractionOut[];
    osm?: AttractionOut[];
    wikipedia?: AttractionOut[];
    backup?: AttractionOut[];
    wide?: { items: AttractionOut[]; counts: { wikidata: number; local: number; backup: number } };
    googleWide?: AttractionOut[];
    googleExtra?: AttractionOut[];
  } = {};
  const answered = () => [got.ta?.items ?? [], got.google ?? [], got.googleExtra ?? [], got.googleWide ?? [], got.wikidata ?? [], got.osm ?? [], got.backup ?? [], got.wide?.items ?? [], got.wikipedia ?? []];
  const done = Promise.all([
    tripadvisorAttractions(lat, lon, radiusKm, lang, want).then((r) => (got.ta = r)),
    (async () => {
      const near = Math.max(radiusKm, 12);
      // Each source on its own, so the quick ones count as soon as they answer.
      await Promise.all([
        within(15_000, googleSightsNear(lat, lon, near, lang, gKey), []).then((r) => (got.google = r)),
        // Shops, beaches, adventure parks, clubs, cafés… for travellers who chose those types.
        within(15_000, googleSightsNear(lat, lon, near, lang, gKey, extraTypesFor(types), allowKinds), []).then((r) => (got.googleExtra = r)),
        within(20_000, cacheNear(lat, lon, near, lang), []).then((r) => (got.backup = r)),
        within(30_000, wikidataNear(lat, lon, near, lang, 3), []).then((r) => (got.wikidata = r)),
        within(30_000, osmSightsNear(lat, lon, Math.min(near, 20), lang, 3), []).then((r) => (got.osm = r)),
        // Wikipedia's articles: sights where Wikidata's classes and the map know little (West Africa…).
        within(20_000, wikipediaNear(lat, lon, Math.min(near, 10), lang), []).then((r) => (got.wikipedia = r)),
      ]);
      const found = mergeSources(answered()).filter(sight).length;
      // A quiet area (and time left): look wider, and for the less famous places too.
      if (found >= QUIET_AREA || left() < 15_000) return;
      const wait = Math.min(20_000, left() - 5_000);
      await Promise.all([
        quietAreaAttractionsNear(lat, lon, 35, lang, wait).then((r) => (got.wide = r)),
        within(Math.min(15_000, wait), googleSightsNear(lat, lon, 40, lang, gKey), []).then((r) => (got.googleWide = r)),
      ]);
    })(),
  ]);
  // Answer early when the sources that answered already give the town plenty of places
  // (Tripadvisor, Google and the backup list usually do within a few seconds); otherwise wait
  // for the slower free ones, up to the deadline.
  let finished = false;
  const all = done.then(() => {
    finished = true;
  });
  await within(EARLY_ANSWER_MS, all, undefined);
  if (!finished && mergeSources(answered()).filter(sight).length < ENOUGH_PLACES) await within(Math.max(0, left()), all, undefined);
  const late = [!got.ta && 'tripadvisor', !got.google && 'google', !got.wikidata && 'wikidata', !got.osm && 'osm', !got.backup && 'backup'].filter(Boolean);
  const ta = got.ta ?? { items: [] as AttractionOut[], state: 'busy' as TripadvisorState, http: [] as number[] };
  // Tripadvisor first (its record is kept for a place several sources know), then Google, then the free ones.
  const items = mergeSources(answered())
    .filter(sight)
    .slice(0, want);
  if (gKey && left() > 3_000) await within(Math.min(8_000, left()), addGooglePhotos(items, gKey), undefined);
  stripGoogleRefs(items);
  // Only when the traveller chose accessibility needs: check each place for exactly those needs
  // (the map's tags were asked at the start; venue websites get what time is left, so the
  // answer stays well within the app's wait).
  const checked = needs.length
    ? await withAccessibility(items as Array<AttractionOut & { website?: string }>, needs, {
        map: mapAccess,
        deadline: Math.max(Date.now() + ACCESS_MIN_MS, Math.min(Date.now() + ACCESS_MAX_MS, started + ACCESS_BY_MS)),
      })
    : items;
  const sources = {
    tripadvisor: ta.items.length,
    tripadvisorHttp: ta.http,
    google: (got.google?.length ?? 0) + (got.googleWide?.length ?? 0) + (got.googleExtra?.length ?? 0),
    wikidata: (got.wikidata?.length ?? 0) + (got.wide?.counts.wikidata ?? 0),
    osm: (got.osm?.length ?? 0) + (got.wide?.counts.local ?? 0),
    backup: (got.backup?.length ?? 0) + (got.wide?.counts.backup ?? 0),
    wikipedia: got.wikipedia?.length ?? 0,
    widened: !!got.wide,
  };
  if (late.length) logger.info('attractionsNear answered before some sources', { late, ms: Date.now() - started });
  logger.info('attractionsNear', { lat: lat.toFixed(3), lon: lon.toFixed(3), returned: checked.length, tripadvisorState: ta.state, ms: Date.now() - started, ...sources });
  return { items: checked, tripadvisor: ta.state, sources };
});

/**
 * Restaurants come from Google Maps: only places Google Maps itself calls a restaurant
 * (attractions/googlePlaces.ts → isGoogleRestaurant), the best-known first, then the nearest when
 * more are wanted. Tripadvisor's restaurant search also returns tour operators, chauffeurs, hotels
 * and "things to do" ("DanaTrips", "VISITALY … N.C.C."), so it is asked only when Google can't be
 * (no key, refused, down) — and then only for places Tripadvisor itself files as restaurants
 * (a restaurant page, eating-and-drinking categories, never "things to do"), with OpenStreetMap
 * filling in. The same restaurant is listed once.
 */
export const restaurantsNear = onCall({ secrets: [TRIPADVISOR_KEY, GOOGLE_SERVER_KEY], timeoutSeconds: 120 }, async (req) => {
  if (isWarmup(req)) return { warm: true };
  requireAuth(req);
  const { lat, lon, lang, d } = args(req.data);
  const want = Math.min(40, Math.max(1, Math.round(Number(d.want) || 10)));
  const meal = (r: unknown) => {
    const x = r as { name?: string; description?: string; cuisine?: string[] };
    // Somewhere to eat a meal: not a beer spa or a cooking class, nor a transfer service or tour seller.
    return !!x.name && !NOT_A_MEAL.test(`${x.name ?? ''} ${x.description ?? ''} ${(x.cuisine ?? []).join(' ')}`) && !isNotARestaurant(x);
  };
  const gKey = secret(GOOGLE_SERVER_KEY);
  const popular = await within(15_000, googleRestaurantsNear(lat, lon, RESTAURANT_RADIUS_KM, lang, gKey), null);
  if (popular) {
    let places = popular.filter(isGoogleRestaurant);
    // More wanted than Google's 20 best-known: the nearest ones too.
    if (places.length < want) {
      const nearest = (await within(15_000, googleRestaurantsNear(lat, lon, RESTAURANT_RADIUS_KM, lang, gKey, 'DISTANCE'), null)) ?? [];
      const seen = new Set(places.map((p) => p.id));
      places = [...places, ...nearest.filter((p) => isGoogleRestaurant(p) && !seen.has(p.id))];
    }
    const items = uniqueRestaurants(places.map(googleToRestaurant).filter(meal)).slice(0, want);
    logger.info('restaurantsNear', { lat: lat.toFixed(3), lon: lon.toFixed(3), source: 'google', google: places.length, returned: items.length });
    return { items, tripadvisor: 'off' as TripadvisorState, checked: 'google' as const };
  }
  // Google can't be asked: Tripadvisor's own restaurants (never its "things to do"), then the map's.
  logger.warn('restaurantsNear: Google Maps unavailable, using Tripadvisor restaurants checked by their pages and categories', { lat, lon });
  let items: Array<{ name: string; location: { locLat: number; locLon: number } }> = [];
  let state: TripadvisorState = secret(TRIPADVISOR_KEY) ? 'ok' : 'off';
  if (state === 'ok' && !tripadvisorGate().cooling) {
    try {
      const list = await places({ lat, lon, radiusKm: 5, category: 'RESTAURANT', lang, want: Math.min(want, TRIPADVISOR_RESTAURANTS), catalogFallback: false });
      items = list.filter((n) => isTaRestaurant(n.location)).map((n) => toRestaurant(n.location, n.photo ? [n.photo] : [], lang));
    } catch (e) {
      logger.warn('Tripadvisor restaurants failed', e);
      state = 'error';
    }
  }
  if (tripadvisorGate().cooling) state = 'busy';
  items = items.filter(meal);
  if (items.length < Math.min(want, 4)) {
    const osm = (await osmRestaurantsNear(lat, lon, 3, lang, want - items.length)).filter(meal);
    items = [...items, ...osm];
  }
  return { items: uniqueRestaurants(items).slice(0, want), tripadvisor: state, checked: 'names' as const };
});


/** Restaurants are looked for this far around a town's centre on Google Maps. */
const RESTAURANT_RADIUS_KM = 4;


/** Tripadvisor hotels near a point (the last fallback of hotels/index.ts → hotelsNear). */
export async function tripadvisorHotels(lat: number, lon: number, lang: Lang, stay: Stay): Promise<HotelOut[]> {
  const list = await places({ lat, lon, radiusKm: TERRA_MAX_RADIUS_KM, category: 'HOTEL', lang, want: 6 });
  return list.map((n) => toHotel(n.location, n.photo ? [n.photo] : [], stay, lang, BOOKING_AFFILIATE_ID.value()));
}

/** "Must-see" picker: attractions by name (nearest to the trip's start first, if given). */
export const placeSearch = onCall({ secrets: [TRIPADVISOR_KEY], timeoutSeconds: 60 }, async (req) => {
  if (isWarmup(req)) return { warm: true };
  requireAuth(req);
  notConfigured();
  const d = (req.data ?? {}) as Record<string, unknown>;
  const lang: Lang = isLang(d.lang) ? d.lang : 'en';
  const query = requireString(d.query, 'query', 120);
  const q = { query, category: 'ATTRACTION', size: 6, locale: localesFor(lang) };
  let found = (await terra<TerraPage<{ location: TerraLocation }>>('/locations/search', q)).body?.data?.map((x) => x.location) ?? [];
  if (!found.length) {
    const catalog = (await terra<TerraPage<{ location: TerraLocation }>>('/catalog/locations/search', q)).body?.data ?? [];
    found = await locationsById(transport, catalog.map((c) => c.location.id), lang);
  }
  if (typeof d.lat === 'number' && typeof d.lon === 'number') {
    const dist = (l: TerraLocation) => Math.hypot((l.coordinates?.latitude ?? 0) - (d.lat as number), (l.coordinates?.longitude ?? 0) - (d.lon as number));
    found.sort((a, b) => dist(a) - dist(b));
  }
  return { items: found.filter((l) => l.coordinates).map((l) => toAttraction(l, [], lang)) };
});

/** Attraction page: description, up to 5 photos and up to 5 reviews, each linked to the review. */
export const attractionDetails = onCall({ secrets: [TRIPADVISOR_KEY] }, async (req) => {
  requireAuth(req);
  notConfigured();
  const d = (req.data ?? {}) as Record<string, unknown>;
  const lang: Lang = isLang(d.lang) ? d.lang : 'en';
  const id = requireString(d.id, 'id', 20);
  if (!/^\d+$/.test(id)) throw new HttpsError('invalid-argument', 'Not a Tripadvisor id');
  const [loc] = await locationsById(transport, [Number(id)], lang);
  if (!loc) throw new HttpsError('not-found', 'Unknown place');
  const [pics, revs] = await Promise.all([
    terra<TerraPage<TerraPhoto>>(`/locations/${id}/photos`, { size: 5, locale: localesFor(lang) }).then((r) => r.body?.data ?? []),
    terra<TerraPage<TerraReview>>(`/locations/${id}/reviews`, { size: 5, language: TERRA_REVIEW_LANG[lang] }).then((r) => r.body?.data ?? []),
  ]);
  return {
    attraction: toAttraction(loc, pics, lang),
    reviews: revs.map((r) => toReview(r, lang)).filter((r) => r.url && (r.title || r.text)),
  };
});
