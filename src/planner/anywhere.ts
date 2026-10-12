import type { Event, EventType } from '../models';
import { Location } from '../models';
import { haversineKm } from './geo';
import { Place, routeCandidates } from './route';
import { allowedSpot, tripArea } from './safety';

/**
 * "Take me anywhere": the places within 1,500 km of the traveller with the most interesting
 * events on their dates. Events are counted for the big city or famous town they are nearest
 * to (within 60 km); festivals, family and outdoor events, ones that fit the trip's interests
 * and Firefly's hand-checked ones count a little more; a place counts a little less the further
 * away it is. Home (within 40 km) and places nobody can visit are never suggested.
 * Pure, unit-tested.
 */

export const ANYWHERE_MAX_KM = 1500;
const HOME_KM = 40;
const NEAR_CITY_KM = 60;
const MIN_EVENTS = 3;
const LIVELY: ReadonlySet<EventType> = new Set<EventType>(['Festival', 'Family', 'Kid Friendly', 'Nature', 'Food']);

export interface Hotspot {
  name: string;
  country: string;
  location: Location;
  /** Distance from the traveller, km. */
  km: number;
  /** Events on the dates, best first. */
  events: Event[];
  score: number;
}

export function eventHotspots(
  events: Event[],
  here: Location,
  from: Date,
  to: Date,
  o: { types?: EventType[]; familyTrip?: boolean; maxKm?: number; limit?: number; minEvents?: number } = {},
): Hotspot[] {
  const maxKm = o.maxKm ?? ANYWHERE_MAX_KM;
  const minEvents = o.minEvents ?? MIN_EVENTS;
  const area = tripArea([{ location: here }]);
  const cities = routeCandidates().filter((c) => {
    const d = haversineKm(here, c.location);
    return d > HOME_KM && d <= maxKm + NEAR_CITY_KM && allowedSpot(c.location, c.country, area);
  });
  const weight = (e: Event) =>
    1 +
    (e.types.some((t) => LIVELY.has(t)) ? 0.5 : 0) +
    (o.types?.some((t) => e.types.includes(t)) ? 0.5 : 0) +
    (o.familyTrip && e.isKidFriendly ? 0.5 : 0) +
    (e.origin === 'curated' ? 0.5 : 0);
  const byCity = new Map<string, { city: Place; events: Array<{ e: Event; w: number }> }>();
  const seen = new Set<string>();
  for (const e of events) {
    if (seen.has(e.id) || !e.overlaps(from, to)) continue;
    seen.add(e.id);
    const d = haversineKm(here, e.location);
    if (d <= HOME_KM || d > maxKm || !allowedSpot(e.location, e.country, area)) continue;
    let best: Place | null = null;
    let bestKm = NEAR_CITY_KM;
    for (const c of cities) {
      const k = haversineKm(c.location, e.location);
      if (k < bestKm) [best, bestKm] = [c, k];
    }
    if (!best) continue;
    const entry = byCity.get(best.id) ?? { city: best, events: [] };
    entry.events.push({ e, w: weight(e) });
    byCity.set(best.id, entry);
  }
  return [...byCity.values()]
    .filter((x) => x.events.length >= minEvents)
    .map((x) => {
      const km = Math.round(haversineKm(here, x.city.location));
      const total = x.events.reduce((s, y) => s + y.w, 0);
      return {
        name: x.city.name,
        country: x.city.country,
        location: x.city.location,
        km,
        score: total / (1 + km / 3000),
        events: x.events.sort((a, b) => b.w - a.w || a.e.startDate.getTime() - b.e.startDate.getTime()).map((y) => y.e),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, o.limit ?? 6);
}
