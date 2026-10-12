import { createHash } from 'node:crypto';
import { EUR_PER, EventJSON, inferTypes, validateEvent } from '../types';
import { AiEvent, Tri, eventRequest, readAiEvent } from './ai';
import { PageInfo, readPage, siteOf } from './page';
import { ListLang, ListedEvent, sameLinkKey } from './parse';

/**
 * One listed event → a published Firefly event (or a clear reason why it was held back):
 * read the page, ask Claude for the record, find the place on the map, pick a real photo,
 * check it with the same rules as every other event. Dependencies are passed in, so the whole
 * flow is unit-tested without the network.
 */

export interface UploadedEvent extends EventJSON {
  i18n: { name: Tri; description: Tri; priceText: Tri };
  uploadId: string;
  uploadedBy: string;
  uploadedAt: number;
  listTitle: string;
}

export interface ItemResult {
  index: number;
  title: string;
  url: string;
  status: 'published' | 'held' | 'failed';
  eventId?: string;
  name?: Tri;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  venue?: string;
  photo?: string;
  /** Why it was held back or failed (plain English for the admin). */
  reasons: string[];
  warnings: string[];
}

export interface ProcessDeps {
  fetchPage(url: string): Promise<{ html: string; finalUrl: string; status: number; contentType: string }>;
  /** Anthropic Messages API: request body in, JSON answer out (throws on HTTP errors). */
  ai(body: ReturnType<typeof eventRequest>): Promise<{ content?: Array<{ type: string; name?: string; input?: unknown }> }>;
  geocode(query: string): Promise<{ lat: number; lon: number; country: string; formatted?: string } | null>;
  wikiPhoto(title: string): Promise<{ url: string; page: string; title: string } | null>;
  model: string;
  today: string;
}

export interface UploadContext {
  uploadId: string;
  admin: string;
  listLang: ListLang;
  weekStart: string;
}

/** No AI-made pictures (same rule as the app's photos). */
export const AI_IMAGE = /ai[-_ ]?generated|midjourney|dall[-·_ ]?e|stable[-_ ]?diffusion|generative[-_ ]?ai|\bai[-_ ]art\b/i;

/** Same link + same first day → same document, so uploading a list again updates instead of duplicating. */
export function uploadedEventId(url: string, firstDay: string): string {
  return `up-${createHash('sha1').update(`${sameLinkKey(url)}|${firstDay}`).digest('hex').slice(0, 20)}`;
}

const REASON: Record<string, string> = {
  missingName: 'No name',
  missingSourceLink: 'No link to the event page',
  missingVenue: 'No venue or address',
  missingMapPin: 'Could not find the place on the map — add the place under the link in the list (e.g. "Sacher Park, Jerusalem")',
  onlineEvent: 'Online event (Firefly lists in-person events only)',
  missingPhoto: 'No usable photo on the page',
  missingPhotoSource: 'Photo without a source',
  missingType: 'No event type',
  badDates: 'No date — add the day heading above it in the list',
};

const overlaps = (aFrom: string, aTo: string, days: string[]) => days.some((d) => aFrom <= d && d <= aTo);

export async function processListedEvent(listed: ListedEvent, index: number, ctx: UploadContext, deps: ProcessDeps): Promise<{ result: ItemResult; event?: UploadedEvent }> {
  const base: ItemResult = { index, title: listed.title, url: listed.url, status: 'held', reasons: [], warnings: [] };
  if (!listed.url) return { result: { ...base, reasons: ['No link — put the event page link on the line under the title'] } };

  // 1. The page (a failure is not fatal: Instagram and some sites refuse; the notes may be enough).
  let page: (PageInfo & { finalUrl: string; status: number }) | null = null;
  let fetchError: string | undefined;
  try {
    const r = await deps.fetchPage(listed.url);
    if (r.status >= 400) fetchError = `HTTP ${r.status}`;
    else if (!/html|xml/i.test(r.contentType)) fetchError = `not a web page (${r.contentType || 'unknown type'})`;
    else page = { ...readPage(r.html, r.finalUrl), finalUrl: r.finalUrl, status: r.status };
  } catch (e) {
    fetchError = (e as Error).message;
  }

  // 2. Claude reads it.
  let ai: AiEvent | null;
  try {
    const answer = await deps.ai(eventRequest({ listed, listLang: ctx.listLang, weekStart: ctx.weekStart, today: deps.today, page, fetchError }, deps.model));
    ai = readAiEvent(answer, page?.images.map((i) => i.url) ?? []);
  } catch (e) {
    return { result: { ...base, status: 'failed', reasons: [(e as Error).message] } };
  }
  if (!ai) return { result: { ...base, status: 'failed', reasons: ['The AI did not return an event record'] } };
  const warnings = [...ai.warnings];
  if (fetchError) warnings.unshift(`The page could not be read (${fetchError}); details come from the list only`);

  // 3. Dates: the page's, unless they miss the listed days — the list decides the weekend.
  let { startDate, endDate } = ai;
  const listed1 = listed.days[0];
  const listedN = listed.days[listed.days.length - 1];
  if (listed1 && (!startDate || !overlaps(startDate, endDate, listed.days))) {
    if (startDate) warnings.push(`The page says ${startDate}${endDate !== startDate ? `–${endDate}` : ''}; listed for ${listed.days.join(', ')} — the listed days were used`);
    startDate = listed1;
    endDate = listedN;
  }
  const reasons: string[] = [];
  if (endDate && endDate < deps.today) reasons.push(`Already over (${endDate})`);
  if (ai.online) reasons.push(REASON.onlineEvent);

  // 4. The place on the map.
  const country = ai.countryCode;
  const queries = [ai.geocodeQuery, [ai.venue, ai.city, country].filter(Boolean).join(', '), ai.address, [ai.city, country].filter(Boolean).join(', ')]
    .map((q) => q.trim())
    .filter((q, i, all) => q.length > 2 && all.indexOf(q) === i);
  let place: Awaited<ReturnType<ProcessDeps['geocode']>> = null;
  for (const q of queries) {
    const g = await deps.geocode(q).catch(() => null);
    if (g && (!country || !g.country || g.country === country)) {
      place = g;
      break;
    }
  }

  // 5. A photo: the page's own (a real photo, or the event's artwork), else Wikipedia's photo of the venue or town.
  let photo: { url: string; sourcePage: string; credit: string } | null = null;
  const site = page?.siteName || siteOf(page?.finalUrl ?? listed.url);
  if (ai.imageUrl && (ai.imageKind === 'photo' || ai.imageKind === 'poster') && !AI_IMAGE.test(ai.imageUrl)) {
    const who = ai.imageCredit || site;
    photo = { url: ai.imageUrl, sourcePage: page?.finalUrl ?? listed.url, credit: ai.imageKind === 'poster' ? `Event artwork — ${who}` : who };
  }
  if (!photo) {
    for (const t of [ai.wikipediaTitle, ai.city].filter(Boolean)) {
      const w = await deps.wikiPhoto(t).catch(() => null);
      if (w && !AI_IMAGE.test(w.url)) {
        photo = { url: w.url, sourcePage: w.page, credit: `Wikimedia Commons, via Wikipedia: ${w.title}` };
        warnings.push(`No photo on the event page — used Wikipedia's photo of ${w.title}`);
        break;
      }
    }
  }

  // 6. The record.
  const name: Tri = { ...ai.name, [ctx.listLang]: ai.name[ctx.listLang] || listed.title } as Tri;
  for (const l of ['en', 'he', 'ru'] as const) if (!name[l]) name[l] = listed.title;
  const rate = ai.currency ? EUR_PER[ai.currency] : undefined;
  const price = ai.free ? 0 : ai.priceMin != null && rate ? Math.round(ai.priceMin * rate) : null;
  const id = uploadedEventId(listed.url, listed1 ?? startDate);
  const event: UploadedEvent = {
    id,
    name: name.en,
    description: ai.description.en,
    startDate,
    endDate,
    types: ai.types.length ? ai.types : inferTypes(`${name.en} ${listed.title}`),
    country: country || place?.country || '',
    price,
    link: listed.url,
    photo_urls: photo ? [photo.url] : [],
    photoSources: photo ? [photo] : [],
    location: place ? { locLat: place.lat, locLon: place.lon } : { locLat: 0, locLon: 0 },
    venue: ai.venue || ai.city,
    address: ai.address || place?.formatted || ai.city,
    priceText: ai.priceText.en || undefined,
    currency: ai.currency || undefined,
    startTime: ai.startTime || undefined,
    endTime: ai.endTime || undefined,
    datesConfirmed: true,
    origin: 'admin',
    sourceName: site || 'event page',
    i18n: { name, description: ai.description, priceText: ai.priceText },
    uploadId: ctx.uploadId,
    uploadedBy: ctx.admin,
    uploadedAt: Date.now(),
    listTitle: listed.title,
  };
  reasons.push(...validateEvent(event).map((p) => REASON[p] ?? p));

  const result: ItemResult = {
    ...base,
    status: reasons.length ? 'held' : 'published',
    eventId: id,
    name,
    startDate,
    endDate,
    startTime: event.startTime,
    venue: event.venue,
    photo: photo?.url,
    reasons: [...new Set(reasons)],
    warnings,
  };
  return reasons.length ? { result } : { result, event };
}
