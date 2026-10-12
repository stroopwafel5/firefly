import type { EventJSON } from './types';

/** Pure planning helpers for the weekly fallback (no Firebase imports, unit-tested). */

export const ISRAEL_TARGET = 50;
export const WORLD_TARGET = 100;

/**
 * The weekly list by region: how many events each keeps and the cities searched for them.
 * Europe leans on the Netherlands, Belgium, Germany, Czechia and Poland (Firefly's main markets);
 * South Africa leads the Africa list. "world" is everywhere else (the Americas, Oceania, Korea,
 * the Gulf, the Caucasus).
 */
export type Region = 'israel' | 'europe' | 'japan' | 'seasia' | 'africa' | 'world';

export const REGION_TARGETS: Record<Region, number> = { israel: ISRAEL_TARGET, europe: 500, japan: 100, seasia: 100, africa: 100, world: WORLD_TARGET };

export const EUROPE_CITIES = [
  // Netherlands
  'Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven', 'Maastricht', 'Groningen', 'Haarlem', 'Leiden', 'Delft',
  // Belgium
  'Brussels', 'Antwerp', 'Ghent', 'Bruges', 'Liège', 'Leuven', 'Mechelen',
  // Germany
  'Berlin', 'Munich', 'Hamburg', 'Cologne', 'Frankfurt', 'Dresden', 'Leipzig', 'Nuremberg', 'Stuttgart', 'Düsseldorf', 'Heidelberg', 'Bremen', 'Hanover',
  // Czechia
  'Prague', 'Brno', 'Český Krumlov', 'Ostrava', 'Olomouc', 'Karlovy Vary', 'Plzeň',
  // Poland
  'Warsaw', 'Kraków', 'Wrocław', 'Gdańsk', 'Poznań', 'Łódź', 'Toruń', 'Zakopane',
  // The rest of Europe
  'Vienna', 'Salzburg', 'Budapest', 'Bratislava', 'Paris', 'Lyon', 'Strasbourg', 'London', 'Edinburgh', 'Dublin', 'Barcelona',
  'Madrid', 'Seville', 'Rome', 'Milan', 'Florence', 'Venice', 'Lisbon', 'Porto', 'Athens', 'Thessaloniki', 'Copenhagen',
  'Stockholm', 'Oslo', 'Helsinki', 'Zurich', 'Geneva', 'Bucharest', 'Sofia', 'Plovdiv', 'Belgrade', 'Ljubljana', 'Zagreb',
  'Riga', 'Tallinn', 'Vilnius', 'Chișinău', 'Skopje', 'Valletta', 'Luxembourg',
];

export const JAPAN_CITIES = ['Tokyo', 'Yokohama', 'Osaka', 'Kyoto', 'Kobe', 'Nara', 'Nagoya', 'Sapporo', 'Fukuoka', 'Hiroshima', 'Sendai', 'Kanazawa', 'Naha, Okinawa', 'Hakone', 'Nikko'];

export const SEASIA_CITIES = [
  'Bangkok', 'Chiang Mai', 'Phuket', 'Pattaya', 'Singapore', 'Kuala Lumpur', 'George Town, Penang', 'Ubud, Bali', 'Jakarta', 'Yogyakarta',
  'Ho Chi Minh City', 'Hanoi', 'Da Nang', 'Hoi An', 'Manila', 'Cebu City', 'Phnom Penh', 'Siem Reap', 'Luang Prabang', 'Vientiane',
];

export const AFRICA_CITIES = [
  // South Africa first
  'Cape Town', 'Johannesburg', 'Pretoria', 'Durban', 'Gqeberha', 'Stellenbosch', 'Knysna',
  'Windhoek', 'Gaborone', 'Victoria Falls', 'Maputo', 'Port Louis, Mauritius', 'Nairobi', 'Mombasa', 'Zanzibar', 'Dar es Salaam',
  'Arusha', 'Kigali', 'Kampala', 'Addis Ababa', 'Accra', 'Lagos', 'Dakar', 'Marrakech', 'Casablanca', 'Cairo', 'Tunis',
];

export const OTHER_WORLD_CITIES = [
  'New York', 'Los Angeles', 'Toronto', 'Vancouver', 'Mexico City', 'Managua', 'Lima', 'Buenos Aires', 'Rio de Janeiro',
  'Sydney', 'Melbourne', 'Auckland', 'Seoul', 'Taipei', 'Hong Kong', 'Dubai', 'Istanbul', 'Tbilisi', 'Yerevan',
];

export const REGION_CITIES: Record<Region, string[]> = {
  israel: [],
  europe: EUROPE_CITIES,
  japan: JAPAN_CITIES,
  seasia: SEASIA_CITIES,
  africa: AFRICA_CITIES,
  world: OTHER_WORLD_CITIES,
};

/** How long the weekly list looks ahead: four weeks (trips are planned weeks ahead). */
export const SNAPSHOT_DAYS = 28;

/** Tomorrow and the next four weeks, with their Friday–Sunday days (weekend events come first). */
export function snapshotWindow(now = new Date()): { from: string; to: string; days: string[] } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const day = (n: number) => new Date(d.getTime() + n * 86_400_000);
  const all = Array.from({ length: SNAPSHOT_DAYS }, (_, i) => day(i + 1));
  return { from: iso(all[0]), to: iso(all[all.length - 1]), days: all.filter((x) => [5, 6, 0].includes(x.getUTCDay())).map(iso) };
}

export const ISRAEL_CITIES = [
  'Tel Aviv', 'Jerusalem', 'Haifa', "Be'er Sheva", 'Eilat', 'Netanya', 'Rishon LeZion', 'Herzliya',
  'Ashdod', 'Nazareth', 'Tiberias', "Ra'anana", 'Petah Tikva', "Modi'in", 'Akko', 'Zikhron Ya\'akov',
];

export const WORLD_CITIES = [
  // Camp countries and where Firefly's travellers go most
  'Prague', 'Budapest', 'Vienna', 'Berlin', 'Munich', 'Amsterdam', 'London', 'Edinburgh', 'Paris', 'Barcelona',
  'Rome', 'Athens', 'Lisbon', 'Warsaw', 'Bucharest', 'Belgrade', 'Chișinău', 'Skopje', 'Tbilisi', 'Yerevan',
  'Istanbul', 'Dubai', 'Tokyo', 'Sapporo', 'Seoul', 'Bangkok', 'Bali', 'Jakarta', 'Singapore', 'Sydney',
  'New York', 'Toronto', 'Mexico City', 'Buenos Aires', 'Rio de Janeiro', 'Cape Town', 'Accra', 'Lagos',
  'Nairobi', 'Managua', 'Marrakech', 'Kraków',
];

/**
 * World cities where Ticketmaster has little or nothing, so Google's listings (SerpApi) are
 * the only real source. With the free SerpApi plan they are covered in a weekly rotation.
 */
export const TM_WEAK_CITIES = [
  // Japan, South-East Asia and Africa first: Ticketmaster has (almost) nothing there.
  'Tokyo', 'Cape Town', 'Bangkok', 'Osaka', 'Johannesburg', 'Singapore', 'Kyoto', 'Durban', 'Kuala Lumpur', 'Sapporo', 'Nairobi',
  'Ubud, Bali', 'Fukuoka', 'Pretoria', 'Ho Chi Minh City', 'Hanoi', 'Accra', 'Lagos', 'Manila', 'Marrakech', 'Chiang Mai', 'Zanzibar',
  'Jakarta', 'Kigali', 'Phnom Penh', 'Cairo', 'Hiroshima', 'Windhoek',
  // Other places Ticketmaster covers poorly
  'Managua', 'Tbilisi', 'Yerevan', 'Chișinău', 'Skopje', 'Belgrade', 'Bucharest', 'Sofia', 'Istanbul', 'Buenos Aires',
  'Rio de Janeiro', 'Seoul', 'Athens', 'Budapest', 'Lisbon',
];

/**
 * Nationwide searches for the countryside and family side of things — workshops, guided nature
 * walks, heritage days, food and story-themed outings — at the organisations that run them:
 * the Israel Nature and Parks Authority, the National Trust and English Heritage. None of them
 * offers an events feed, but Google's event listings include their published events.
 */
export interface ThemedSearch {
  id: string;
  region: 'israel' | 'world';
  lang: 'he' | 'en';
  query: string;
  lat: number;
  lon: number;
  radiusKm: number;
  country: string;
  placeName: string;
}

export const THEMED_SEARCHES: ThemedSearch[] = [
  { id: 'il-parks', region: 'israel', lang: 'he', query: 'אירועים ופעילויות למשפחות ברשות הטבע והגנים', lat: 31.6, lon: 34.95, radiusKm: 260, country: 'IL', placeName: 'ישראל' },
  { id: 'il-outdoors', region: 'israel', lang: 'he', query: 'סיורים מודרכים, סדנאות ופסטיבלי אוכל בטבע למשפחות', lat: 31.6, lon: 34.95, radiusKm: 260, country: 'IL', placeName: 'ישראל' },
  { id: 'uk-national-trust', region: 'world', lang: 'en', query: 'National Trust family events', lat: 52.6, lon: -1.6, radiusKm: 450, country: 'GB', placeName: 'England' },
  { id: 'uk-english-heritage', region: 'world', lang: 'en', query: 'English Heritage family events and guided tours', lat: 52.6, lon: -1.6, radiusKm: 450, country: 'GB', placeName: 'England' },
];

/** ISO-8601 week number (1–53). */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** `n` items from `list`, a different slice every week, wrapping around. */
export function weeklyRotation<T>(list: T[], n: number, now = new Date()): T[] {
  if (!list.length || n <= 0) return [];
  const take = Math.min(n, list.length);
  const start = (isoWeek(now) * take) % list.length;
  return Array.from({ length: take }, (_, i) => list[(start + i) % list.length]);
}

/**
 * Which Google (SerpApi) searches this week's run makes, given how many the budget allows:
 * Israel first (one Hebrew search per city, in order of size), then the nationwide family /
 * countryside searches, then this week's slice of the cities Ticketmaster doesn't cover.
 * Every world city also gets Ticketmaster.
 */
export function planGoogleSearches(allowed: number, now = new Date()): { israel: string[]; themed: ThemedSearch[]; world: string[] } {
  const israel = ISRAEL_CITIES.slice(0, Math.max(0, allowed));
  const themed = THEMED_SEARCHES.slice(0, Math.max(0, allowed - israel.length));
  return { israel, themed, world: weeklyRotation(TM_WEAK_CITIES, allowed - israel.length - themed.length, now) };
}

/** Friday..Sunday of the next two weekends after `now` (dates as YYYY-MM-DD). */
export function nextTwoWeekends(now = new Date()): { from: string; to: string; days: string[] } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const toFriday = (5 - d.getUTCDay() + 7) % 7 || 7; // always the *next* Friday
  const fri1 = new Date(d.getTime() + toFriday * 86_400_000);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const add = (x: Date, n: number) => new Date(x.getTime() + n * 86_400_000);
  const days = [0, 1, 2, 7, 8, 9].map((n) => iso(add(fri1, n)));
  return { from: days[0], to: days[5], days };
}

/** Round-robin across cities so the 50 Israeli events aren't all in Tel Aviv. */
export function roundRobin(perCity: EventJSON[][], target: number, weekendDays: string[]): EventJSON[] {
  const onWeekend = (e: EventJSON) => weekendDays.some((day) => e.startDate <= day && day <= e.endDate);
  const queues = perCity.map((list) => [...list].sort((a, b) => Number(onWeekend(b)) - Number(onWeekend(a))));
  const out: EventJSON[] = [];
  const seen = new Set<string>();
  while (out.length < target && queues.some((q) => q.length)) {
    for (const q of queues) {
      while (q.length) {
        const e = q.shift()!;
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        out.push(e);
        break;
      }
      if (out.length >= target) break;
    }
  }
  return out;
}

