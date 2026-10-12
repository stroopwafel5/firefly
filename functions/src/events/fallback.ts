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
import { ISRAEL_CITIES, ISRAEL_TARGET, REGION_CITIES, REGION_TARGETS, Region, THEMED_SEARCHES, TM_WEAK_CITIES, ThemedSearch, WORLD_TARGET, nextTwoWeekends, planGoogleSearches, roundRobin, snapshotWindow } from './plan';

export { ISRAEL_TARGET, WORLD_TARGET, nextTwoWeekends, REGION_TARGETS };

/**
 * The weekly event list (the app keeps it for offline use and shows it as "this week's picks"):
 * about 950 verified, in-person events for the next four weeks — 50 in Israel, 500 in Europe,
 * 100 each in Japan, South-East Asia and Africa, and 100 elsewhere (REGION_TARGETS in plan.ts).
 * For every city: Ticketmaster (no per-search cost), the events found by the weekly web search
 * (scout.ts, run the evening before), admins' uploads, and Google's listings via SerpApi within its
 * budget (Israel first, then a weekly rotation of the cities Ticketmaster doesn't cover). Every
 * event passes the same checks as in the live search: in person, a mappable place, a link, a real
 * photo with its source. Written to Firestore (fallback/events + fallback/events-N).
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

export async function buildFallback(now = new Date(), opts: { google?: boolean } = {}) {
  const window = snapshotWindow(now);
  // SerpApi budget for this run (the free plan has 250 searches a month): Israel first, and
  // only on Mondays — the other days' rebuilds add the newly found events without Google.
  const googleDay = opts.google ?? now.getUTCDay() === 1;
  const allowed = googleDay ? await serpAllowed('fallback', ISRAEL_CITIES.length + THEMED_SEARCHES.length + TM_WEAK_CITIES.length) : 0;
  const plan = planGoogleSearches(allowed, now);
  serpSpent(plan.israel.length + plan.themed.length + plan.world.length);

  const perRegion = new Map<Region, EventJSON[][]>();
  perRegion.set('israel', await mapLimit(ISRAEL_CITIES, 4, (city) => cityEvents(city, window, plan.israel.includes(city) ? 'he' : null)));
  for (const region of ['europe', 'japan', 'seasia', 'africa', 'world'] as const) {
    perRegion.set(region, await mapLimit(REGION_CITIES[region], 4, (city) => cityEvents(city, window, plan.world.includes(city) ? 'en' : null)));
  }
  // The family / countryside searches join the round-robin as one more "city" each.
  const themed = await mapLimit(plan.themed, 2, (s) => themedEvents(s, window));
  plan.themed.forEach((s, i) => perRegion.get(s.region === 'israel' ? 'israel' : 'europe')!.push(themed[i]));

  const ids = new Set<string>();
  const counts: Partial<Record<Region, number>> = {};
  const events: EventJSON[] = [];
  for (const [region, perCity] of perRegion) {
    const picked = roundRobin(perCity, REGION_TARGETS[region], window.days).filter((e) => !ids.has(e.id));
    picked.forEach((e) => ids.add(e.id));
    counts[region] = picked.length;
    events.push(...picked);
  }
  const israel = counts.israel ?? 0;

  const db = getFirestore();
  const PART = 50; // keeps each document far below Firestore's 1 MiB limit
  const parts = Math.ceil(events.length / PART);
  const batch = db.batch();
  for (let i = 0; i < parts; i++) {
    batch.set(db.collection('fallback').doc(`events-${i}`), { events: events.slice(i * PART, (i + 1) * PART) });
  }
  // Parts left over from a bigger list are emptied (the app reads only `parts` of them).
  const meta = (await db.collection('fallback').doc('events').get()).data() as { parts?: number } | undefined;
  for (let i = parts; i < (meta?.parts ?? 0); i++) batch.delete(db.collection('fallback').doc(`events-${i}`));
  batch.set(db.collection('fallback').doc('events'), {
    parts,
    count: events.length,
    israel,
    world: events.length - israel,
    regions: counts,
    from: window.from,
    to: window.to,
    googleSearches: plan.israel.length + plan.themed.length + plan.world.length,
    googleCities: [...plan.israel, ...plan.themed.map((s) => s.id), ...plan.world],
    generatedAt: Date.now(),
  });
  await batch.commit();
  logger.info('weekly event list refreshed', { count: events.length, regions: counts, window: { from: window.from, to: window.to } });
  return { count: events.length, israel, regions: counts, from: window.from, to: window.to, googleSearches: plan.israel.length + plan.themed.length + plan.world.length };
}

/** Every morning at 04:00 Israel time (after the evening's web search, scout.ts); Google's listings on Mondays. */
export const refreshFallbackEvents = onSchedule(
  { schedule: 'every day 04:00', timeZone: 'Asia/Jerusalem', secrets: SEARCH_SECRETS, timeoutSeconds: 1800, memory: '1GiB' },
  async () => {
    await buildFallback();
  },
);

/** Admins can run it on demand (handy when testing — see HOW_TO_TEST.md). */
export const refreshFallbackNow = onCall({ secrets: SEARCH_SECRETS, timeoutSeconds: 1800, memory: '1GiB' }, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Admins only');
  return buildFallback(new Date(), { google: true });
});
