import { EUR_PER, EventJSON, EventType, SearchArgs, inferTypes } from './types';

/**
 * Ticketmaster Discovery API v2: request building and response mapping (pure, unit-tested;
 * also used by scripts/checkApis.ts). Strong coverage in North America, the UK and much of
 * Europe; very little in Israel (3 events around Tel Aviv in a month, tested 9 Oct 2026).
 *
 * Rejected on purpose (all seen in live results):
 *  - generic category artwork (images marked `fallback: true`), so a listing must have a real photo;
 *  - cancelled / postponed events;
 *  - attraction tickets that aren't events ("London Eye - Standard Experience",
 *    "Madame Tussauds London - Standard Entry"; sold on attractions.ticketmaster.*,
 *    marked "REDIRECT EVENT / DO NOT SELL");
 *  - add-on products sold next to a real event ("Jan Bendig | Fast Track",
 *    "HC Sparta Praha x HC Oceláři Třinec | BURGER JAKO PUK").
 */

export const TM_BASE = 'https://app.ticketmaster.com/discovery/v2/events.json';

export function ticketmasterUrl(a: SearchArgs, key: string, size = 100): string {
  const p = new URLSearchParams({
    apikey: key,
    latlong: `${a.lat},${a.lon}`,
    radius: String(Math.min(Math.round(a.radiusKm), 150)),
    unit: 'km',
    startDateTime: `${a.from}T00:00:00Z`,
    endDateTime: `${a.to}T23:59:59Z`,
    size: String(size),
    sort: 'date,asc',
    locale: '*',
  });
  if (a.query) p.set('keyword', a.query);
  return `${TM_BASE}?${p}`;
}

export interface TmImage {
  url: string;
  ratio?: string;
  width?: number;
  fallback?: boolean;
}
export interface TmEvent {
  id: string;
  name: string;
  url?: string;
  info?: string;
  pleaseNote?: string;
  images?: TmImage[];
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTBD?: boolean };
    end?: { localDate?: string; localTime?: string };
    status?: { code?: string };
  };
  classifications?: Array<{ segment?: { name?: string }; genre?: { name?: string }; family?: boolean }>;
  priceRanges?: Array<{ min?: number; currency?: string }>;
  _embedded?: {
    venues?: Array<{
      name?: string;
      address?: { line1?: string };
      city?: { name?: string };
      country?: { countryCode?: string };
      location?: { latitude?: string; longitude?: string };
    }>;
  };
}

export function bestImage(images: TmImage[] = []): TmImage | null {
  const real = images.filter((i) => !i.fallback && i.url);
  real.sort((a, b) => Number(b.ratio === '16_9') - Number(a.ratio === '16_9') || (b.width ?? 0) - (a.width ?? 0));
  return real[0] ?? null;
}

export function tmTypes(e: TmEvent): EventType[] {
  const c = e.classifications?.[0];
  const segment = c?.segment?.name ?? '';
  const out = new Set<EventType>();
  if (/arts|theatre/i.test(segment)) out.add('Theatre');
  if (/music|sports|miscellaneous/i.test(segment)) out.add('Festival');
  if (/family/i.test(segment) || c?.family) {
    out.add('Family');
    out.add('Kid Friendly');
  }
  inferTypes(`${e.name} ${c?.genre?.name ?? ''}`).forEach((t) => out.add(t));
  return [...out];
}

export interface TmResponse {
  _embedded?: { events?: TmEvent[] };
  page?: { totalElements?: number };
  fault?: { faultstring?: string };
}

const ADD_ON = /fast ?track|priority entry|vip (upgrade|package|parking)|parking|upgrade|add-?on|voucher|gift ?card|merch|burger|meal deal|hospitality package|lounge access/i;
const TICKET_PRODUCT = /\b(standard|general|basic|fast[- ]?track|priority|skip[- ]the[- ]line|combo)\s+(entry|admission|experience|ticket)s?\b|\bentry tickets?\b|\b(day|annual|season) pass\b/i;
const NOT_FOR_SALE_NOTE = /redirect event|do not sell/i;

/** True for things Ticketmaster sells that are not events (attraction entry, add-ons). */
export function isNotAnEvent(e: TmEvent): boolean {
  const host = (() => {
    try {
      return new URL(e.url ?? '').hostname;
    } catch {
      return '';
    }
  })();
  if (/^attractions\.ticketmaster\./.test(host)) return true;
  if (NOT_FOR_SALE_NOTE.test(`${e.info ?? ''} ${e.pleaseNote ?? ''}`)) return true;
  if (TICKET_PRODUCT.test(e.name)) return true;
  const parts = e.name.split(/\s+\|\s+/);
  return parts.length > 1 && ADD_ON.test(parts.slice(1).join(' '));
}

export function mapTicketmaster(j: TmResponse, a: SearchArgs): EventJSON[] {
  const out: EventJSON[] = [];
  for (const e of j._embedded?.events ?? []) {
    const status = e.dates?.status?.code;
    if (status === 'cancelled' || status === 'postponed' || isNotAnEvent(e)) continue;
    const venue = e._embedded?.venues?.[0];
    const lat = Number(venue?.location?.latitude);
    const lon = Number(venue?.location?.longitude);
    const img = bestImage(e.images);
    const start = e.dates?.start?.localDate;
    if (!venue || !Number.isFinite(lat) || !Number.isFinite(lon) || !img || !start || !e.url) continue;
    const pr = e.priceRanges?.[0];
    const rate = pr?.currency ? EUR_PER[pr.currency] : undefined;
    out.push({
      id: `tm-${e.id}`,
      name: e.name,
      description: (e.info ?? e.pleaseNote ?? `${e.classifications?.[0]?.genre?.name ?? ''} · ${venue.name ?? ''}`).slice(0, 600),
      startDate: start,
      endDate: e.dates?.end?.localDate ?? start,
      types: tmTypes(e),
      country: venue.country?.countryCode ?? a.country,
      price: pr?.min != null && rate ? Math.round(pr.min * rate) : null,
      priceText: pr?.min != null && pr.currency ? `from ${pr.min} ${pr.currency}` : undefined,
      currency: pr?.currency,
      link: e.url,
      bookingLink: e.url,
      photo_urls: [img.url],
      photoSources: [{ url: img.url, sourcePage: e.url, credit: 'Ticketmaster (event listing image)' }],
      location: { locLat: lat, locLon: lon },
      venue: venue.name ?? '',
      address: [venue.address?.line1, venue.city?.name].filter(Boolean).join(', '),
      startTime: e.dates?.start?.localTime?.slice(0, 5),
      endTime: e.dates?.end?.localTime?.slice(0, 5),
      datesConfirmed: !e.dates?.start?.dateTBD,
      origin: 'ticketmaster',
      sourceName: 'Ticketmaster',
    });
  }
  return out;
}
