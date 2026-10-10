import { KIND_TYPES, Kind, LANDMARK_KINDS } from './kinds';
import type { WdPlace } from './wikidata';

/**
 * Combining Tripadvisor and Wikidata into one list of attractions, all treated the same way.
 * Pure (no Firebase), unit-tested.
 */

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
  provider: 'tripadvisor' | 'wikidata';
  kind?: Kind;
  popularity?: number;
  wikidataId?: string;
  description?: string;
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

/** Same place? Close together and similarly named, or practically on top of each other. */
export function samePlace(a: AttractionOut, b: AttractionOut): boolean {
  const d = km(a.location, b.location);
  if (d < 0.08) return true;
  if (d < 0.4 && nameSimilarity(a.name, b.name) >= 0.5) return true;
  return d < 1.5 && nameSimilarity(a.name, b.name) >= 0.8;
}

/**
 * One list from both sources: a Wikidata place that Tripadvisor also has is merged into the
 * Tripadvisor record (higher popularity of the two, Wikidata's photo if Tripadvisor had none,
 * the more specific kind). Sorted by popularity, best first.
 */
export function mergeAttractions(ta: AttractionOut[], wd: AttractionOut[]): AttractionOut[] {
  const out: AttractionOut[] = ta.map((a) => ({ ...a, popularity: a.popularity ?? taPopularity(a.rating, a.numReviews) }));
  for (const w of wd) {
    const twin = out.find((a) => a.provider === 'tripadvisor' && samePlace(a, w));
    if (!twin) {
      out.push({ ...w });
      continue;
    }
    twin.popularity = Math.max(twin.popularity ?? 0, w.popularity ?? 0);
    twin.wikidataId = w.wikidataId;
    if (!twin.photo_urls.length && w.photo_urls.length) {
      twin.photo_urls = w.photo_urls;
      twin.photoSources = w.photoSources;
    }
    if ((!twin.kind || twin.kind === 'other') && w.kind) twin.kind = w.kind;
    twin.types = [...new Set([...twin.types, ...(w.kind ? KIND_TYPES[w.kind] : w.types)])];
    if (!twin.description && w.description) twin.description = w.description;
  }
  return out.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
}

/* ---------------- choosing the 5,000 places for the Europe-wide cache ---------------- */

export const CACHE_TARGET = 5000;
const NATURE: ReadonlySet<Kind> = new Set<Kind>(['nationalpark', 'reserve', 'waterfall', 'lake', 'cave', 'canyon', 'beach', 'viewpoint', 'park', 'garden']);

/**
 * The best-known places, spread out: at most `perArea` in any ~25 km square (so Paris and Rome
 * don't take all the room), and at least a quarter nature (national parks, lakes, waterfalls,
 * caves…) — the off-the-beaten-track places a family drives out of town for.
 */
export function selectForCache(places: WdPlace[], target = CACHE_TARGET, perArea = 60, natureShare = 0.25): WdPlace[] {
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
