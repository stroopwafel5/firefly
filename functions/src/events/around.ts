import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { TICKETMASTER_KEY } from '../params';
import { HOUR, cached, fetchJson, isWarmup, requireAuth, requireNumber, secret } from '../util';
import { TmResponse, mapTicketmaster, ticketmasterUrl } from './ticketmasterMap';
import { EventJSON, SearchArgs, localizeEvent } from './types';

/**
 * "Take me anywhere": events within 1,500 km of a point on the traveller's dates, from
 * Ticketmaster's whole catalogue (its search takes a radius this wide; the regular event search
 * stops at 150 km). The app adds the weekly list, hand-checked events and admins' uploads it
 * already has, and counts them per town (src/planner/anywhere.ts). Cached 6 hours per area and dates.
 */
export const AROUND_KM = 1500;
const PAGES = 3;
const PAGE_SIZE = 200;

export const eventsAround = onCall({ secrets: [TICKETMASTER_KEY], timeoutSeconds: 60 }, async (req) => {
  if (isWarmup(req)) return { warm: true };
  requireAuth(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const lat = requireNumber(d.lat, 'lat', -90, 90);
  const lon = requireNumber(d.lon, 'lon', -180, 180);
  const lang = d.lang === 'he' || d.lang === 'ru' ? d.lang : 'en';
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof d.from !== 'string' || typeof d.to !== 'string' || !day.test(d.from) || !day.test(d.to) || d.to < d.from) {
    throw new HttpsError('invalid-argument', 'from/to must be YYYY-MM-DD');
  }
  const key = secret(TICKETMASTER_KEY);
  if (!key) return { events: [] as EventJSON[] };
  const a: SearchArgs = { lat, lon, placeName: '', country: '', radiusKm: AROUND_KM, from: d.from, to: d.to, lang };
  const { value } = await cached(
    `around:v1:${lat.toFixed(0)},${lon.toFixed(0)}:${d.from}:${d.to}`,
    6 * HOUR,
    async () => {
      const out: EventJSON[] = [];
      // Most relevant first, so the big festivals and shows across the area are in the first pages.
      for (let page = 0; page < PAGES; page++) {
        const j = await fetchJson<TmResponse>(ticketmasterUrl(a, key, PAGE_SIZE, { maxRadiusKm: AROUND_KM, page, sort: 'relevance,desc' })).catch((e) => {
          logger.warn('Ticketmaster (take me anywhere) failed', { page, error: (e as Error).message });
          return null;
        });
        if (!j) break;
        out.push(...mapTicketmaster(j, a));
        if ((j.page?.totalPages ?? 1) <= page + 1) break;
      }
      return out;
    },
    (v) => v.length > 0,
  );
  return { events: value.map((e) => localizeEvent(e, lang)) };
});
