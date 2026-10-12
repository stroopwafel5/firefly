import { BIG_CITIES, TOURIST_TOWNS, type CityRow } from '../data/bigCities';
import { Location } from '../models';
import { areaStatus } from './safety';

/**
 * Instant, offline suggestions for the trip form: the app's own list of big cities and tourist
 * towns (English names), matched as the traveller types. Server suggestions (any language) are
 * added on top in the form. Pure: unit-tested.
 */

export interface Suggestion {
  name: string;
  detail: string;
  lat: number;
  lon: number;
  country: string;
}

export const normalizePlace = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Cities whose name (or a word of it) starts with what was typed, biggest first. */
export function localPlaceMatches(query: string, limit = 4): Suggestion[] {
  const q = normalizePlace(query);
  if (q.length < 2) return [];
  const rows: CityRow[] = [...BIG_CITIES, ...TOURIST_TOWNS];
  const hits = rows.filter(([name, cc, lat, lon]) => {
    const n = normalizePlace(name);
    if (!(n.startsWith(q) || n.split(' ').some((w) => w.startsWith(q)))) return false;
    // No point suggesting a place nobody can visit (Gaza, Pyongyang).
    return areaStatus(new Location(lat, lon), cc)?.level !== 'closed';
  });
  return hits
    .sort((a, b) => b[4] - a[4])
    .slice(0, limit)
    .map(([name, cc, lat, lon]) => ({ name, detail: cc, lat, lon, country: cc }));
}

/**
 * Server and local suggestions in one list, without the same place twice: a city centre within
 * ~2 km of an earlier suggestion is that place (in another language, e.g. "פראג" and "Prague").
 */
export function mergePlaceSuggestions(first: Suggestion[], second: Suggestion[], max = 6): Suggestion[] {
  const out: Suggestion[] = [];
  for (const s of [...first, ...second]) {
    if (out.some((o) => Math.abs(o.lat - s.lat) < 0.02 && Math.abs(o.lon - s.lon) < 0.03)) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}
