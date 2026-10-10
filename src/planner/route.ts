import { BIG_CITIES, CityRow, TOURIST_TOWNS } from '../data/bigCities';
import { Attraction, EventType, Location, MODE_CAR, ModeOfTravel, NOT_A_SIGHT, popularityOf } from '../models';
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

/** Bigger places first when choosing the next stop: 1M+, 500k+, 250k+ or a famous town, the rest. */
export function sizeTier(p: Place): number {
  if (p.kind === 'town') return 1;
  return p.population >= 1_000_000 ? 3 : p.population >= 500_000 ? 2 : p.population >= 250_000 ? 1 : 0;
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
}

/**
 * The next stop: the biggest city within a day's travel that keeps the destination reachable in
 * time — on a one-way trip also heading towards it (no long detours) — and, between equals, the
 * nearest one. The destination itself only when nothing else fits or time is up.
 */
export function chooseNextStop(x: NextStopInput): Place {
  const { current, target, maxLegKm } = x;
  const here = current.location;
  const toTarget = haversineKm(here, target.location);
  if (x.daysAfter <= 0) return target;
  const fits = (c: Place) => {
    if (x.visited.has(c.id) || c.id === current.id) return false;
    const leg = haversineKm(here, c.location);
    if (leg < MIN_LEG_KM || leg > maxLegKm) return false;
    if (haversineKm(c.location, target.location) < MIN_LEG_KM) return false; // that's the destination itself
    if (legsNeeded(c.location, target.location, maxLegKm) > x.daysAfter) return false;
    if (x.oneWay) {
      const rest = haversineKm(c.location, target.location);
      if (rest >= toTarget - 20) return false; // must get closer
      if (leg >= toTarget) return false; // never overshoot the destination
      if (leg + rest > 1.3 * toTarget + 30) return false; // on the way: no long detours
    }
    return true;
  };
  const list = (x.places ?? routeCandidates()).filter(fits);
  if (!list.length) {
    if (haversineKm(here, target.location) <= maxLegKm || !x.oneWay) return target;
    // Out of reach in one day and nothing fits: the furthest step towards the destination.
    const step = (x.places ?? routeCandidates())
      .filter((c) => !x.visited.has(c.id) && haversineKm(here, c.location) <= maxLegKm)
      .sort((a, b) => haversineKm(a.location, target.location) - haversineKm(b.location, target.location))[0];
    return step ?? target;
  }
  list.sort((a, b) => sizeTier(b) - sizeTier(a) || haversineKm(here, a.location) - haversineKm(here, b.location));
  return list[0];
}

/* ---------------- ranking attractions ---------------- */

export interface Niche {
  types: EventType[];
  familyTrip: boolean;
  /** Accessibility needs that are checked place by place (none = not considered). */
  needs: string[];
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
  const popularity = Math.floor(popularityOf(a) * 2) / 2;
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
  if (NOT_A_SIGHT.has(a.kind)) return false;
  if (a.kind === 'food' && !types.includes('Food')) return false;
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
