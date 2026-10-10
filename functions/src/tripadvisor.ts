import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { HotelOut, Stay } from './hotels/types';
import { BOOKING_AFFILIATE_ID, TRIPADVISOR_KEY, TRIPADVISOR_QPS } from './params';
import { RateGate } from './rateGate';
import { freeAttractionsNear, osmRestaurantsNear } from './attractions';
import { AttractionOut, isLandmark, mergeAttractions } from './attractions/merge';
import { NOT_A_SIGHT } from './attractions/kinds';
import { parseNeeds, withAccessibility } from './accessibility';
import { AreaStore, NearbyQuery, TerraTransport, areaKey, locationsById, nearbyPlaces } from './terraFlow';
import {
  TERRA_MAX_RADIUS_KM,
  TERRA_REVIEW_LANG,
  TerraLocation,
  TerraPage,
  TerraPhoto,
  TerraReview,
  localesFor,
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

/** One gate per server: Tripadvisor's queries-per-second limit, and a pause after a 429. */
let gate: RateGate | null = null;
const tripadvisorGate = () => (gate ??= new RateGate(Number(TRIPADVISOR_QPS.value()) || 3));

async function call<T>(path: string, params: Record<string, string | number | boolean | string[] | undefined>, init: RequestInit = {}) {
  // Over the limit: answer "busy" at once, so the caller uses the free backup sources.
  if (!(await tripadvisorGate().wait())) return { status: 429, body: null as T | null };
  const res = await fetch(terraUrl(path, params), {
    ...init,
    headers: { ...terraHeaders(secret(TRIPADVISOR_KEY)), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let body: T | null = null;
  try {
    body = JSON.parse(text) as T;
  } catch {
    /* not JSON */
  }
  if (res.status === 429) {
    tripadvisorGate().coolDown();
    logger.warn('Tripadvisor rate limit reached: pausing Tripadvisor for 90 s and using the free sources', { path });
  } else if (!res.ok && res.status !== 404) logger.warn('Tripadvisor error', { path, status: res.status, body: text.slice(0, 300) });
  return { status: res.status, body };
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

/** Tripadvisor attractions, or [] with the reason (never throws). */
async function tripadvisorAttractions(lat: number, lon: number, radiusKm: number, lang: Lang, want: number): Promise<{ items: AttractionOut[]; state: TripadvisorState }> {
  if (!secret(TRIPADVISOR_KEY)) return { items: [], state: 'off' };
  if (tripadvisorGate().cooling) return { items: [], state: 'busy' };
  try {
    const list = await places({ lat, lon, radiusKm: Math.min(TERRA_MAX_RADIUS_KM, radiusKm), category: 'ATTRACTION', lang, want });
    const items = list.map((n) => toAttraction(n.location, n.photo ? [n.photo] : [], lang)) as unknown as AttractionOut[];
    return { items, state: tripadvisorGate().cooling && !items.length ? 'busy' : 'ok' };
  } catch (e) {
    logger.warn('Tripadvisor attractions failed', e);
    return { items: [], state: tripadvisorGate().cooling ? 'busy' : 'error' };
  }
}

/**
 * Attractions near a point: Tripadvisor (main source) merged with Wikidata (free backup: live
 * around the point + the Europe-wide list), duplicates removed, all with a 0–10 popularity.
 * Bike rentals, bars, shops and spas are never returned. `landmarks: true` asks only for
 * world-class nature and heritage sites (used to find stops like Plitvice between two cities).
 */
export const attractionsNear = onCall({ secrets: [TRIPADVISOR_KEY], timeoutSeconds: 180 }, async (req) => {
  if (isWarmup(req)) return { warm: true };
  requireAuth(req);
  const { lat, lon, lang, d } = args(req.data);
  const want = Math.min(80, Math.max(1, Math.round(Number(d.want) || 10)));
  const radiusKm = Math.max(1, Math.min(60, Number(d.radiusKm) || TERRA_MAX_RADIUS_KM));
  if (d.landmarks === true) {
    const free = await freeAttractionsNear(lat, lon, radiusKm, lang, 25);
    return { items: free.filter((a) => isLandmark(a)).slice(0, want), tripadvisor: 'off' as TripadvisorState };
  }
  // Wikidata looks a little wider than Tripadvisor's 8 km, for the lakes and castles just out of town.
  const [ta, free] = await Promise.all([
    tripadvisorAttractions(lat, lon, radiusKm, lang, Math.min(60, want)),
    freeAttractionsNear(lat, lon, Math.max(radiusKm, 12), lang),
  ]);
  const items = mergeAttractions(ta.items, free)
    .filter((a) => !a.kind || !NOT_A_SIGHT.has(a.kind))
    .slice(0, want);
  // Only when the traveller chose accessibility needs: check each place for exactly those needs.
  const needs = parseNeeds(d.needs);
  const checked = needs.length ? await withAccessibility(items as Array<AttractionOut & { website?: string }>, needs) : items;
  return { items: checked, tripadvisor: ta.state };
});

/** Restaurants: Tripadvisor; when it is busy or finds too few, OpenStreetMap (free) fills in. */
export const restaurantsNear = onCall({ secrets: [TRIPADVISOR_KEY], timeoutSeconds: 120 }, async (req) => {
  if (isWarmup(req)) return { warm: true };
  requireAuth(req);
  const { lat, lon, lang, d } = args(req.data);
  const want = Math.min(40, Math.max(1, Math.round(Number(d.want) || 10)));
  let items: unknown[] = [];
  let state: TripadvisorState = secret(TRIPADVISOR_KEY) ? 'ok' : 'off';
  if (state === 'ok' && !tripadvisorGate().cooling) {
    try {
      const list = await places({ lat, lon, radiusKm: 5, category: 'RESTAURANT', lang, want, catalogFallback: false });
      items = list.slice(0, want).map((n) => toRestaurant(n.location, n.photo ? [n.photo] : [], lang));
    } catch (e) {
      logger.warn('Tripadvisor restaurants failed', e);
      state = 'error';
    }
  }
  if (tripadvisorGate().cooling) state = 'busy';
  if (items.length < Math.min(want, 4)) {
    const osm = await osmRestaurantsNear(lat, lon, 3, lang, want - items.length);
    items = [...items, ...osm];
  }
  return { items, tripadvisor: state };
});

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
