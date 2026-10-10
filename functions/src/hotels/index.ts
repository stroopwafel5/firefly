import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { geocodeText, reverseName } from '../google';
import {
  AGODA_API_KEY,
  AGODA_ENDPOINT,
  AGODA_SITE_ID,
  BOOKING_AFFILIATE_ID,
  GOOGLE_SERVER_KEY,
  SERPAPI_KEY,
  TRIPADVISOR_KEY,
} from '../params';
import { serpAllowed, serpSpent } from '../serpBudget';
import { tripadvisorHotels } from '../tripadvisor';
import { DAY, Lang, cached, fetchJson, isLang, mapLimit, isWarmup, requireAuth, requireNumber, secret } from '../util';
import { AgodaResponse, agodaCityKey, agodaCityRequest, agodaHeaders, mapAgoda } from './agodaMap';
import { GhResponse, googleHotelsUrl, mapGoogleHotels } from './googleHotelsMap';
import { HotelOut, Stay } from './types';

/**
 * Hotels for one stay (consecutive nights in the same town), best source first:
 *  1. Agoda affiliate API — prices + Agoda booking links (once Agoda credentials are set and the
 *     town has an Agoda city id in Firestore agodaCities);
 *  2. Google Hotels via SerpApi — live prices across Agoda, Booking.com, Expedia and hotel sites
 *     (within the monthly SerpApi budget);
 *  3. TripAdvisor hotels — no prices; a pre-filled Booking.com search to book.
 * Every hotel also carries a Booking.com search link to compare. Cached for 1 day.
 */

const day = (v: unknown, name: string) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpsError('invalid-argument', `${name} must be YYYY-MM-DD`);
  return v;
};

async function agodaCityId(country: string, city: string): Promise<number | null> {
  if (!city) return null;
  const snap = await getFirestore().collection('agodaCities').doc(agodaCityKey(country, city)).get();
  const id = Number(snap.data()?.cityId);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function agodaHotels(cityId: number, stay: Stay, lang: Lang, city: string): Promise<HotelOut[]> {
  const res = await fetchJson<AgodaResponse>(AGODA_ENDPOINT.value(), {
    method: 'POST',
    headers: agodaHeaders(secret(AGODA_SITE_ID), secret(AGODA_API_KEY)),
    body: JSON.stringify(agodaCityRequest(cityId, stay, lang, { family: stay.kids > 0, maxResult: 10 })),
    timeoutMs: 20_000,
  });
  if (res.error) {
    logger.warn('Agoda error', res.error);
    return [];
  }
  // The Lite API may omit coordinates: place the first hotels by geocoding "name, city".
  const key = secret(GOOGLE_SERVER_KEY);
  const results = (res.results ?? []).slice(0, 10);
  const pos = new Map<number, { lat: number; lon: number }>();
  await mapLimit(
    results.filter((r) => typeof r.latitude !== 'number' && r.hotelId && r.hotelName).slice(0, 5),
    2,
    async (r) => {
      const g = await geocodeText(`${r.hotelName}, ${city}`, 'en', key).catch(() => null);
      if (g) pos.set(r.hotelId!, { lat: g.lat, lon: g.lon });
    },
  );
  return mapAgoda({ results }, stay, lang, city, (r) => pos.get(r.hotelId ?? -1) ?? null, BOOKING_AFFILIATE_ID.value());
}

async function googleHotels(city: string, country: string, stay: Stay, lang: Lang): Promise<HotelOut[]> {
  const url = googleHotelsUrl(city, stay, lang, secret(SERPAPI_KEY), { gl: country });
  const j = await fetchJson<GhResponse>(url, { timeoutMs: 30_000 });
  serpSpent(1);
  if (j.error) logger.warn('Google Hotels error', j.error);
  return mapGoogleHotels(j, stay, lang, city, BOOKING_AFFILIATE_ID.value());
}

export const hotelsNear = onCall(
  { secrets: [TRIPADVISOR_KEY, SERPAPI_KEY, GOOGLE_SERVER_KEY, AGODA_SITE_ID, AGODA_API_KEY], timeoutSeconds: 120 },
  async (req) => {
    if (isWarmup(req)) return { warm: true };
    requireAuth(req);
    const d = (req.data ?? {}) as Record<string, unknown>;
    const lat = requireNumber(d.lat, 'lat', -90, 90);
    const lon = requireNumber(d.lon, 'lon', -180, 180);
    const lang: Lang = isLang(d.lang) ? d.lang : 'en';
    const stay: Stay = {
      checkIn: day(d.checkIn, 'checkIn'),
      checkOut: day(d.checkOut, 'checkOut'),
      adults: Math.min(16, Math.max(1, Number(d.adults) || 2)),
      kids: Math.min(10, Math.max(0, Number(d.kids) || 0)),
    };
    if (stay.checkOut <= stay.checkIn) throw new HttpsError('invalid-argument', 'checkOut must be after checkIn');

    const cacheKey = `hotels:v2:${lat.toFixed(2)},${lon.toFixed(2)}:${stay.checkIn}:${stay.checkOut}:${stay.adults}:${stay.kids}:${lang}`;
    const { value, hit } = await cached(
      cacheKey,
      DAY,
      async () => {
        const place = await reverseName(lat, lon, 'en', secret(GOOGLE_SERVER_KEY)).catch(() => ({ name: '', country: '' }));
        const tried: string[] = [];
        if (secret(AGODA_SITE_ID) && secret(AGODA_API_KEY)) {
          const cityId = await agodaCityId(place.country, place.name);
          if (cityId) {
            tried.push('agoda');
            const items = await agodaHotels(cityId, stay, lang, place.name).catch((e) => {
              logger.warn('Agoda failed', e);
              return [];
            });
            if (items.length) return { items, source: 'agoda', tried };
          } else tried.push(`agoda:no-city-id-for-${agodaCityKey(place.country, place.name)}`);
        }
        if (secret(SERPAPI_KEY) && place.name) {
          if ((await serpAllowed('hotels', 1)) > 0) {
            tried.push('google-hotels');
            const items = await googleHotels(place.name, place.country, stay, lang).catch((e) => {
              logger.warn('Google Hotels failed', e);
              return [];
            });
            if (items.length) return { items, source: 'google-hotels', tried };
          } else tried.push('google-hotels:skipped-monthly-budget');
        }
        tried.push('tripadvisor');
        const items = secret(TRIPADVISOR_KEY) ? await tripadvisorHotels(lat, lon, lang, stay).catch(() => []) : [];
        return { items, source: 'tripadvisor', tried };
      },
      // Tripadvisor content may not be cached (Terra caching policy); the others are kept a day.
      (v) => v.items.length > 0 && v.source !== 'tripadvisor',
    );
    return { ...value, cached: hit };
  },
);
