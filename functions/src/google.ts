import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GOOGLE_SERVER_KEY } from './params';
import { NOMINATIM_UA, NominatimPlace, nominatimReverseUrl, nominatimSearchUrl, parseNominatimReverse, parseNominatimSearch } from './geo/nominatim';
import { DAY, Lang, cached, fetchJson, isLang, mapLimit, isWarmup, requireAuth, requireNumber, requireString, secret } from './util';

/**
 * Google Maps Platform (server key, never shipped in the app):
 *  - Geocoding API: city names ↔ coordinates
 *  - Routes API: the road line between two cities, and travel-time matrices for each day
 */

const GOOGLE_LANG: Record<Lang, string> = { en: 'en', he: 'iw', ru: 'ru' };

interface GeocodeResponse {
  status: string;
  results: Array<{
    formatted_address: string;
    geometry: { location: { lat: number; lng: number } };
    address_components: Array<{ long_name: string; short_name: string; types: string[] }>;
  }>;
}

/* ---- Free fallback: OpenStreetMap Nominatim, 1 request per second per server instance ---- */
let nominatimQueue: Promise<unknown> = Promise.resolve();
function nominatim<T>(url: string): Promise<T | null> {
  const run = nominatimQueue.then(async () => {
    const res = await fetchJson<T>(url, { headers: { 'User-Agent': NOMINATIM_UA, Referer: 'https://www.differentroute.net/' } }).catch(() => null);
    await new Promise((r) => setTimeout(r, 1100));
    return res;
  });
  nominatimQueue = run.catch(() => undefined);
  return run;
}

/** Google when a server key is configured and answers; otherwise OpenStreetMap. */
export async function geocodeText(query: string, lang: Lang, key: string) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&language=${GOOGLE_LANG[lang]}&key=${key}`;
  const { value } = await cached(`geocode:${lang}:${query.toLowerCase()}`, 30 * DAY, async () => {
    const j = key ? await fetchJson<GeocodeResponse>(url).catch(() => null) : null;
    if (!j || (j.status !== 'OK' && j.status !== 'ZERO_RESULTS')) {
      return parseNominatimSearch(await nominatim<NominatimPlace[]>(nominatimSearchUrl(query, lang)));
    }
    const r = j.results[0];
    if (!r) return null;
    const comp = (type: string) => r.address_components.find((c) => c.types.includes(type));
    return {
      lat: r.geometry.location.lat,
      lon: r.geometry.location.lng,
      name: comp('locality')?.long_name ?? comp('administrative_area_level_1')?.long_name ?? r.formatted_address.split(',')[0],
      country: comp('country')?.short_name ?? '',
      formatted: r.formatted_address,
    };
  });
  return value;
}

export async function reverseName(lat: number, lon: number, lang: Lang, key: string): Promise<{ name: string; country: string }> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&result_type=locality|administrative_area_level_2|administrative_area_level_1&language=${GOOGLE_LANG[lang]}&key=${key}`;
  const { value } = await cached(`rev:${lang}:${lat.toFixed(2)}:${lon.toFixed(2)}`, 30 * DAY, async () => {
    const j = key ? await fetchJson<GeocodeResponse>(url).catch(() => null) : null;
    if (!j || j.status !== 'OK') return parseNominatimReverse(await nominatim<NominatimPlace>(nominatimReverseUrl(lat, lon, lang)));
    const r = j.results[0];
    const comp = (type: string) => r?.address_components.find((c) => c.types.includes(type));
    return {
      name: comp('locality')?.long_name ?? comp('administrative_area_level_2')?.long_name ?? comp('administrative_area_level_1')?.long_name ?? '',
      country: comp('country')?.short_name ?? '',
    };
  });
  return value;
}

export const geocode = onCall({ secrets: [GOOGLE_SERVER_KEY] }, async (req) => {
  if (isWarmup(req)) return { warm: true };
  requireAuth(req);
  const d = (req.data ?? {}) as { query?: string; lang?: string };
  const lang = isLang(d.lang) ? d.lang : 'en';
  return geocodeText(requireString(d.query, 'query', 200), lang, secret(GOOGLE_SERVER_KEY));
});

export const reverseGeocode = onCall({ secrets: [GOOGLE_SERVER_KEY] }, async (req) => {
  if (isWarmup(req)) return { warm: true };
  requireAuth(req);
  const d = (req.data ?? {}) as { lat?: number; lon?: number; lang?: string };
  const lang = isLang(d.lang) ? d.lang : 'en';
  const r = await reverseName(requireNumber(d.lat, 'lat', -90, 90), requireNumber(d.lon, 'lon', -180, 180), lang, secret(GOOGLE_SERVER_KEY));
  return { name: r.name };
});

/* ---------------- Routes API ---------------- */

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const MATRIX_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';

const waypoint = (lat: number, lon: number) => ({ waypoint: { location: { latLng: { latitude: lat, longitude: lon } } } });

/** Road route between two cities, as [lat, lon] points (used to place day bases on one-way trips). */
export const routeLine = onCall({ secrets: [GOOGLE_SERVER_KEY] }, async (req) => {
  if (isWarmup(req)) return { warm: true };
  requireAuth(req);
  const d = (req.data ?? {}) as { from?: { lat: number; lon: number }; to?: { lat: number; lon: number } };
  if (!d.from || !d.to) throw new HttpsError('invalid-argument', 'from and to are required');
  if (!secret(GOOGLE_SERVER_KEY)) return null; // no key: the planner spreads days along a straight line
  const key = `route:${d.from.lat.toFixed(3)},${d.from.lon.toFixed(3)}>${d.to.lat.toFixed(3)},${d.to.lon.toFixed(3)}`;
  const { value } = await cached(key, 7 * DAY, async () => {
    const j = await fetchJson<{ routes?: Array<{ polyline?: { encodedPolyline?: string } }> }>(ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_SERVER_KEY.value(),
        'X-Goog-FieldMask': 'routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: d.from!.lat, longitude: d.from!.lon } } },
        destination: { location: { latLng: { latitude: d.to!.lat, longitude: d.to!.lon } } },
        travelMode: 'DRIVE',
      }),
    });
    const enc = j.routes?.[0]?.polyline?.encodedPolyline;
    return enc ? { points: decodePolyline(enc) } : null;
  });
  return value;
});

export function decodePolyline(encoded: string): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < encoded.length) {
    for (const which of [0, 1]) {
      let result = 0;
      let shift = 0;
      let b: number;
      do {
        b = encoded.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    pts.push([lat / 1e5, lng / 1e5]);
  }
  // Thin the line: the planner only needs ~200 points.
  const step = Math.max(1, Math.floor(pts.length / 200));
  return pts.filter((_, k) => k % step === 0 || k === pts.length - 1);
}

interface MatrixElement {
  originIndex: number;
  destinationIndex: number;
  duration?: string;
  distanceMeters?: number;
  condition?: string;
}

/**
 * Travel time between every pair of a day's points.
 * Limits (Routes API): 625 elements per request for driving, 100 for transit — the points are
 * split into origin chunks so each request stays under the limit. Transit uses the trip's
 * departure time when given (timetables differ by day).
 */
export const travelMatrix = onCall({ secrets: [GOOGLE_SERVER_KEY], timeoutSeconds: 120 }, async (req) => {
  if (isWarmup(req)) return { warm: true };
  requireAuth(req);
  const d = (req.data ?? {}) as { points?: Array<{ id: string; lat: number; lon: number }>; mode?: 0 | 1; departure?: string };
  const points = (d.points ?? []).slice(0, 25);
  // No key: the app falls back to its conservative estimates (shown as "(estimate)").
  if (points.length < 2 || !secret(GOOGLE_SERVER_KEY)) return { entries: [] };
  const transit = d.mode === 1;
  const limit = transit ? 100 : 625;
  const rowsPerChunk = Math.max(1, Math.floor(limit / points.length));
  const chunks: Array<typeof points> = [];
  for (let i = 0; i < points.length; i += rowsPerChunk) chunks.push(points.slice(i, i + rowsPerChunk));

  const entries: Array<{ from: string; to: string; minutes: number; meters: number }> = [];
  await mapLimit(chunks, 3, async (origins) => {
    const when = transit && d.departure ? `@${d.departure.slice(0, 13)}` : '';
    const cacheKey = `matrix:${transit ? 'T' : 'D'}${when}:${origins.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join('|')}>${points
      .map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`)
      .join('|')}`;
    const { value } = await cached(cacheKey, 7 * DAY, async () =>
      fetchJson<MatrixElement[]>(MATRIX_URL, {
        method: 'POST',
        timeoutMs: 30_000,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_SERVER_KEY.value(),
          'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,condition',
        },
        body: JSON.stringify({
          origins: origins.map((p) => waypoint(p.lat, p.lon)),
          destinations: points.map((p) => waypoint(p.lat, p.lon)),
          travelMode: transit ? 'TRANSIT' : 'DRIVE',
          ...(transit && d.departure ? { departureTime: d.departure } : {}),
        }),
      }),
    ).catch(() => ({ value: [] as MatrixElement[] })); // failures are not cached
    for (const el of value) {
      if (el.condition !== 'ROUTE_EXISTS' || !el.duration) continue;
      entries.push({
        from: origins[el.originIndex].id,
        to: points[el.destinationIndex].id,
        minutes: Math.round(parseFloat(el.duration) / 60),
        meters: el.distanceMeters ?? 0,
      });
    }
  });
  return { entries };
});
