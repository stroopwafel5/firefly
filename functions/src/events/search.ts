import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GOOGLE_SERVER_KEY, SERPAPI_KEY, TICKETMASTER_KEY } from '../params';
import { geocodeText, reverseName } from '../google';
import { HOUR, cached, haversineKm, isLang, isWarmup, requireAuth, secret } from '../util';
import { dropHiddenPhotos, finishGoogleEvents } from './enrich';
import { googleEventsRaw, googleQueries } from './googleEvents';
import { ticketmasterEvents } from './ticketmaster';
import { EVENT_TYPES, EventJSON, EventType, SearchArgs, validateEvent } from './types';

export const SEARCH_SECRETS = [GOOGLE_SERVER_KEY, SERPAPI_KEY, TICKETMASTER_KEY];
const MAX_RADIUS_KM = 150;
const MAX_WINDOW_DAYS = 62;

/** Admin-added events from Firestore that overlap the window and lie within the radius. */
async function adminEvents(a: SearchArgs): Promise<EventJSON[]> {
  const snap = await getFirestore().collection('events').where('endDate', '>=', a.from).limit(500).get();
  return snap.docs
    .map((d: { id: string; data(): unknown }) => ({ ...(d.data() as EventJSON), id: d.id }))
    .filter((e: EventJSON) => e.startDate <= a.to && haversineKm(a.lat, a.lon, e.location.locLat, e.location.locLon) <= a.radiusKm);
}

function dedupe(list: EventJSON[]): EventJSON[] {
  const seen = new Map<string, EventJSON>();
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 40);
  // Prefer curated/admin > ticketmaster > google (more complete records first).
  const rank = { curated: 0, admin: 0, ticketmaster: 1, 'google-events': 2 } as const;
  for (const e of [...list].sort((x, y) => rank[x.origin] - rank[y.origin])) {
    const k = `${norm(e.name)}|${e.startDate}|${e.location.locLat.toFixed(2)},${e.location.locLon.toFixed(2)}`;
    if (!seen.has(k)) seen.set(k, e);
  }
  return [...seen.values()];
}

/**
 * Polls every source for one area + window, then keeps only events that are
 * physical (mappable address, not online), sourced (link) and illustrated by a real photo
 * with a source page. Used by the `searchEvents` callable and the weekly fallback job.
 */
export interface RunOptions {
  /** Google queries to run (default: the two standard ones in the user's language). */
  googleQueries?: string[];
  /** The weekly job has already budgeted its SerpApi searches. */
  serpPreApproved?: boolean;
}

export async function runSearch(a: SearchArgs, opts: RunOptions = {}): Promise<{ events: EventJSON[]; sources: string[] }> {
  const notes: string[] = [];
  const google = async (): Promise<EventJSON[]> => {
    if (!secret(SERPAPI_KEY)) return [];
    const r = await googleEventsRaw(a, opts.googleQueries ?? googleQueries(a.placeName, a.lang, a.query), opts.serpPreApproved);
    if (r.skippedForBudget) notes.push('google-events:skipped-monthly-budget');
    if (!r.searches) return [];
    return finishGoogleEvents(
      r.raw.filter((x) => x.endDate >= a.from && x.startDate <= a.to),
      a.lang,
    );
  };
  const jobs: Array<[string, Promise<EventJSON[]>]> = [
    ['firestore', adminEvents(a)],
    ['ticketmaster', secret(TICKETMASTER_KEY) ? ticketmasterEvents(a) : Promise.resolve([])],
    ['google-events', google()],
  ];
  const settled = await Promise.allSettled(jobs.map(([, p]) => p));
  const sources: string[] = [];
  const all: EventJSON[] = [];
  settled.forEach((r, i) => {
    const configured = i === 0 || (i === 1 ? !!secret(TICKETMASTER_KEY) : !!secret(SERPAPI_KEY));
    if (r.status === 'rejected') {
      logger.warn(`event source ${jobs[i][0]} failed`, r.reason);
      return;
    }
    if (configured) sources.push(jobs[i][0]);
    all.push(...r.value);
  });
  const inArea = all.filter(
    (e) =>
      e.endDate >= a.from &&
      e.startDate <= a.to &&
      haversineKm(a.lat, a.lon, e.location.locLat, e.location.locLon) <= a.radiusKm * 1.1,
  );
  const visible = (await dropHiddenPhotos(dedupe(inArea))).filter((e) => validateEvent(e).length === 0);
  visible.sort(
    (x, y) =>
      x.startDate.localeCompare(y.startDate) ||
      haversineKm(a.lat, a.lon, x.location.locLat, x.location.locLon) - haversineKm(a.lat, a.lon, y.location.locLat, y.location.locLon),
  );
  return { events: visible.slice(0, 150), sources: [...sources, ...notes].filter((x) => !(x === 'google-events' && notes.length)) };
}

const dayOk = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const searchEvents = onCall({ secrets: SEARCH_SECRETS, timeoutSeconds: 120, memory: '512MiB' }, async (req) => {
  if (isWarmup(req)) return { warm: true };
  requireAuth(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const lang = isLang(d.lang) ? d.lang : 'en';
  if (!dayOk(d.from) || !dayOk(d.to) || d.to < d.from) throw new HttpsError('invalid-argument', 'from/to must be YYYY-MM-DD');
  if ((Date.parse(d.to) - Date.parse(d.from)) / 86_400_000 > MAX_WINDOW_DAYS) {
    throw new HttpsError('invalid-argument', `window is limited to ${MAX_WINDOW_DAYS} days`);
  }
  const radiusKm = Math.min(MAX_RADIUS_KM, Math.max(1, Number(d.radiusKm) || 100));
  const key = secret(GOOGLE_SERVER_KEY);

  let lat = typeof d.lat === 'number' ? d.lat : NaN;
  let lon = typeof d.lon === 'number' ? d.lon : NaN;
  let placeName = '';
  let country = '';
  if (typeof d.place === 'string' && d.place.trim()) {
    const g = await geocodeText(d.place.trim().slice(0, 120), lang, key);
    if (!g) throw new HttpsError('not-found', 'place not found');
    ({ lat, lon } = g);
    placeName = g.name;
    country = g.country;
  } else if (Number.isFinite(lat) && Number.isFinite(lon)) {
    const r = await reverseName(lat, lon, lang, key).catch(() => ({ name: '', country: '' }));
    placeName = r.name;
    country = r.country;
  } else {
    throw new HttpsError('invalid-argument', 'Give a place or lat/lon (the app sends the current location by default).');
  }

  const query = typeof d.query === 'string' ? d.query.trim().slice(0, 80) : '';
  const args: SearchArgs = { lat, lon, placeName, country, radiusKm, from: d.from, to: d.to, query: query || undefined, lang };
  const cacheKey = `events:v1:${lat.toFixed(1)},${lon.toFixed(1)}:${radiusKm}:${d.from}:${d.to}:${lang}:${query.toLowerCase()}`;
  const { value, hit } = await cached(cacheKey, 6 * HOUR, () => runSearch(args));

  const types = Array.isArray(d.types) ? (d.types.filter((t) => (EVENT_TYPES as readonly string[]).includes(t as string)) as EventType[]) : [];
  // Re-check reported photos on every call, so a report takes effect even on cached results.
  const visible = hit ? (await dropHiddenPhotos(value.events)).filter((e) => validateEvent(e).length === 0) : value.events;
  const events = types.length ? visible.filter((e) => e.types.some((t) => types.includes(t))) : visible;
  return { events, sources: value.sources, center: { lat, lon, name: placeName }, cached: hit };
});
