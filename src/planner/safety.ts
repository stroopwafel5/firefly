import type { Location } from '../models';
import { haversineKm } from './geo';

/**
 * Places a trip must not go to, and places it may go to with a warning.
 *
 *  - Closed (never planned, never suggested): areas nobody can enter as a visitor — the Gaza
 *    Strip, North Korea, the Chernobyl exclusion zone.
 *  - Warning (planned, with a note on the trip): Palestinian Authority towns (Area A: Bethlehem,
 *    Ramallah, Jericho…), Ukraine (at war), Crimea and the other occupied parts of Ukraine.
 *  - Countries Israelis can't enter (Lebanon, Syria, Iran, Iraq, Yemen): there is no open border
 *    with Israel, so the planner never routes into them or picks sights across the border from
 *    Israel; a trip the traveller starts or ends there is planned, with a warning.
 *
 * Borders are drawn coarsely, with a small margin away from Israeli towns (Netiv HaAsara, Nahal
 * Oz, Metula, Majdal Shams stay outside). Pure, unit-tested (tests/safety.test.ts).
 */

export type AreaId = 'gaza' | 'northKorea' | 'chernobyl' | 'paArea' | 'ukraine' | 'crimea' | 'occupiedUkraine' | 'noIsraeliEntry';
export type AreaLevel = 'closed' | 'warn';

export interface AreaStatus {
  id: AreaId;
  level: AreaLevel;
  /** ISO code of the country, when it decides the status (Lebanon, Syria…). */
  country?: string;
}

type Poly = ReadonlyArray<readonly [number, number]>; // [lat, lon]

/** The Gaza Strip: the coast, the border fence with Israel, and the border with Egypt at Rafah. */
const GAZA: Poly = [
  [31.598, 34.478],
  [31.592, 34.492],
  [31.555, 34.56],
  [31.52, 34.545],
  [31.47, 34.478],
  [31.43, 34.452],
  [31.372, 34.374],
  [31.31, 34.366],
  [31.25, 34.296],
  [31.222, 34.272],
  [31.325, 34.214],
  [31.34, 34.2],
  [31.42, 34.285],
  [31.52, 34.385],
];

/** Lebanon (the Blue Line with Israel in the south, Syria in the east and north, the sea). */
const LEBANON: Poly = [
  [33.096, 35.05],
  [33.096, 35.1],
  [33.09, 35.145],
  [33.108, 35.285],
  [33.096, 35.317],
  [33.095, 35.467],
  [33.11, 35.513],
  [33.214, 35.535],
  [33.248, 35.541],
  [33.278, 35.566],
  [33.292, 35.574],
  [33.277, 35.623],
  [33.315, 35.68],
  [33.36, 35.76],
  [33.416, 35.857],
  [33.6, 36.07],
  [33.83, 36.37],
  [34.08, 36.42],
  [34.39, 36.59],
  [34.53, 36.47],
  [34.64, 36.35],
  [34.655, 36.0],
  [34.64, 35.9],
  [34.44, 35.75],
  [34.12, 35.58],
  [33.89, 35.43],
  [33.56, 35.31],
  [33.27, 35.15],
];

/** South-western Syria, east of the Golan ceasefire line (for places without a country code). */
const SYRIA_NEAR_ISRAEL: Poly = [
  [33.416, 35.857],
  [33.33, 35.808],
  [33.26, 35.8],
  [33.18, 35.822],
  [33.12, 35.832],
  [33.05, 35.865],
  [32.95, 35.885],
  [32.82, 35.895],
  [32.75, 35.9],
  [32.7, 35.97],
  [32.6, 36.3],
  [33.5, 36.55],
  [33.62, 36.08],
];

/** Crimea, from the Perekop isthmus to the Kerch Strait. */
const CRIMEA: Poly = [
  [45.95, 32.4],
  [46.0, 33.4],
  [46.2, 33.6],
  [46.2, 33.9],
  [46.05, 34.7],
  [45.35, 35.6],
  [45.6, 36.7],
  [45.2, 36.7],
  [44.3, 34.0],
  [44.4, 33.2],
  [45.3, 32.4],
];

interface Circle {
  name: string;
  lat: number;
  lon: number;
  km: number;
}

/** Palestinian Authority towns (Area A). Kept tight, so Jerusalem's Har Homa and Gilo, Kiryat Arba and Ariel stay outside. */
export const PA_TOWNS: Circle[] = [
  { name: 'Bethlehem', lat: 31.7044, lon: 35.2077, km: 2.0 },
  { name: 'Beit Jala', lat: 31.7155, lon: 35.1875, km: 1.2 },
  { name: 'Beit Sahour', lat: 31.6997, lon: 35.2264, km: 1.3 },
  { name: 'Ramallah', lat: 31.9038, lon: 35.2034, km: 2.5 },
  { name: 'Jericho', lat: 31.8569, lon: 35.46, km: 3.0 },
  { name: 'Hebron', lat: 31.535, lon: 35.09, km: 1.8 },
  { name: 'Nablus', lat: 32.2211, lon: 35.2544, km: 3.0 },
  { name: 'Jenin', lat: 32.4597, lon: 35.3009, km: 2.5 },
  { name: 'Tulkarm', lat: 32.3104, lon: 35.0286, km: 2.0 },
  { name: 'Qalqilya', lat: 32.1896, lon: 34.9706, km: 1.8 },
  { name: 'Tubas', lat: 32.3209, lon: 35.3699, km: 1.5 },
  { name: 'Salfit', lat: 32.0833, lon: 35.1806, km: 1.5 },
];

/** Other parts of Ukraine occupied by Russia (around these cities). */
const OCCUPIED_UKRAINE: Circle[] = [
  { name: 'Donetsk', lat: 48.015, lon: 37.8, km: 35 },
  { name: 'Horlivka', lat: 48.3, lon: 38.05, km: 20 },
  { name: 'Luhansk', lat: 48.57, lon: 39.33, km: 40 },
  { name: 'Mariupol', lat: 47.1, lon: 37.55, km: 25 },
  { name: 'Berdiansk', lat: 46.76, lon: 36.79, km: 20 },
  { name: 'Melitopol', lat: 46.85, lon: 35.37, km: 30 },
  { name: 'Henichesk', lat: 46.17, lon: 34.82, km: 20 },
  { name: 'Nova Kakhovka', lat: 46.75, lon: 33.35, km: 15 },
];

const CHERNOBYL = { lat: 51.389, lon: 30.099, km: 30 };

/** Countries an Israeli passport can't enter and Israeli law forbids visiting; no border with Israel is open. */
export const NO_ISRAELI_ENTRY: ReadonlySet<string> = new Set(['LB', 'SY', 'IR', 'IQ', 'YE']);
/** Closed to visitors as a whole. */
const CLOSED_COUNTRIES: ReadonlySet<string> = new Set(['KP']);
/**
 * Hard to enter or to cross for a traveller from Europe or Israel (visas, closed land borders,
 * war): never a stop, a sight or a detour on the way — only when the trip itself starts, ends or
 * has a destination there. Vienna → Vilnius goes through Kraków and Warsaw, never Grodno (Belarus).
 */
export const HARD_ENTRY: ReadonlySet<string> = new Set(['BY', 'RU', 'AF', 'TM', 'ER', 'SD', 'SS', 'LY', 'SO']);

/** Ray casting: is the point inside the polygon? */
export function inPolygon(lat: number, lon: number, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const near = (loc: Location, c: { lat: number; lon: number; km: number }) => haversineKm(loc, { locLat: c.lat, locLon: c.lon } as Location) <= c.km;

/** The country of a point: the code the source gave, else Lebanon / Syria from the map (near Israel). */
export function countryAt(loc: Location, country = ''): string {
  const cc = country.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(cc)) return cc;
  if (inPolygon(loc.locLat, loc.locLon, LEBANON)) return 'LB';
  if (inPolygon(loc.locLat, loc.locLon, SYRIA_NEAR_ISRAEL)) return 'SY';
  return '';
}

/** What is special about this spot, if anything (closed, or worth a warning). */
export function areaStatus(loc: Location, country = ''): AreaStatus | null {
  const { locLat: lat, locLon: lon } = loc;
  if (inPolygon(lat, lon, GAZA)) return { id: 'gaza', level: 'closed' };
  if (near(loc, CHERNOBYL)) return { id: 'chernobyl', level: 'closed' };
  // A Palestinian town is a Palestinian town whatever country code a source gave it.
  if (PA_TOWNS.some((t) => near(loc, t))) return { id: 'paArea', level: 'warn' };
  if (inPolygon(lat, lon, CRIMEA)) return { id: 'crimea', level: 'warn' };
  if (OCCUPIED_UKRAINE.some((t) => near(loc, t))) return { id: 'occupiedUkraine', level: 'warn' };
  // The map before the code: a sight in southern Lebanon is in Lebanon even when a source says "IL".
  const mapped = inPolygon(lat, lon, LEBANON) ? 'LB' : inPolygon(lat, lon, SYRIA_NEAR_ISRAEL) ? 'SY' : '';
  const cc = mapped || countryAt(loc, country);
  if (CLOSED_COUNTRIES.has(cc)) return { id: 'northKorea', level: 'closed', country: cc };
  if (cc === 'UA') return { id: 'ukraine', level: 'warn', country: cc };
  if (NO_ISRAELI_ENTRY.has(cc)) return { id: 'noIsraeliEntry', level: 'warn', country: cc };
  return null;
}

/** Name of the PA town a spot is in (for the warning), if any. */
export function paTownAt(loc: Location): string | undefined {
  return PA_TOWNS.find((t) => near(loc, t))?.name;
}

/** The countries the traveller chose to start and end in: the only ones Israelis can't enter that the trip may use. */
export interface TripArea {
  countries: ReadonlySet<string>;
}

export function tripArea(points: Array<{ location: Location; country?: string }>): TripArea {
  return { countries: new Set(points.map((p) => countryAt(p.location, p.country ?? '')).filter(Boolean)) };
}

/**
 * May the planner use this spot (a stop, a sight, an event, a restaurant)? Never a closed area;
 * a country Israelis can't enter, or one that is hard to enter (HARD_ENTRY), only when the
 * traveller's own trip starts, ends or has a destination there (Beirut → Byblos yes; Metula → a
 * castle across the border in Lebanon no; Warsaw → Vilnius never through Grodno).
 */
export function allowedSpot(loc: Location, country: string | undefined, trip: TripArea): boolean {
  const cc = countryAt(loc, country ?? '');
  if (HARD_ENTRY.has(cc) && !trip.countries.has(cc)) return false;
  const s = areaStatus(loc, country ?? '');
  if (!s) return true;
  if (s.level === 'closed') return false;
  if (s.id === 'noIsraeliEntry') return trip.countries.has(s.country!);
  return true;
}

/** One warning on the trip: which area, on which days, at which places. */
export interface AreaWarning {
  id: AreaId;
  country?: string;
  days: number[];
  places: string[];
}

/** Collects the warnings for the places a trip visits (in day order, each place once). */
export class WarningCollector {
  private byId = new Map<string, AreaWarning>();

  add(day: number, loc: Location, country: string | undefined, name: string): void {
    const s = areaStatus(loc, country ?? '');
    if (!s || s.level !== 'warn') return;
    const key = `${s.id}:${s.country ?? ''}`;
    const w = this.byId.get(key) ?? { id: s.id, country: s.country, days: [], places: [] };
    if (!w.days.includes(day)) w.days.push(day);
    const label = s.id === 'paArea' ? paTownAt(loc) ?? name : name;
    if (label && !w.places.includes(label) && w.places.length < 6) w.places.push(label);
    this.byId.set(key, w);
  }

  /** As trip notes: "area:{json}" (read by the trip screen). */
  notes(): string[] {
    return [...this.byId.values()].map((w) => `area:${JSON.stringify(w)}`);
  }
}

export function parseAreaNote(note: string): AreaWarning | null {
  if (!note.startsWith('area:')) return null;
  try {
    const w = JSON.parse(note.slice(5)) as AreaWarning;
    return w && typeof w.id === 'string' && Array.isArray(w.days) ? w : null;
  } catch {
    return null;
  }
}
