import { bookingUrl } from './hotels/bookingCom';
import { kindFromText } from './attractions/kinds';
import { taPopularity } from './attractions/merge';
import type { HotelOut } from './hotels/types';

/**
 * Tripadvisor **Terra** API (https://docs.terra.tripadvisor.com) — request building and mapping
 * to Firefly's model JSON. Pure (no Firebase), unit-tested and used by scripts/checkApis.ts.
 *
 * Terra replaced the legacy Content API (api.content.tripadvisor.com), which was switched off
 * on 31 Aug 2026; Terra keys don't work there. What matters for Firefly:
 *  - base https://terra.tripadvisor.com/api, key in the `X-API-Key` header (no domain/IP locks);
 *  - Location endpoints (nearby, search, details, photos, reviews) only return places on the
 *    account's **allowlist**; the Catalog endpoints search everything with lighter data, and
 *    adding IDs to the allowlist is free and immediate (see tripadvisor.ts);
 *  - nearby search: radius ≤ 8 km, ≤ 20 per page, at most 60 results, sorted by rating;
 *  - billing is per place returned (Discover: first 1,000 free once, then from $0.015 each);
 *  - content may not be cached or stored, only Location IDs (Terra caching policy).
 */

export type Lang = 'en' | 'he' | 'ru';
export type TerraCategory = 'ATTRACTION' | 'RESTAURANT' | 'HOTEL';
export const TERRA_BASE = 'https://terra.tripadvisor.com/api';
/** Factual content locales (Hebrew is he-IL here)… */
export const TERRA_LOCALE: Record<Lang, string> = { en: 'en-US', he: 'he-IL', ru: 'ru-RU' };
/** …but review languages use the old code for Hebrew (iw). */
export const TERRA_REVIEW_LANG: Record<Lang, string> = { en: 'en', he: 'iw', ru: 'ru' };
export const TERRA_MAX_RADIUS_KM = 8;

type Param = string | number | boolean | string[] | undefined;

export function terraUrl(path: string, params: Record<string, Param> = {}): string {
  const p = new URLSearchParams({ version: '1' });
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else p.set(k, String(v));
  }
  return `${TERRA_BASE}${path}?${p}`;
}

export function terraHeaders(key: string): Record<string, string> {
  return { 'X-API-Key': key, accept: 'application/json' };
}

/** Locales to ask for: the user's language first, English as the fallback. */
export const localesFor = (lang: Lang): string[] => (lang === 'en' ? ['en-US'] : [TERRA_LOCALE[lang], 'en-US']);

/** Page size and count for `want` results (≤ 20 per page; nearby stops at offset 40, i.e. 3 pages). */
export function pagePlan(want: number, maxPages = 3): { size: number; pages: number } {
  const pages = Math.min(maxPages, Math.max(1, Math.ceil(want / 20)));
  return { size: Math.max(1, Math.min(20, Math.ceil(want / pages))), pages };
}

/* ---------------- Terra response types (only the fields Firefly reads) ---------------- */

export interface TerraText {
  language: string;
  value: string;
  primary?: boolean;
}
export interface TerraLocation {
  id: number;
  names?: TerraText[];
  descriptions?: TerraText[];
  geo?: string;
  coordinates?: { latitude: number; longitude: number };
  addresses?: Array<{ formatted?: string; street_address?: string; city?: string; country_code?: string; language?: string }>;
  categories?: Array<{ id: string; display_name?: string; hierarchy?: string; top_level_category?: string; parent_category?: { id?: string; display_name?: string } }>;
  traveler_ratings?: { overall?: { rating?: number; count?: number } };
  /** Catalog results carry the rating here instead. */
  overall_rating?: { rating?: number; count?: number };
  status?: { value?: 'OPEN' | 'CLOSED' | 'TEMPORARILY_CLOSED' };
  urls?: { official?: string; tripadvisor?: { main?: string; photos?: string; write_review?: string } };
  opening_hours?: { timezone?: string; periods?: Array<{ day_of_week: string; opens: string; closes: string }>; formatted?: string[] };
  price_level?: string;
  recommended_visit_length?: number;
  accommodation?: { star_rating?: number; prices?: Array<{ currency?: string; min_rate?: number; max_rate?: number }> };
}
export interface TerraPhoto {
  id: number;
  location_id?: number;
  caption?: string;
  source?: { name?: string };
  photo?: { original_size_url?: string; original_width?: number; original_height?: number };
  user?: { username?: string };
}
export interface TerraNearby {
  location: TerraLocation;
  distance_kilometers?: number;
  photo?: TerraPhoto;
}
export interface TerraReview {
  id: number;
  publish_ts?: string;
  rating?: number;
  title?: TerraText[];
  text?: TerraText[];
  trip_type?: string;
  url?: string;
  user?: { username?: string };
}
export interface TerraPage<T> {
  data?: T[];
  pagination?: { page?: number; size?: number; total_elements?: number; total_pages?: number };
}

/* ---------------- helpers ---------------- */

const LANG_CODES: Record<Lang, string[]> = { en: ['en'], he: ['he', 'iw'], ru: ['ru'] };
const langOf = (code: string) => code.toLowerCase().split(/[-_]/)[0];

/** The text in the user's language (primary first), else English, else anything. */
export function pickText(list: TerraText[] | undefined, lang: Lang): string {
  if (!list?.length) return '';
  const inLang = (codes: string[]) => list.filter((t) => codes.includes(langOf(t.language)));
  for (const codes of [LANG_CODES[lang], ['en']]) {
    const hits = inLang(codes);
    const hit = hits.find((t) => t.primary) ?? hits[0];
    if (hit) return hit.value;
  }
  return (list.find((t) => t.primary) ?? list[0]).value;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Terra opening periods → WeeklyHours (index 0 = Sunday). Closing at or before opening = after midnight. */
export function weeklyFromTerra(oh: TerraLocation['opening_hours']): Array<Array<{ open: number; close: number }>> | undefined {
  if (!oh?.periods?.length) return undefined;
  const week: Array<Array<{ open: number; close: number }>> = [[], [], [], [], [], [], []];
  for (const p of oh.periods) {
    const day = DAYS.findIndex((d) => d.toLowerCase() === String(p.day_of_week).toLowerCase());
    if (day < 0 || !p.opens || !p.closes) continue;
    const open = hm(p.opens);
    let close = hm(p.closes);
    if (close <= open) close += 1440;
    if (close - open >= 1439) close = open + 1440; // "00:00–23:59" = open all day
    week[day].push({ open, close });
  }
  return week.some((d) => d.length) ? week : undefined;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const typicalDay = (w?: Array<Array<{ open: number; close: number }>>) => (w ? w[3].flatMap((i) => [hhmm(i.open), hhmm(i.close)]) : []);

/** Category words used for typing (hierarchy and ids are language-neutral). */
/**
 * A hotel, B&B, guest house or rental by Tripadvisor's own categories (Terra sometimes answers
 * an attraction or restaurant search with "Hotel Wentzl"). False when the answer has no
 * categories (the catalog's lighter data): the name filters (attractions/kinds.ts) decide then.
 */
export function isLodging(l: TerraLocation): boolean {
  return (l.categories ?? []).some(
    (c) =>
      /hotel|accommodation|lodging|vacation rental/i.test(c.top_level_category ?? '') ||
      /^(hotels?|b\s?&\s?b|bed and breakfast|inns?|guest\s?houses?|hostels?|motels?|vacation rentals?|specialty lodging|apartments?)$/i.test(c.display_name ?? ''),
  );
}

/** Tripadvisor files the place only under eating and drinking (no attraction category). */
export function onlyFood(l: TerraLocation): boolean {
  const tops = (l.categories ?? []).map((c) => c.top_level_category ?? '').filter(Boolean);
  return tops.length > 0 && tops.every((t) => /restaurant|eat|drink|food/i.test(t));
}

/**
 * Tripadvisor itself calls this a restaurant: its page is a restaurant page ("Restaurant_Review",
 * not "Attraction_Review" — a "#3 of 250 things to do"), and its categories, when given, are under
 * eating and drinking with nothing under attractions, tours or hotels.
 */
export function isTaRestaurant(l: TerraLocation): boolean {
  const page = l.urls?.tripadvisor?.main ?? '';
  if (/Attraction_Review|AttractionProductReview|Hotel_Review|VacationRentalReview/i.test(page)) return false;
  if (page && !/Restaurant_Review/i.test(page)) return false;
  const cats = l.categories ?? [];
  if (!cats.length) return true;
  const text = (c: (typeof cats)[number]) => `${c.top_level_category ?? ''} ${c.display_name ?? ''} ${c.hierarchy ?? ''}`;
  if (cats.some((c) => /attraction|things to do|tours?\b|activit|hotel|accommodation|lodging/i.test(text(c)))) return false;
  return cats.some((c) => /restaurant|eat|drink|food|caf[eé]/i.test(text(c)));
}

/** Tripadvisor files the place under eating and drinking. */
export function servesFood(l: TerraLocation): boolean {
  return (l.categories ?? []).some((c) => /restaurant|eat|drink|food|caf[eé]|bar\b/i.test(`${c.top_level_category ?? ''} ${c.display_name ?? ''}`));
}

export function categoryText(l: TerraLocation): string {
  return (l.categories ?? [])
    .flatMap((c) => [c.id, c.hierarchy, c.display_name, c.parent_category?.display_name, c.parent_category?.id])
    .filter(Boolean)
    .join(', ')
    .replace(/_/g, ' ');
}

const TYPE_KEYWORDS: Record<string, RegExp> = {
  Nature: /nature|park|garden|beach|lake|mountain|hik|waterfall|forest|canyon|cave|scenic/i,
  History: /histor|castle|palace|fort|monument|ruin|museum|church|cathedral|monaster|memorial|ancient|archae|heritage|synagogue|temple/i,
  Theatre: /theat|theater|opera|concert|show|performance|cinema|ballet/i,
  Festival: /festival|event|market|fair/i,
  Food: /food|market|culinary|winer|tasting|cooking|cafe|bakery/i,
  Tour: /tour|walking|sightseeing|landmark|point of interest|bridge|square|neighbo|observation|viewpoint/i,
  Family: /zoo|aquarium|amusement|theme park|water park|playground|game|family|science|interactive/i,
  'Kid Friendly': /zoo|aquarium|amusement|theme park|water park|playground|children|kids|science|interactive|farm/i,
  Shopping: /shopping|\bshops?\b|mall|market|boutique|outlet|bazaar|souvenir|department store|flea/i,
  Beaches: /beach|\bbay\b|coast|seaside|shore|lagoon/i,
  'Extreme Sport': /zip ?-?line|bungee|sky ?div|paraglid|parasail|rafting|canyoning|\batv\b|quad|off-?road|4x4|jeep|climb|via ferrata|surf|kite|wakeboard|scuba|diving|kart|paintball|rope park|adventure|ski\b|snowboard|sandboard|jet ?ski|adrenaline|extreme/i,
  'Night Clubs': /night ?club|nightlife|\bclubs?\b|disco|dance club|\bbars?\b|lounge|cocktail/i,
};

export function typesFor(text: string): string[] {
  return Object.entries(TYPE_KEYWORDS)
    .filter(([, re]) => re.test(text))
    .map(([t]) => t);
}

/** Visit length: Tripadvisor's recommended length when given, otherwise by category. */
export function visitMinutes(categories: string, recommended?: number): number {
  const byLength: Record<number, number> = { 1: 45, 2: 90, 3: 150, 4: 240 };
  if (recommended && byLength[recommended]) return byLength[recommended];
  const s = categories.toLowerCase();
  if (/theme park|amusement|water park/.test(s)) return 240;
  if (/zoo|aquarium|safari/.test(s)) return 180;
  if (/museum|gallery|exhibition/.test(s)) return 120;
  if (/castle|palace|fortress|archaeolog|ruins/.test(s)) return 120;
  if (/hik|trail|national park|canyon|cave/.test(s)) return 150;
  if (/park|garden|beach|lake/.test(s)) return 75;
  if (/church|cathedral|synagogue|temple|mosque|chapel|monaster/.test(s)) return 45;
  if (/bridge|square|viewpoint|monument|landmark|observation|statue|fountain|street|neighbo/.test(s)) return 40;
  if (/market/.test(s)) return 60;
  return 90;
}

const pageOf = (l: TerraLocation) => l.urls?.tripadvisor?.main ?? 'https://www.tripadvisor.com';
const ratingOf = (l: TerraLocation) => l.traveler_ratings?.overall ?? l.overall_rating;
export const isOpenBusiness = (l: TerraLocation) => !l.status?.value || l.status.value === 'OPEN';

/** Photos with their source: every photo links to the place's Tripadvisor photo page (linking policy). */
export function photoList(l: TerraLocation, photos: TerraPhoto[]) {
  const urls: string[] = [];
  const sources: Array<{ url: string; sourcePage: string; credit: string }> = [];
  for (const p of photos) {
    const url = p.photo?.original_size_url;
    if (!url) continue;
    urls.push(url);
    sources.push({
      url,
      sourcePage: l.urls?.tripadvisor?.photos ?? pageOf(l),
      credit: `Tripadvisor — ${p.user?.username ?? (p.source?.name === 'Management' ? 'management photo' : 'traveller photo')}`,
    });
  }
  return { urls, sources };
}

/* ---------------- mapping to Firefly's model JSON ---------------- */

export function toAttraction(l: TerraLocation, photos: TerraPhoto[], lang: Lang = 'en') {
  const cats = categoryText(l);
  const text = cats || `${pickText(l.names, 'en')} ${pickText(l.descriptions, 'en')}`; // catalog results have no categories
  const w = weeklyFromTerra(l.opening_hours);
  const { urls, sources } = photoList(l, photos);
  const r = ratingOf(l);
  return {
    id: String(l.id),
    name: pickText(l.names, lang),
    description: pickText(l.descriptions, lang),
    types: typesFor(text),
    country: l.addresses?.[0]?.country_code ?? '',
    price: null,
    link: pageOf(l),
    photo_urls: urls,
    photoSources: sources,
    location: { locLat: l.coordinates?.latitude ?? 0, locLon: l.coordinates?.longitude ?? 0 },
    openingHours: typicalDay(w),
    weeklyHours: w,
    /** Where the hours were checked (the merge prefers Google's when it has them). */
    hoursSource: w ? ('tripadvisor' as const) : undefined,
    rating: r?.rating,
    numReviews: r?.count,
    provider: 'tripadvisor' as const,
    category: cats,
    kind: kindFromText(`${cats} ${pickText(l.names, 'en')}`),
    /** 0–10: rating × 2, pulled towards 7 when there are few reviews (attractions/merge.ts). */
    popularity: taPopularity(r?.rating, r?.count),
    suggestedMinutes: visitMinutes(text, l.recommended_visit_length),
    address: l.addresses?.[0]?.formatted ?? '',
    /** The venue's own website: where its accessibility information is looked up. */
    website: l.urls?.official ?? '',
  };
}

export function toRestaurant(l: TerraLocation, photos: TerraPhoto[], lang: Lang = 'en') {
  const w = weeklyFromTerra(l.opening_hours);
  const { urls, sources } = photoList(l, photos);
  const generic = /^(restaurants?|eat & drink|eat and drink)$/i;
  return {
    id: String(l.id),
    name: pickText(l.names, lang),
    description: pickText(l.descriptions, lang),
    photos: urls,
    photoSources: sources,
    linkToPage: pageOf(l),
    location: { locLat: l.coordinates?.latitude ?? 0, locLon: l.coordinates?.longitude ?? 0 },
    openingHours: typicalDay(w),
    weeklyHours: w,
    cuisine: [...new Set((l.categories ?? []).map((c) => c.display_name ?? '').filter((n) => n && !generic.test(n)))].slice(0, 3),
    priceLevel: l.price_level ?? '',
    rating: ratingOf(l)?.rating,
  };
}

export function toHotel(
  l: TerraLocation,
  photos: TerraPhoto[],
  stay: { checkIn: string; checkOut: string; adults: number; kids: number },
  lang: Lang,
  aid = '',
): HotelOut {
  const { urls, sources } = photoList(l, photos);
  const name = pickText(l.names, lang);
  const bookingCom = bookingUrl(pickText(l.names, 'en') || name, l.addresses?.[0]?.city ?? l.geo ?? '', stay.checkIn, stay.checkOut, stay.adults, stay.kids, lang, aid);
  return {
    id: String(l.id),
    name,
    description: [l.accommodation?.star_rating ? `${l.accommodation.star_rating}★` : '', pickText(l.descriptions, lang)].filter(Boolean).join(' · '),
    photos: urls,
    photoSources: sources,
    price: null, // Tripadvisor gives a general price range, not a price for these dates
    linkToBooking: bookingCom,
    bookingVia: 'booking.com',
    linkToBookingCom: bookingCom,
    linkToListing: pageOf(l),
    locLat: l.coordinates?.latitude ?? 0,
    locLon: l.coordinates?.longitude ?? 0,
    rating: ratingOf(l)?.rating,
    source: 'tripadvisor',
  };
}

export function toReview(r: TerraReview, lang: Lang) {
  return {
    id: String(r.id),
    title: pickText(r.title, lang),
    text: pickText(r.text, lang),
    rating: r.rating ?? 0,
    publishedDate: (r.publish_ts ?? '').slice(0, 10),
    url: r.url ?? '',
    user: r.user?.username ?? '',
    tripType: r.trip_type,
  };
}

/** Multi-get answers come back either as a list or wrapped in `data`. */
export const asList = <T>(j: T[] | TerraPage<T> | null | undefined): T[] => (Array.isArray(j) ? j : j?.data ?? []);
