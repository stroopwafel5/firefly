import { KIND_TYPES, Kind, LANDMARK_KINDS } from './kinds';
import type { WdPlace } from './wikidata';

/**
 * Combining Tripadvisor, Google Places, Wikidata and OpenStreetMap into one list of attractions,
 * all treated the same way.
 * Pure (no Firebase), unit-tested.
 */

export type Provider = 'tripadvisor' | 'google' | 'wikidata' | 'openstreetmap';
/** Where a place's opening hours were checked (best first). */
export type HoursSource = 'google' | 'tripadvisor' | 'openstreetmap';
export type WeeklyHours = Array<Array<{ open: number; close: number }>>;

/** The attraction JSON fields the merge reads or sets (the rest passes through untouched). */
export interface AttractionOut {
  id: string;
  name: string;
  types: string[];
  location: { locLat: number; locLon: number };
  photo_urls: string[];
  photoSources: Array<{ url: string; sourcePage: string; credit: string }>;
  rating?: number;
  numReviews?: number;
  /** Whose rating `rating` is, when it isn't the provider's own (a Wikidata place rated on Google). */
  ratingSource?: 'tripadvisor' | 'google';
  provider: Provider;
  kind?: Kind;
  popularity?: number;
  wikidataId?: string;
  description?: string;
  /** Who wrote `description` (defaults to the provider). */
  descriptionSource?: Provider | 'wikipedia';
  openingHours?: string[];
  weeklyHours?: WeeklyHours;
  hoursSource?: HoursSource;
  website?: string;
  address?: string;
  [extra: string]: unknown;
}

/**
 * Popularity (0–10) of a Tripadvisor place: its rating doubled, pulled towards 7.0 when it has
 * few reviews (a Bayesian average with a weight of 50 reviews). The Colosseum (4.7★, 400k
 * reviews) → 9.4; a 5.0★ café with 10 reviews → 7.5, so a handful of glowing reviews can't beat
 * a landmark millions have visited.
 */
export function taPopularity(rating?: number, reviews?: number): number | undefined {
  if (rating == null || !Number.isFinite(rating)) return undefined;
  const v = Math.max(0, reviews ?? 0);
  const m = 50;
  const p = (v / (v + m)) * rating * 2 + (m / (v + m)) * 7;
  return Math.round(Math.min(10, p) * 10) / 10;
}

const hhmm = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** A typical weekday's hours (Wednesday) as ["09:00", "17:00", …], the short form shown on cards. */
export const typicalHours = (week: WeeklyHours | undefined): string[] => (week?.[3] ?? []).flatMap((i) => [hhmm(i.open), hhmm(i.close)]);

const R = 6371;
export function km(a: { locLat: number; locLon: number }, b: { locLat: number; locLon: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const s = Math.sin(r(b.locLat - a.locLat) / 2) ** 2 + Math.cos(r(a.locLat)) * Math.cos(r(b.locLat)) * Math.sin(r(b.locLon - a.locLon) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const STOP = new Set(['the', 'of', 'and', 'de', 'la', 'le', 'del', 'di', 'der', 'die', 'das', 'st', 'saint', 'museum', 'park', 'church']);
export function nameTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** Share of words two names have in common (Dice coefficient), 0..1. */
export function nameSimilarity(a: string, b: string): number {
  const x = new Set(nameTokens(a));
  const y = new Set(nameTokens(b));
  if (!x.size || !y.size) return 0;
  let common = 0;
  x.forEach((w) => y.has(w) && common++);
  return (2 * common) / (x.size + y.size);
}

/** The writing system of a name (Latin, Hebrew, Cyrillic, Arabic, Greek, CJK…), '' when it has no letters. */
export function scriptOf(name: string): string {
  const scripts: Array<[string, RegExp]> = [
    ['latin', /\p{Script=Latin}/u],
    ['hebrew', /\p{Script=Hebrew}/u],
    ['cyrillic', /\p{Script=Cyrillic}/u],
    ['arabic', /\p{Script=Arabic}/u],
    ['greek', /\p{Script=Greek}/u],
    ['cjk', /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u],
    ['thai', /\p{Script=Thai}/u],
    ['georgian', /\p{Script=Georgian}/u],
    ['armenian', /\p{Script=Armenian}/u],
  ];
  return scripts.find(([, r]) => r.test(name))?.[0] ?? '';
}

/**
 * Same place? Close together and similarly named; or practically on top of each other (80 m)
 * AND plausibly the same thing: names in different alphabets ("Western Wall" / "הכותל המערבי"),
 * a word in common, or the same kind of sight ("St. Stephen's Cathedral" / "Stephansdom"). Two
 * different things in one building never merge — a karaoke bar never takes the text of the
 * Wikipedia article next door, nor a restaurant that of the monument in front of it.
 */
export function samePlace(a: AttractionOut, b: AttractionOut): boolean {
  const d = km(a.location, b.location);
  if (d < 0.08) {
    const sa = scriptOf(a.name);
    const sb = scriptOf(b.name);
    if (sa && sb && sa !== sb) return true;
    if (nameSimilarity(a.name, b.name) >= 0.3) return true;
    return !!a.kind && a.kind === b.kind && a.kind !== 'other';
  }
  if (d < 0.4 && nameSimilarity(a.name, b.name) >= 0.5) return true;
  return d < 1.5 && nameSimilarity(a.name, b.name) >= 0.8;
}

const HOURS_RANK: Record<HoursSource, number> = { google: 3, tripadvisor: 2, openstreetmap: 1 };
const hoursRank = (a: AttractionOut) => (a.hoursSource && a.weeklyHours ? HOURS_RANK[a.hoursSource] : 0);

/** Same place from two sources? The same Wikidata item, or close together and similarly named. */
function twins(a: AttractionOut, b: AttractionOut): boolean {
  if (a.wikidataId && b.wikidataId) return a.wikidataId === b.wikidataId;
  if (a.provider === b.provider) return false; // one source never lists a place twice
  return samePlace(a, b);
}

/** Fills what `base` lacks from its twin `w` (never overwrites what the better source said). */
function absorb(base: AttractionOut, w: AttractionOut) {
  base.popularity = Math.max(base.popularity ?? 0, w.popularity ?? 0);
  base.wikidataId ??= w.wikidataId;
  if (!base.photo_urls.length && w.photo_urls.length) {
    base.photo_urls = w.photo_urls;
    base.photoSources = w.photoSources;
  }
  // Still no photo: Google's, fetched later if the place is used (attractions/index.ts → addGooglePhotos).
  if (!base.photo_urls.length && !base.googlePhoto && w.googlePhoto) {
    base.googlePhoto = w.googlePhoto;
    base.googlePhotoCredit = w.googlePhotoCredit;
  }
  if ((!base.kind || base.kind === 'other') && w.kind && w.kind !== 'other') base.kind = w.kind;
  base.types = [...new Set([...base.types, ...(w.kind ? KIND_TYPES[w.kind] : w.types)])];
  // The fuller description ("Large urban park with a lake, a Japanese garden…" beats "park in Tel Aviv").
  if ((w.description?.trim().length ?? 0) > (base.description?.trim().length ?? 0)) {
    base.description = w.description;
    base.descriptionSource = w.descriptionSource ?? w.provider;
  }
  // Opening hours from the most reliable source that has them: Google, then Tripadvisor, then the map.
  if (hoursRank(w) > hoursRank(base)) {
    base.weeklyHours = w.weeklyHours;
    base.openingHours = w.openingHours;
    base.hoursSource = w.hoursSource;
  }
  if (base.rating == null && w.rating != null && (w.provider === 'google' || w.provider === 'tripadvisor')) {
    base.rating = w.rating;
    base.numReviews = w.numReviews;
    base.ratingSource = w.provider;
  }
  if (!base.website && w.website) base.website = w.website;
  // Google Maps' wheelchair information, with the Google page that shows it.
  if (!base.wheelchair && w.wheelchair) {
    base.wheelchair = w.wheelchair;
    base.wheelchairPage = w.provider === 'google' ? w.link : w.wheelchairPage;
  }
  if (!base.address && w.address) base.address = w.address;
  if (!base.country && w.country) base.country = w.country;
}

/**
 * One list from any number of sources, best source first (Tripadvisor, Google, then the free
 * ones): a place found again in a later source is merged into the first record (higher popularity
 * of the two, a photo if it had none, the fuller description, the best-checked opening hours…).
 * Sorted by popularity, best first.
 */
export function mergeSources(lists: AttractionOut[][]): AttractionOut[] {
  const out: AttractionOut[] = [];
  const byId = new Set<string>();
  for (const list of lists) {
    for (const a of list) {
      if (byId.has(a.id)) continue;
      byId.add(a.id);
      const twin = out.find((o) => twins(o, a));
      if (twin) absorb(twin, a);
      else out.push({ ...a, popularity: a.popularity ?? taPopularity(a.rating, a.numReviews) });
    }
  }
  return out.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
}

/** Tripadvisor + the free sources (kept for the tests and callers of the two-list form). */
export const mergeAttractions = (ta: AttractionOut[], wd: AttractionOut[]) => mergeSources([ta, wd]);

/* ---------------- choosing the 10,000 places for the Europe-wide cache ---------------- */

export const CACHE_TARGET = 10_000;
const NATURE: ReadonlySet<Kind> = new Set<Kind>(['nationalpark', 'reserve', 'waterfall', 'lake', 'cave', 'canyon', 'beach', 'viewpoint', 'park', 'garden']);

/**
 * The best-known places, spread out: at most `perArea` in any ~25 km square (so Paris and Rome
 * don't take all the room, while a city like Prague still gets its 120 best), and at least a
 * quarter nature (national parks, lakes, waterfalls, caves…) — the off-the-beaten-track places a
 * family drives out of town for.
 */
export function selectForCache(places: WdPlace[], target = CACHE_TARGET, perArea = 120, natureShare = 0.25): WdPlace[] {
  const unique = new Map<string, WdPlace>();
  for (const p of places) {
    const prev = unique.get(p.qid);
    if (!prev || p.sitelinks > prev.sitelinks) unique.set(p.qid, p);
  }
  const sorted = [...unique.values()].sort((a, b) => b.sitelinks - a.sitelinks);
  const cell = (p: WdPlace) => `${Math.floor(p.lat / 0.25)}:${Math.floor(p.lon / 0.35)}`;
  const inCell = new Map<string, number>();
  const chosen: WdPlace[] = [];
  const take = (p: WdPlace) => {
    const c = cell(p);
    if ((inCell.get(c) ?? 0) >= perArea) return false;
    inCell.set(c, (inCell.get(c) ?? 0) + 1);
    chosen.push(p);
    return true;
  };
  const natureQuota = Math.round(target * natureShare);
  for (const p of sorted) {
    if (chosen.length >= natureQuota) break;
    if (NATURE.has(p.kind)) take(p);
  }
  const picked = new Set(chosen.map((p) => p.qid));
  for (const p of sorted) {
    if (chosen.length >= target) break;
    if (!picked.has(p.qid) && take(p)) picked.add(p.qid);
  }
  return chosen.sort((a, b) => b.sitelinks - a.sitelinks);
}

/** Places worth a day of their own on the way between two cities (Plitvice, Bran Castle…). */
export const isLandmark = (a: AttractionOut, minPopularity = 9.0) =>
  !!a.kind && LANDMARK_KINDS.has(a.kind) && (a.popularity ?? 0) >= minPopularity;

/** Each restaurant once: the same name within 200 m is the same restaurant (from two sources or two searches). */
export function uniqueRestaurants<T extends { name: string; location: { locLat: number; locLon: number } }>(list: T[]): T[] {
  const out: T[] = [];
  for (const r of list) if (!out.some((o) => km(o.location, r.location) < 0.2 && nameSimilarity(o.name, r.name) >= 0.8)) out.push(r);
  return out;
}
