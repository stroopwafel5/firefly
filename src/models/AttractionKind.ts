import type { EventType } from './common';

/**
 * What kind of place an attraction is. The server sets it (from Wikidata's class or
 * Tripadvisor's category — functions/src/attractions/kinds.ts); older saved trips without it
 * are classified here from their category text. The kind picks the emoji on the trip plan:
 * nature → 🌳 (Plitvice), history → 🏰 (the Colosseum), museum → 🏛️…
 */
export type AttractionKind =
  | 'castle' | 'palace' | 'fortress' | 'ruins' | 'monument' | 'oldtown' | 'square' | 'bridge' | 'tower'
  | 'museum' | 'gallery' | 'church' | 'monastery' | 'synagogue' | 'mosque'
  | 'nationalpark' | 'reserve' | 'park' | 'garden' | 'lake' | 'waterfall' | 'cave' | 'canyon' | 'beach' | 'viewpoint'
  | 'zoo' | 'aquarium' | 'themepark' | 'theatre' | 'market' | 'food' | 'nightlife' | 'shopping' | 'spa' | 'rental' | 'other';

export const KIND_EMOJI: Record<AttractionKind, string> = {
  castle: '🏰', palace: '🏰', fortress: '🏰', ruins: '🏰', monument: '🏰', oldtown: '🏰', square: '🏰', bridge: '🌉', tower: '🗼',
  museum: '🏛️', gallery: '🖼️', church: '⛪', monastery: '⛪', synagogue: '🕍', mosque: '🕌',
  nationalpark: '🌳', reserve: '🌳', park: '🌳', garden: '🌷', lake: '🏞️', waterfall: '🏞️', cave: '🦇', canyon: '⛰️', beach: '🏖️', viewpoint: '🔭',
  zoo: '🦁', aquarium: '🐠', themepark: '🎢', theatre: '🎭', market: '🧺', food: '🍽️', nightlife: '🌙', shopping: '🛍️', spa: '♨️', rental: '🚲', other: '📍',
};

/** Emoji by trip type, for places whose kind is unknown. */
export const TYPE_EMOJI: Record<EventType, string> = {
  Nature: '🌳', History: '🏰', Theatre: '🎭', Festival: '🎉', Food: '🍽️', Tour: '🧭', Family: '🎡', 'Kid Friendly': '🧸',
};

/** Never planned as sights (food places only when the traveller picked Food). */
export const NOT_A_SIGHT: ReadonlySet<AttractionKind> = new Set<AttractionKind>(['nightlife', 'shopping', 'spa', 'rental']);

const TEXT_KINDS: Array<[RegExp, AttractionKind]> = [
  [/bike rental|car rental|rental|equipment hire|scooter/i, 'rental'],
  [/\bspa\b|wellness|massage|beer spa|beer bath|thermal bath|sauna/i, 'spa'],
  [/\bbars?\b|\bpubs?\b|nightlife|nightclub|casino|lounge|cocktail/i, 'nightlife'],
  [/shopping|\bshops?\b|store|boutique|mall|outlet|gift|antique|flea/i, 'shopping'],
  [/restaurant|eat & drink|cafe|café|coffee|bakery|brewer|winer|distiller|food tour|tasting|cooking class|culinary/i, 'food'],
  [/national park/i, 'nationalpark'],
  [/nature reserve|wildlife area|reserve/i, 'reserve'],
  [/waterfall/i, 'waterfall'],
  [/cave|grotto/i, 'cave'],
  [/canyon|gorge/i, 'canyon'],
  [/lake|bodies of water/i, 'lake'],
  [/beach/i, 'beach'],
  [/zoo|safari|wildlife park/i, 'zoo'],
  [/aquarium/i, 'aquarium'],
  [/theme park|amusement|water park/i, 'themepark'],
  [/castle|château|chateau/i, 'castle'],
  [/palace/i, 'palace'],
  [/fortress|citadel|\bfort\b/i, 'fortress'],
  [/ruins|archaeolog/i, 'ruins'],
  [/art museum|gallery/i, 'gallery'],
  [/museum/i, 'museum'],
  [/synagogue/i, 'synagogue'],
  [/mosque/i, 'mosque'],
  [/monaster|abbey|convent/i, 'monastery'],
  [/church|cathedral|basilica|chapel/i, 'church'],
  [/theat|theater|opera|concert hall|ballet/i, 'theatre'],
  [/market/i, 'market'],
  [/garden/i, 'garden'],
  [/park/i, 'park'],
  [/observation|viewpoint|lookout|scenic/i, 'viewpoint'],
  [/tower/i, 'tower'],
  [/bridge/i, 'bridge'],
  [/old town|historic district|neighbo/i, 'oldtown'],
  [/square|plaza/i, 'square'],
  [/monument|memorial|statue|fountain|landmark/i, 'monument'],
];

const KINDS = new Set<string>(Object.keys(KIND_EMOJI));
export const isKind = (s: unknown): s is AttractionKind => typeof s === 'string' && KINDS.has(s);

export function kindFromText(text: string): AttractionKind {
  for (const [re, kind] of TEXT_KINDS) if (re.test(text)) return kind;
  return 'other';
}

/** The emoji for a place: by its kind, else by its first trip type. */
export function attractionEmoji(a: { kind?: AttractionKind; types: EventType[]; category?: string; name?: string }): string {
  const kind = a.kind ?? kindFromText(`${a.category ?? ''} ${a.name ?? ''}`);
  if (kind !== 'other') return KIND_EMOJI[kind];
  return a.types[0] ? TYPE_EMOJI[a.types[0]] : KIND_EMOJI.other;
}

/**
 * Popularity on a 0–10 scale. Set by the server; for older data, Tripadvisor's rating doubled
 * and pulled towards 7.0 when there are few reviews (same formula as the server).
 */
export function popularityOf(a: { popularity?: number; rating?: number; numReviews?: number }): number {
  if (a.popularity != null && Number.isFinite(a.popularity)) return a.popularity;
  if (a.rating == null) return 6.5;
  const v = Math.max(0, a.numReviews ?? 0);
  const m = 50;
  return Math.round(Math.min(10, (v / (v + m)) * a.rating * 2 + (m / (v + m)) * 7) * 10) / 10;
}
