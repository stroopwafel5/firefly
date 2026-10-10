import { sha1 } from '../hash';
import { hostname, parseTimes, resolveDay } from './parse';
import { EventJSON, SearchArgs, inferTypes } from './types';

/**
 * Google's event listings via SerpApi (engine=google, `events_results`): request building and
 * mapping (pure, unit-tested, also used by scripts/checkApis.ts). This is the worldwide source:
 * it covers Israel, Ghana, Nicaragua or Indonesia, where ticketing APIs have little.
 * Docs: https://serpapi.com/events-results
 */

export interface SerpEvent {
  title?: string;
  date?: { start_date?: string; when?: string } | string;
  address?: string[];
  link?: string;
  description?: string;
  venue?: { name?: string } | string;
  thumbnail?: string;
  image?: string;
  ticket_info?: Array<{ source?: string; link?: string; link_type?: string }>;
}

export interface SerpEventsResponse {
  events_results?: SerpEvent[];
  error?: string;
  search_metadata?: { status?: string };
}

export const SERP_HL: Record<SearchArgs['lang'], string> = { en: 'en', he: 'iw', ru: 'ru' };

export function serpEventsUrl(a: SearchArgs, q: string, key: string): string {
  const p = new URLSearchParams({ engine: 'google', q, hl: SERP_HL[a.lang], api_key: key });
  if (a.country) p.set('gl', a.country.toLowerCase());
  return `https://serpapi.com/search.json?${p}`;
}

export type RawGoogleEvent = Omit<EventJSON, 'location'> & { _address: string };

/** Raw Google events (not yet geocoded / photo-checked; see enrich.ts). */
export function mapSerpEvents(j: SerpEventsResponse, a: SearchArgs, q: string, today = new Date()): RawGoogleEvent[] {
  const out: RawGoogleEvent[] = [];
  for (const e of j.events_results ?? []) {
    if (!e.title || !e.link) continue;
    const dateText = typeof e.date === 'string' ? e.date : e.date?.start_date ?? '';
    const when = typeof e.date === 'string' ? e.date : e.date?.when ?? '';
    const start = resolveDay(dateText || when, today);
    if (!start) continue;
    const rangeEnd = /[–-]\s*([A-Za-z]{3}\s+\d{1,2})/.exec(when)?.[1];
    const end = rangeEnd ? resolveDay(rangeEnd, today) ?? start : start;
    const venue = typeof e.venue === 'string' ? e.venue : e.venue?.name ?? e.address?.[0] ?? '';
    const address = (e.address ?? []).join(', ');
    const tickets = e.ticket_info?.find((t) => t.link_type === 'tickets' && t.link)?.link ?? e.ticket_info?.[0]?.link;
    const times = parseTimes(when);
    const thumb = e.image ?? e.thumbnail;
    out.push({
      id: `ge-${sha1(`${e.title}|${start}|${address}`).slice(0, 16)}`,
      name: e.title,
      description: (e.description ?? '').slice(0, 600),
      startDate: start,
      endDate: end < start ? start : end,
      types: inferTypes(`${e.title} ${e.description ?? ''} ${q}`),
      country: a.country,
      price: null,
      link: e.link,
      bookingLink: tickets,
      photo_urls: thumb ? [thumb] : [],
      photoSources: thumb ? [{ url: thumb, sourcePage: e.link, credit: `Listing image via Google (${hostname(e.link)})` }] : [],
      venue,
      address,
      startTime: times.start,
      endTime: times.end,
      datesConfirmed: true,
      origin: 'google-events',
      sourceName: hostname(e.link),
      _address: address || `${venue}, ${a.placeName}`,
    });
  }
  return out;
}
