import { createHash } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { geocodeText } from '../google';
import { ANTHROPIC_API_KEY, EVENTS_SCOUT, EVENTS_SCOUT_MAX, EVENTS_SCOUT_MODEL, GOOGLE_SERVER_KEY } from '../params';
import { haversineKm, secret } from '../util';
import { snapshotWindow } from './plan';
import { ScoutDeps, cellsAround, runScout } from './scoutCore';
import { EventJSON, SearchArgs, localizeEvent } from './types';
import { sameLinkKey } from './upload/parse';
import { claude, claudeRaw, fetchPage, wikiPhoto } from './upload/services';

export * from './scoutCore';

/**
 * Firebase side of the weekly event search (the search itself is in scoutCore.ts): the weekly
 * job, the admins' "run it now", and finding the kept events near a point for every event search.
 */

/** Scout events within the search's circle and dates, in the search's language. */
export async function scoutNear(a: SearchArgs): Promise<EventJSON[]> {
  const cells = cellsAround(a.lat, a.lon, a.radiusKm);
  const col = getFirestore().collection('scoutEvents');
  const out: EventJSON[] = [];
  for (let i = 0; i < cells.length; i += 30) {
    const snap = await col.where('cell', 'in', cells.slice(i, i + 30)).get();
    for (const d of snap.docs as Array<{ id: string; data(): unknown }>) {
      const e = { ...(d.data() as EventJSON), id: d.id };
      if (e.endDate < a.from || e.startDate > a.to) continue;
      if (haversineKm(a.lat, a.lon, e.location.locLat, e.location.locLon) > a.radiusKm) continue;
      out.push(localizeEvent(e, a.lang));
    }
  }
  return out;
}


const seenId = (url: string) => createHash('sha1').update(sameLinkKey(url)).digest('hex').slice(0, 24);

export async function scoutWeek(budgetMs: number, perRun: 'day' | 'week' = 'day') {
  const key = secret(ANTHROPIC_API_KEY);
  if (!key) return { skipped: 'ANTHROPIC_API_KEY is not set' };
  if (EVENTS_SCOUT.value() === 'off') return { skipped: 'EVENTS_SCOUT=off' };
  const db = getFirestore();
  const gkey = secret(GOOGLE_SERVER_KEY);
  const window = snapshotWindow();
  const today = new Date().toISOString().slice(0, 10);
  const model = EVENTS_SCOUT_MODEL.value() || 'claude-haiku-5-5';
  // Events that are over are removed (a few hundred at a time).
  const old = await db.collection('scoutEvents').where('endDate', '<', today).limit(400).get();
  if (!old.empty) {
    const batch = db.batch();
    for (const d of old.docs) batch.delete(d.ref);
    await batch.commit();
  }
  const deps: ScoutDeps = {
    ask: (body) => claudeRaw(key, body as unknown as Record<string, unknown>) as never,
    process: { fetchPage, ai: claude(key), geocode: async (q) => geocodeText(q, 'en', gkey), wikiPhoto, model, today },
    seen: async (url) => {
      const d = (await db.collection('scoutSeen').doc(seenId(url)).get()).data() as { until?: string } | undefined;
      return !!d?.until && d.until >= today;
    },
    remember: async (url, status, until) => {
      await db.collection('scoutSeen').doc(seenId(url)).set({ url, status, until, at: Date.now() });
    },
    save: async (e) => {
      await db.collection('scoutEvents').doc(e.id).set(JSON.parse(JSON.stringify(e)));
    },
    log: (m, extra) => logger.warn(m, extra),
  };
  // A seventh of the weekly limit each night, so the cost is spread out and the list fills daily.
  const weekly = Number(EVENTS_SCOUT_MAX.value()) || 250;
  const dayNumber = Math.floor(Date.now() / 86_400_000);
  const r = await runScout(deps, { from: window.from, to: window.to, today, model, maxPages: Math.ceil(weekly / (perRun === 'week' ? 1 : 7)), deadline: Date.now() + budgetMs, offset: dayNumber });
  logger.info('weekly event search', r);
  return r;
}

/** Every evening at 22:00 Israel time, a seventh of the week's searches (the list is rebuilt the next morning). */
export const eventScout = onSchedule(
  { schedule: 'every day 22:00', timeZone: 'Asia/Jerusalem', secrets: [ANTHROPIC_API_KEY, GOOGLE_SERVER_KEY], timeoutSeconds: 1800, memory: '1GiB' },
  async () => {
    await scoutWeek(27 * 60_000);
  },
);

/** Admins can run it on demand (the first time, or after changing the settings). */
export const scoutEventsNow = onCall({ secrets: [ANTHROPIC_API_KEY, GOOGLE_SERVER_KEY], timeoutSeconds: 3600, memory: '1GiB' }, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Admins only');
  // On demand (the first time): a whole week's searches at once.
  return scoutWeek(55 * 60_000, 'week');
});
