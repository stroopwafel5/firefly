import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { GOOGLE_SERVER_KEY } from '../params';
import { geocodeText } from '../google';
import { mapLimit, secret } from '../util';
import { SEARCH_SECRETS, runSearch } from './search';
import { EventJSON } from './types';
import { serpAllowed, serpSpent } from '../serpBudget';
import { googleQueries } from './parse';
import { ISRAEL_CITIES, ISRAEL_TARGET, THEMED_SEARCHES, TM_WEAK_CITIES, ThemedSearch, WORLD_CITIES, WORLD_TARGET, nextTwoWeekends, planGoogleSearches, roundRobin } from './plan';

export { ISRAEL_TARGET, WORLD_TARGET, nextTwoWeekends };

/**
 * Weekly offline fallback: up to 150 verified, in-person events for the next two weekends —
 * 50 in Israel (where most of Firefly's travellers live) and 100 around the world.
 * Ticketmaster (no per-search cost) is asked for every city; Google listings via SerpApi go to
 * Israel first and then to a weekly rotation of cities Ticketmaster doesn't cover, within
 * the SerpApi budget (SERPAPI_FALLBACK_MAX searches per run, default 30).
 * Written to Firestore (fallback/events + fallback/events-N); the app downloads it whenever
 * it is online and keeps it for offline use.
 */

type Window = ReturnType<typeof nextTwoWeekends>;

/** One city: Ticketmaster always; a single Google search in `googleLang` if this city got one. */
async function cityEvents(city: string, window: Window, googleLang: 'he' | 'en' | null): Promise<EventJSON[]> {
  const key = secret(GOOGLE_SERVER_KEY);
  const g = await geocodeText(city, 'en', key).catch(() => null);
  if (!g) return [];
  // Google is searched in that language with the city's name in that language (e.g. "אירועים בחיפה").
  const local = googleLang && googleLang !== 'en' ? ((await geocodeText(city, googleLang, key).catch(() => null)) ?? g) : g;
  const lang = googleLang ?? 'en';
  const r = await runSearch(
    { lat: g.lat, lon: g.lon, placeName: local.name || g.name, country: g.country, radiusKm: 25, from: window.from, to: window.to, lang },
    { googleQueries: googleLang ? [googleQueries(local.name || g.name, lang)[0]] : [], serpPreApproved: true },
  ).catch((e) => {
    logger.warn(`fallback search failed for ${city}`, e);
    return { events: [] as EventJSON[] };
  });
  return r.events;
}

/** One nationwide family / countryside search (Parks Authority, National Trust…). */
async function themedEvents(s: ThemedSearch, window: Window): Promise<EventJSON[]> {
  const r = await runSearch(
    { lat: s.lat, lon: s.lon, placeName: s.placeName, country: s.country, radiusKm: s.radiusKm, from: window.from, to: window.to, lang: s.lang },
    { googleQueries: [s.query], serpPreApproved: true },
  ).catch((e) => {
    logger.warn(`themed search ${s.id} failed`, e);
    return { events: [] as EventJSON[] };
  });
  return r.events;
}

export async function buildFallback(now = new Date()) {
  const window = nextTwoWeekends(now);
  // SerpApi budget for this run (the free plan has 250 searches a month): Israel first.
  const allowed = await serpAllowed('fallback', ISRAEL_CITIES.length + THEMED_SEARCHES.length + TM_WEAK_CITIES.length);
  const plan = planGoogleSearches(allowed, now);
  serpSpent(plan.israel.length + plan.themed.length + plan.world.length);

  const israelPerCity = await mapLimit(ISRAEL_CITIES, 4, (city) => cityEvents(city, window, plan.israel.includes(city) ? 'he' : null));
  const worldPerCity = await mapLimit(WORLD_CITIES, 4, (city) => cityEvents(city, window, plan.world.includes(city) ? 'en' : null));
  // The family / countryside searches join the round-robin as one more "city" each.
  const themed = await mapLimit(plan.themed, 2, (s) => themedEvents(s, window));
  plan.themed.forEach((s, i) => (s.region === 'israel' ? israelPerCity : worldPerCity).push(themed[i]));
  const israel = roundRobin(israelPerCity, ISRAEL_TARGET, window.days);
  const world = roundRobin(worldPerCity, WORLD_TARGET, window.days);
  const ids = new Set(israel.map((e) => e.id));
  const events = [...israel, ...world.filter((e) => !ids.has(e.id))];

  const db = getFirestore();
  const batch = db.batch();
  const PART = 50; // keeps each document far below Firestore's 1 MiB limit
  const parts = Math.ceil(events.length / PART);
  for (let i = 0; i < parts; i++) {
    batch.set(db.collection('fallback').doc(`events-${i}`), { events: events.slice(i * PART, (i + 1) * PART) });
  }
  batch.set(db.collection('fallback').doc('events'), {
    parts,
    count: events.length,
    israel: israel.length,
    world: events.length - israel.length,
    from: window.from,
    to: window.to,
    googleSearches: plan.israel.length + plan.themed.length + plan.world.length,
    googleCities: [...plan.israel, ...plan.themed.map((s) => s.id), ...plan.world],
    generatedAt: Date.now(),
  });
  await batch.commit();
  logger.info('fallback events refreshed', { count: events.length, israel: israel.length, window, googleSearches: allowed });
  return { count: events.length, israel: israel.length, from: window.from, to: window.to, googleSearches: plan.israel.length + plan.themed.length + plan.world.length };
}

/** Every Monday 04:00 Israel time. */
export const refreshFallbackEvents = onSchedule(
  { schedule: 'every monday 04:00', timeZone: 'Asia/Jerusalem', secrets: SEARCH_SECRETS, timeoutSeconds: 540, memory: '1GiB' },
  async () => {
    await buildFallback();
  },
);

/** Admins can run it on demand (handy when testing — see HOW_TO_TEST.md). */
export const refreshFallbackNow = onCall({ secrets: SEARCH_SECRETS, timeoutSeconds: 540, memory: '1GiB' }, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Admins only');
  return buildFallback();
});
