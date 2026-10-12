import { EVENT_TYPES, EventType } from '../types';
import type { ListLang, ListedEvent } from './parse';
import { describeDays } from './parse';
import type { PageInfo } from './page';

/**
 * One Claude request per listed event: it reads the event page and returns the record Firefly
 * needs — the date and time of the occurrence the admin listed, venue, prices, event types,
 * the best real photo among the page's own images, and the name, description and price line
 * in English, Hebrew and Russian. Facts may only come from the page or the admin's line.
 * Pure (request building and answer checking); the call itself is in process.ts.
 */

export type Tri = { en: string; he: string; ru: string };

export interface AiEvent {
  readable: boolean;
  online: boolean;
  name: Tri;
  description: Tri;
  priceText: Tri;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  venue: string;
  address: string;
  city: string;
  countryCode: string;
  geocodeQuery: string;
  wikipediaTitle: string;
  free: boolean;
  priceMin: number | null;
  currency: string;
  types: EventType[];
  imageUrl: string;
  imageKind: 'photo' | 'poster' | 'logo' | 'none';
  imageCredit: string;
  warnings: string[];
}

const LANG_NAME: Record<ListLang, string> = { ru: 'Russian', he: 'Hebrew', en: 'English' };

const tri = (what: string) => ({
  type: 'object',
  description: what,
  properties: { en: { type: 'string' }, he: { type: 'string' }, ru: { type: 'string' } },
  required: ['en', 'he', 'ru'],
});

export const SAVE_EVENT_TOOL = {
  name: 'save_event',
  description: 'Save the event record for the Firefly app.',
  input_schema: {
    type: 'object',
    properties: {
      readable: { type: 'boolean', description: 'true if PAGE describes this event (false: login wall, error page, unrelated page, or no page).' },
      online: { type: 'boolean', description: 'true only if the event is online/virtual (not in person).' },
      name: tri('Event name in each language.'),
      description: tri('2–3 sentences per language: what it is, what visitors do, length, ages. Facts from PAGE / ADMIN NOTES only.'),
      priceText: tri('Short price line per language, e.g. "145 ₪ · 10% off for students". "" if unknown.'),
      startDate: { type: 'string', description: 'YYYY-MM-DD of the listed occurrence.' },
      endDate: { type: 'string', description: 'YYYY-MM-DD (same as startDate for one day).' },
      startTime: { type: 'string', description: 'HH:MM 24h, or "" if not stated.' },
      endTime: { type: 'string', description: 'HH:MM 24h: stated, or start + stated duration; "" otherwise.' },
      venue: { type: 'string', description: 'Venue / meeting point, in English letters (transliterate Hebrew/Russian names).' },
      address: { type: 'string', description: 'Street address in English if stated, else town and country.' },
      city: { type: 'string', description: 'Town or city in English.' },
      countryCode: { type: 'string', description: 'ISO 3166-1 alpha-2, e.g. IL.' },
      geocodeQuery: { type: 'string', description: 'Best search string to find the venue on a map, in English, ending with the country.' },
      wikipediaTitle: { type: 'string', description: 'Title of the English Wikipedia article about the venue (or else the town), for a fallback photo. "" if none.' },
      free: { type: 'boolean', description: 'true only if entry is stated to be free.' },
      priceMin: { type: ['number', 'null'], description: 'Lowest regular adult price as a number, null if unknown.' },
      currency: { type: 'string', description: 'ISO currency of priceMin, e.g. ILS.' },
      types: { type: 'array', items: { type: 'string', enum: [...EVENT_TYPES] }, description: '1–4 types. Concerts and shows → Theatre.' },
      imageUrl: { type: 'string', description: 'One URL copied exactly from CANDIDATE IMAGES, or "".' },
      imageKind: { type: 'string', enum: ['photo', 'poster', 'logo', 'none'], description: 'What imageUrl most likely is, judged from its URL, alt text and the page.' },
      imageCredit: { type: 'string', description: 'Photographer / source for imageUrl as stated on the page (e.g. "Photo: Chen Rosen"), else the site name.' },
      warnings: { type: 'array', items: { type: 'string' }, description: 'Short English notes for the admin about anything uncertain or missing.' },
    },
    required: [
      'readable', 'online', 'name', 'description', 'priceText', 'startDate', 'endDate', 'startTime', 'endTime', 'venue', 'address',
      'city', 'countryCode', 'geocodeQuery', 'wikipediaTitle', 'free', 'priceMin', 'currency', 'types', 'imageUrl', 'imageKind',
      'imageCredit', 'warnings',
    ],
  },
} as const;

export function systemPrompt(listLang: ListLang): string {
  const own = LANG_NAME[listLang];
  return [
    'You prepare event listings for Firefly, a travel app for families from Israel (English, Hebrew and Russian).',
    'An admin wrote a weekly list of events: a title (in ' + own + '), the day it is listed for, and a link. You get the linked page.',
    'Rules:',
    '- Use ONLY facts stated on the PAGE or in the admin\'s line and notes. Never guess times, prices, addresses, ages or performers. Leave unknown fields empty.',
    '- If the page lists several dates or cities, take the occurrence that matches the listed day and the place in the admin\'s title. If the event runs over several days around the listed days, give the whole span.',
    '- If the page cannot be read (login wall, error, unrelated), set readable=false, take the date from the listed day, the place from the title or notes, and say in the description that details are on the organiser\'s page. Do not invent anything else.',
    `- Names: the ${own} name is the admin's title with only obvious typos fixed. The other languages: the official name from the page in that language if there is one, else a natural translation (not a transliteration of ${own}).`,
    '- Descriptions: 2–3 short sentences per language, warm and plain, for parents planning a weekend. No marketing superlatives that are not on the page.',
    '- Hebrew must be natural Israeli Hebrew; Russian natural Russian. Keep prices with ₪ as on the page.',
    '- imageUrl must be copied exactly from CANDIDATE IMAGES. Prefer a real photograph of the event, performers or venue; a poster or event artwork only if there is no photo; never a logo. "" if none fits.',
    '- Answer only by calling save_event.',
  ].join('\n');
}

export interface PromptInput {
  listed: ListedEvent;
  listLang: ListLang;
  weekStart: string;
  today: string;
  page: (PageInfo & { finalUrl: string; status: number }) | null;
  fetchError?: string;
}

export function userPrompt(p: PromptInput): string {
  const days = p.listed.days.length ? describeDays(p.listed.days) : 'not given (use the page)';
  const parts = [
    'ADMIN LINE',
    `Title (${LANG_NAME[p.listLang]}): ${p.listed.title || '(none)'}`,
    `Listed for: ${days}`,
    `Admin notes: ${p.listed.notes || '(none)'}`,
    `Link: ${p.listed.url}`,
    '',
    `TODAY: ${p.today}. THE LIST IS FOR THE WEEKEND STARTING THURSDAY ${p.weekStart}.`,
    '',
  ];
  if (!p.page) {
    parts.push(`PAGE: could not be fetched (${p.fetchError ?? 'unknown error'}).`);
    return parts.join('\n');
  }
  parts.push(
    `PAGE (${p.page.finalUrl}, HTTP ${p.page.status})`,
    `Title: ${p.page.title}`,
    `Site: ${p.page.siteName}`,
    `Meta description: ${p.page.description}`,
  );
  if (p.page.events.length) parts.push('Structured event data (schema.org):', ...p.page.events);
  parts.push('CANDIDATE IMAGES:');
  if (p.page.images.length) p.page.images.forEach((im, i) => parts.push(`${i + 1}. ${im.url}${im.alt ? ` — alt: "${im.alt}"` : ''} (${im.from})`));
  else parts.push('(none)');
  parts.push('TEXT:', p.page.text || '(empty)');
  return parts.join('\n');
}

export function eventRequest(p: PromptInput, model: string) {
  return {
    model,
    max_tokens: 3000,
    system: systemPrompt(p.listLang),
    tools: [SAVE_EVENT_TOOL],
    tool_choice: { type: 'tool', name: SAVE_EVENT_TOOL.name },
    messages: [{ role: 'user', content: userPrompt(p) }],
  };
}

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : '');
const clock = (v: unknown) => {
  const m = typeof v === 'string' ? v.trim().match(/^(\d{1,2}):(\d{2})$/) : null;
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
};
const triOf = (v: unknown): Tri => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { en: str(o.en, 1500), he: str(o.he, 1500), ru: str(o.ru, 1500) };
};

/** The tool call from a Messages API answer, checked field by field (anything odd becomes empty). */
export function readAiEvent(j: { content?: Array<{ type: string; name?: string; input?: unknown }> }, candidates: string[]): AiEvent | null {
  const call = j.content?.find((c) => c.type === 'tool_use' && c.name === SAVE_EVENT_TOOL.name);
  if (!call || !call.input || typeof call.input !== 'object') return null;
  const o = call.input as Record<string, unknown>;
  const types = (Array.isArray(o.types) ? o.types : []).filter((t): t is EventType => (EVENT_TYPES as readonly string[]).includes(t as string));
  const imageUrl = str(o.imageUrl);
  const kinds = ['photo', 'poster', 'logo', 'none'] as const;
  const price = typeof o.priceMin === 'number' && Number.isFinite(o.priceMin) && o.priceMin >= 0 ? o.priceMin : null;
  const startDate = day(o.startDate);
  const endDate = day(o.endDate) || startDate;
  return {
    readable: o.readable === true,
    online: o.online === true,
    name: triOf(o.name),
    description: triOf(o.description),
    priceText: triOf(o.priceText),
    startDate,
    endDate: endDate < startDate ? startDate : endDate,
    startTime: clock(o.startTime),
    endTime: clock(o.endTime),
    venue: str(o.venue, 200),
    address: str(o.address, 300),
    city: str(o.city, 100),
    countryCode: /^[A-Z]{2}$/.test(str(o.countryCode).toUpperCase()) ? str(o.countryCode).toUpperCase() : '',
    geocodeQuery: str(o.geocodeQuery, 300),
    wikipediaTitle: str(o.wikipediaTitle, 200),
    free: o.free === true,
    priceMin: price,
    currency: /^[A-Z]{3}$/.test(str(o.currency).toUpperCase()) ? str(o.currency).toUpperCase() : '',
    types: [...new Set(types)].slice(0, 4),
    // Only an image that really is on the page (never a made-up URL).
    imageUrl: candidates.includes(imageUrl) ? imageUrl : '',
    imageKind: kinds.includes(o.imageKind as (typeof kinds)[number]) ? (o.imageKind as AiEvent['imageKind']) : 'none',
    imageCredit: str(o.imageCredit, 200),
    warnings: (Array.isArray(o.warnings) ? o.warnings : []).map((w) => str(w, 300)).filter(Boolean).slice(0, 8),
  };
}
