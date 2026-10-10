import { TA_KEYWORDS } from '../data/tripTypes';
import { EVENT_TYPES, EventType } from '../models';
import type { Attraction } from '../models';

/** Places that are never suggested on a trip with children. */
const ADULT_ONLY = /\bbars?\b|pub|nightclub|night ?life|casino|strip|wine bar|brewer|distiller|cannabis|coffeeshop|sex|erotic/i;

/**
 * Turns TripAdvisor category/subcategory/group names into our 8 types, a visit length and
 * an adults-only flag. Pure and language-independent: we always classify the English names
 * (the TripAdvisor proxy asks for English category labels alongside the localized text).
 */
export function classify(categoryText: string): { types: EventType[]; duration: number; adultOnly: boolean } {
  const types = EVENT_TYPES.filter((t) => TA_KEYWORDS[t].test(categoryText));
  return { types, duration: visitMinutes(categoryText), adultOnly: ADULT_ONLY.test(categoryText) };
}

export function visitMinutes(categoryText: string): number {
  const c = categoryText.toLowerCase();
  if (/theme park|amusement|water park/.test(c)) return 240;
  if (/zoo|aquarium|safari/.test(c)) return 180;
  if (/museum|gallery|exhibition/.test(c)) return 120;
  if (/castle|palace|fortress|archaeolog|ruins/.test(c)) return 120;
  if (/hik|trail|national park|canyon|cave/.test(c)) return 150;
  if (/park|garden|beach|lake/.test(c)) return 75;
  if (/church|cathedral|synagogue|temple|mosque|chapel|monaster/.test(c)) return 45;
  if (/bridge|square|viewpoint|monument|landmark|observation|statue|fountain|street|neighbo/.test(c)) return 40;
  if (/market/.test(c)) return 60;
  return 90;
}

/** The pieces of an attraction's score, so testers can see where the number comes from. */
export interface ScoreParts {
  /** rating × 10 (3.8 assumed when TripAdvisor has no rating). */
  quality: number;
  /** log10(reviews + 1) × 8 — popular places win, but with diminishing returns. */
  popularity: number;
  /** +12 for each chosen type the place matches, counted up to 2. */
  typeMatch: number;
  /** +10 on family trips for kid-friendly / family places. */
  family: number;
  total: number;
}

export function scoreParts(a: Attraction, wanted: EventType[], familyTrip: boolean): ScoreParts {
  const quality = (a.rating ?? 3.8) * 10;
  const popularity = Math.log10((a.numReviews ?? 10) + 1) * 8;
  const typeMatch = Math.min(2, a.types.filter((t) => wanted.includes(t)).length) * 12;
  const family = familyTrip && (a.types.includes('Kid Friendly') || a.types.includes('Family')) ? 10 : 0;
  const r = (x: number) => Math.round(x * 10) / 10;
  return { quality: r(quality), popularity: r(popularity), typeMatch, family, total: r(quality + popularity + typeMatch + family) };
}

/**
 * How attractive a place is for this traveller (roughly 30–110):
 *  - quality: rating × 10 plus log10(reviews + 1) × 8 (popular *and* well-rated wins)
 *  - +12 for each of the traveller's chosen types it matches (counted up to 2)
 *  - +10 on family trips for zoos, parks, interactive museums etc.
 */
export function scoreAttraction(a: Attraction, wanted: EventType[], familyTrip: boolean): number {
  return scoreParts(a, wanted, familyTrip).total;
}

export function isSuitable(a: Attraction, familyTrip: boolean, kidFriendlyOnly: boolean): boolean {
  if ((familyTrip || kidFriendlyOnly) && ADULT_ONLY.test(`${a.category} ${a.name}`)) return false;
  if (kidFriendlyOnly) return a.types.includes('Kid Friendly') || a.types.includes('Family') || a.types.includes('Nature');
  return true;
}
