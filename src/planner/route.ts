import { BIG_CITIES, CityRow, TOURIST_TOWNS } from '../data/bigCities';
import { Attraction, EventType, Location, MODE_CAR, ModeOfTravel, eateryKind, isEventDescription, isOrganization, isPersonDescription, popularityOf } from '../models';
import { haversineKm } from './geo';

/**
 * Where the trip goes, day by day, and in which order places are visited — the greedy route
 * algorithm Different Route asked for. Pure (no network), unit-tested in tests/route.test.ts.
 *
 * Attractions are chosen greedily, comparing in this order of priority:
 *   1. popularity / rating (0–10, in half-point steps so that the next priorities can decide
 *      between places of the same standing),
 *   2. suitability to the accessibility needs chosen (how many of them the place is confirmed for),
 *   3. suitability to the trip types and ages (how many chosen types it matches; kid-friendly
 *      places on family trips),
 *   4. distance from the previous point (the last place visited, or last night's hotel).
 *
 * Moving on: after each day the trip leaves the city when it has run out of attractions rated
 * 9.0 or more AND of attractions rated 7.0 or more that fit the traveller's niches (types, ages,
 * accessibility). Except in world cities (Paris, London, New York…), it never stays more than
 * 4 days in one city. The next stop is the next big city (150,000+ people, or a famous tourist
 * town) towards the destination; a world-class landmark on the way (e.g. Plitvice between
 * Zagreb and Zadar) can be a stop of its own.
 */

export const MAX_DAYS_IN_CITY = 4;
export const TOP_RATING = 9.0;
export const NICHE_RATING = 7.0;
/** One day's travel at most between stops: 450 km by car, 400 km by train or bus. */
export const maxLegKm = (mode: ModeOfTravel): number => (mode === MODE_CAR ? 450 : 400);
/** A shorter hop than this isn't a new stop (it's a suburb or a day trip). */
export const MIN_LEG_KM = 60;
/** Attractions are looked for within this distance of a city's centre. */
export const CITY_RADIUS_KM = 12;
export const LANDMARK_RADIUS_KM = 20;

/** World cities: no 4-day limit. [name, latitude, longitude] — matched by position (30 km). */
export const WORLD_CITIES: Array<[string, number, number]> = [
  ['London', 51.507, -0.128],
  ['Paris', 48.853, 2.349],
  ['New York', 40.713, -74.006],
  ['Rome', 41.893, 12.483],
  ['Istanbul', 41.014, 28.95],
  ['Tokyo', 35.69, 139.692],
];

export type PlaceKind = 'start' | 'end' | 'city' | 'town' | 'landmark';

export interface Place {
  id: string;
  name: string;
  country: string;
  location: Location;
  population: number;
  kind: PlaceKind;
}

export function isWorldCity(loc: Location): boolean {
  return WORLD_CITIES.some(([, lat, lon]) => haversineKm(loc, new Location(lat, lon)) <= 30);
}

let candidates: Place[] | null = null;
/** Every big city and famous tourist town, as possible stops. */
export function routeCandidates(): Place[] {
  if (candidates) return candidates;
  const mk = (kind: PlaceKind) => (r: CityRow): Place => ({
    id: `${kind}:${r[1]}:${r[0]}`,
    name: r[0],
    country: r[1],
    location: new Location(r[2], r[3]),
    population: r[4],
    kind,
  });
  candidates = [...BIG_CITIES.map(mk('city')), ...TOURIST_TOWNS.map(mk('town'))];
  return candidates;
}

/** Days of travel needed between two points (0 when they are the same place). */
export function legsNeeded(a: Location, b: Location, maxLegKm: number): number {
  const d = haversineKm(a, b);
  return d < MIN_LEG_KM ? 0 : Math.ceil(d / maxLegKm);
}

/**
 * Popular places or off the beaten track — the traveller's choice. Popular: the big cities and
 * the best-known sights first. Off the beaten track: smaller cities and towns as stops, and the
 * well-loved but less crowded sights first (offbeatScore).
 */
export type TripStyle = 'popular' | 'offbeat';

/** Bigger places first when choosing the next stop: 1M+, 500k+, 250k+ or a famous town, the rest. */
export function sizeTier(p: Place): number {
  if (p.kind === 'town') return 1;
  return p.population >= 1_000_000 ? 3 : p.population >= 500_000 ? 2 : p.population >= 250_000 ? 1 : 0;
}

/** Off the beaten track: smaller cities (under 500,000) first, then towns, then big cities, metropolises last. */
export function offbeatTier(p: Place): number {
  if (p.kind === 'town') return 2;
  return p.population >= 1_000_000 ? 0 : p.population >= 500_000 ? 1 : 3;
}

/**
 * How an attraction ranks off the beaten track: its rating, but the world-famous ones no higher
 * than 8.5, the crowds' favourites (20,000+ reviews) a point lower, and a well-loved place few
 * people know (7.5+, under 2,000 reviews) half a point higher.
 */
export function offbeatScore(a: { popularity?: number; rating?: number; numReviews?: number }): number {
  const p = popularityOf(a);
  let v = Math.min(p, 8.5);
  if (a.numReviews != null && a.numReviews > 20_000) v -= 1;
  else if (p >= 7.5 && a.numReviews != null && a.numReviews < 2_000) v += 0.5;
  return v;
}

export interface NextStopInput {
  current: Place;
  /** The destination (the start city again on a round trip). */
  target: Place;
  oneWay: boolean;
  /** Days left after the day spent at the next stop (the trip must reach `target` in them). */
  daysAfter: number;
  visited: Set<string>;
  maxLegKm: number;
  places?: Place[];
  /**
   * Heading for one of the traveller's own destinations: among the stops that fit, those that
   * leave the fewest days of travel to it come first (then bigger cities, then nearer), so the
   * route doesn't zig-zag through big cities and eat the destinations' days.
   */
  fewestHops?: boolean;
  /** Off the beaten track: smaller places first (offbeatTier) instead of the biggest. */
  offbeat?: boolean;
}

/**
 * The next stop: the biggest city within a day's travel that keeps the destination reachable in
 * time — on a one-way trip also heading towards it (no long detours) — and, between equals, the
 * nearest one. The destination itself only when nothing else fits or time is up.
 */
export function chooseNextStop(x: NextStopInput): Place {
  const { current, target, maxLegKm } = x;
  const here = current.location;
  if (x.daysAfter <= 0) return target;
  const all = x.places ?? routeCandidates();
  /** Can `c` be the next stop after `from`, with `daysAfter` days left after it? */
  const fitsFrom = (from: Place, c: Place, daysAfter: number, skip: (c: Place) => boolean) => {
    if (skip(c) || c.id === from.id) return false;
    const leg = haversineKm(from.location, c.location);
    if (leg < MIN_LEG_KM || leg > maxLegKm) return false;
    if (haversineKm(c.location, target.location) < MIN_LEG_KM) return false; // that's the destination itself
    if (legsNeeded(c.location, target.location, maxLegKm) > daysAfter) return false;
    if (x.oneWay) {
      const toTarget = haversineKm(from.location, target.location);
      const rest = haversineKm(c.location, target.location);
      if (rest >= toTarget - 20) return false; // must get closer
      if (leg >= toTarget) return false; // never overshoot the destination
      if (leg + rest > 1.3 * toTarget + 30) return false; // on the way: no long detours
    }
    return true;
  };
  const visited = (c: Place) => x.visited.has(c.id);
  const tier = x.offbeat ? offbeatTier : sizeTier;
  const list = all.filter((c) => fitsFrom(current, c, x.daysAfter, visited));
  if (!list.length) {
    if (haversineKm(here, target.location) <= maxLegKm || !x.oneWay) return target;
    // Out of reach in one day and nothing fits: the furthest step towards the destination.
    const step = all
      .filter((c) => !x.visited.has(c.id) && haversineKm(here, c.location) <= maxLegKm)
      .sort((a, b) => haversineKm(a.location, target.location) - haversineKm(b.location, target.location))[0];
    return step ?? target;
  }
  const hops = (c: Place) => (x.fewestHops ? legsNeeded(c.location, target.location, maxLegKm) : 0);
  // How much of the way is left after this stop, in 100 km steps (a big city 40 km short of the
  // furthest stop still wins; a big city that leaves 300 km more does not).
  const left = (c: Place) => (x.fewestHops ? Math.round(haversineKm(c.location, target.location) / 100) : 0);
  // One step ahead (one-way trips): a stop that leads on to another big city is worth more than a
  // bigger one that leaves only small towns before the destination — Vienna → Vilnius goes
  // Kraków → Warsaw rather than Prague → Toruń.
  const nearby = x.oneWay && x.daysAfter > 1 ? all.filter((c) => haversineKm(here, c.location) <= 2 * maxLegKm) : [];
  const ahead = new Map<string, number>();
  const onward = (c: Place) => {
    if (!nearby.length) return 0;
    let v = ahead.get(c.id);
    if (v == null) {
      v = 0;
      const skip = (n: Place) => x.visited.has(n.id) || n.id === c.id || n.id === current.id;
      for (const n of nearby) if (tier(n) > v && fitsFrom(c, n, x.daysAfter - 1, skip)) v = tier(n);
      ahead.set(c.id, v);
    }
    return v;
  };
  list.sort(
    (a, b) =>
      hops(a) - hops(b) ||
      left(a) - left(b) ||
      tier(b) + onward(b) - (tier(a) + onward(a)) ||
      tier(b) - tier(a) ||
      haversineKm(here, a.location) - haversineKm(here, b.location),
  );
  return list[0];
}

/* ---------------- ranking attractions ---------------- */

export interface Niche {
  types: EventType[];
  familyTrip: boolean;
  /** Accessibility needs that are checked place by place (none = not considered). */
  needs: string[];
  /** Off the beaten track: less crowded sights first (offbeatScore). */
  offbeat?: boolean;
}

/** Does the place fit what this traveller is looking for? (Everything fits when nothing was chosen.) */
export function fitsNiche(a: Attraction, n: Niche): boolean {
  const chosen = n.types.length > 0 || n.familyTrip || n.needs.length > 0;
  if (!chosen) return true;
  if (n.types.some((t) => a.types.includes(t))) return true;
  if (n.familyTrip && (a.types.includes('Family') || a.types.includes('Kid Friendly'))) return true;
  return n.needs.some((need) => a.disabilityCompatible.includes(need));
}

/** Priorities 1–3 as numbers (higher is better), compared left to right. */
export function rankOf(a: Attraction, n: Niche): [number, number, number] {
  const popularity = Math.floor((n.offbeat ? offbeatScore(a) : popularityOf(a)) * 2) / 2;
  const access = n.needs.filter((need) => a.disabilityCompatible.includes(need)).length;
  const typeFit = Math.min(2, n.types.filter((t) => a.types.includes(t)).length);
  const ageFit = n.familyTrip && (a.types.includes('Family') || a.types.includes('Kid Friendly')) ? 1 : 0;
  return [popularity, access, typeFit + ageFit];
}

export function compareRank(x: readonly number[], y: readonly number[]): number {
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (y[i] ?? 0) - (x[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Greedy order: repeatedly take the best-ranked remaining place; between equally ranked ones,
 * the nearest to the previous point (priority 4). Returns at most `limit` places.
 */
export function greedyOrder(pool: Attraction[], from: Location, n: Niche, limit: number): Attraction[] {
  const left = pool.map((a) => ({ a, rank: rankOf(a, n) }));
  const out: Attraction[] = [];
  let at = from;
  while (left.length && out.length < limit) {
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      const c = compareRank(left[i].rank, left[best].rank);
      if (c < 0 || (c === 0 && haversineKm(at, left[i].a.location) < haversineKm(at, left[best].a.location))) best = i;
    }
    const [{ a }] = left.splice(best, 1);
    out.push(a);
    at = a.location;
  }
  return out;
}

/** Places the planner may suggest at all (no bars or rentals; food places only if Food was chosen). */
export function plannable(a: Attraction, types: EventType[]): boolean {
  // Never sights: spas and rentals. Shops and night clubs only for travellers who chose them
  // (a night club is planned as the evening's night out, see generator.ts).
  if (a.kind === 'spa' || a.kind === 'rental') return false;
  if (a.kind === 'nightlife') return types.includes('Night Clubs');
  if (a.kind === 'shopping') return types.includes('Shopping');
  // Tour companies, travel agencies and guest houses are not places to visit (activities are).
  if (isOrganization(a)) return false;
  // Nor people (a tomb on the map linked to the person's Wikidata item: "Sultan of Morocco…"), nor
  // events (Wikipedia's "2010 Mount Carmel forest fire").
  if (a.provider === 'wikidata' && (isPersonDescription(a.description) || isEventDescription(a.description, a.name))) return false;
  // Places to eat: a meal place is the day's lunch or dinner, never a sight; a café, patisserie or
  // ice-cream parlour is a sight only for travellers who chose Food (markets and wineries always are).
  const eat = eateryKind(a);
  if (eat === 'meal') return false;
  if (eat === 'sweets') return types.includes('Food');
  return true;
}

/**
 * Should the trip leave this city now? It has run out of attractions rated 9.0+ and of 7.0+
 * ones that fit the niches — or it has had its 4 days (world cities excepted).
 */
export function cityExhausted(remaining: Attraction[], n: Niche): boolean {
  const top = remaining.some((a) => popularityOf(a) >= TOP_RATING);
  const niche = remaining.some((a) => popularityOf(a) >= NICHE_RATING && fitsNiche(a, n));
  return !top && !niche;
}

export function overStay(place: Place, daysHere: number): boolean {
  return daysHere >= MAX_DAYS_IN_CITY && !isWorldCity(place.location);
}
