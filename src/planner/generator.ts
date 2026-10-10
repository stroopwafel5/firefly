import type { Lang } from '../i18n/localized';
import {
  Attraction,
  DayPlan,
  Event,
  EventType,
  FunFact,
  Hotel,
  KidText,
  Location,
  ModeOfTravel,
  Restaurant,
  Trip,
  VERIFIABLE_NEEDS,
  isDisability,
  AI_IMAGE,
  PlacePhoto,
  isoDay,
  pacingFor,
  popularityOf,
  supportsAll,
} from '../models';
import { ScoreParts, isSuitable, scoreAttraction, scoreParts } from './classify';
import { haversineKm, interpolate } from './geo';
import { Candidate, FixedItem, MealOption, Point, TraceEntry, scheduleDay } from './scheduler';
import { fromMinutes, toMinutes } from './time';
import {
  CITY_RADIUS_KM,
  LANDMARK_RADIUS_KM,
  MIN_LEG_KM,
  Niche,
  Place,
  TOP_RATING,
  chooseNextStop,
  cityExhausted,
  greedyOrder,
  legsNeeded,
  maxLegKm,
  overStay,
  plannable,
  rankOf,
} from './route';
import { TravelTable } from './travel';

/**
 * Builds a whole trip. All network access goes through `PlannerProviders`, so the same code
 * runs in the app (providers call our Cloud Functions) and in tests (fake providers).
 * The rules are explained for testers in HOW_TO_TEST.md → "How Firefly builds a trip".
 */

export const MAX_TRIP_DAYS = 30;
/** Events are offered on a day if they are this close to the day's base town. */
export const EVENT_RADIUS_KM = 40;
/** Attractions asked for per city (Tripadvisor + Wikidata together). */
export const ATTRACTIONS_PER_CITY = 60;
/** Restaurants to fetch per day spent in a base town (two meals a day, plus choice). */
export const RESTAURANTS_PER_DAY = 4;
/** Attractions offered to the day scheduler, in greedy order. */
export const CANDIDATES_PER_DAY = 14;
/** Drop-in events rank like a 9.0 attraction (local events are the point of Firefly). */
const EVENT_RANK = 9;
/** Restaurants offered to the day scheduler (the ones closest to where the day goes). */
export const MEAL_OPTIONS_PER_DAY = 8;
/** Events whose published hours span more than this are treated as "drop in any time". */
const FIXED_EVENT_MAX_MINUTES = 4 * 60;
const EVENT_VISIT_MINUTES = 120;

export type PlannerStep = 'geocode' | 'attractions' | 'events' | 'food' | 'routes' | 'kids';

export class PlannerError extends Error {
  constructor(
    public code: 'city' | 'dates' | 'tooLong' | 'travellers' | 'nothingFound' | 'noAccessible',
    public params: Record<string, string | number> = {},
  ) {
    super(code);
  }
}

export interface GeoResult {
  location: Location;
  name: string;
  country: string;
}

export interface MatrixEntry {
  from: string;
  to: string;
  minutes: number;
  meters: number;
}

export interface PlannerProviders {
  geocode(query: string, lang: Lang): Promise<GeoResult | null>;
  /** Road route between two points as a list of points, or null. */
  route(a: Location, b: Location): Promise<Location[] | null>;
  placeName(loc: Location, lang: Lang): Promise<string>;
  /**
   * `want`: how many places the planner would like (the server searches wider for more).
   * `needs`: accessibility needs to check each place against (only when the traveller chose them).
   */
  attractionsNear(loc: Location, lang: Lang, radiusKm: number, want?: number, needs?: string[], opts?: { landmarks?: boolean }): Promise<Attraction[]>;
  restaurantsNear(loc: Location, lang: Lang, want?: number): Promise<Restaurant[]>;
  hotelsNear(loc: Location, lang: Lang, stay: { checkIn: Date; checkOut: Date; adults: number; kids: number }): Promise<Hotel[]>;
  eventsNear(loc: Location, from: Date, to: Date, lang: Lang, radiusKm: number): Promise<Event[]>;
  /** `departure`: when the day starts (public-transport timetables depend on day and hour). */
  travelMatrix(points: Point[], mode: ModeOfTravel, departure?: Date): Promise<MatrixEntry[]>;
  kidContent?(a: Attraction, lang: Lang): Promise<{ kidText?: KidText; funFact?: FunFact }>;
  /** Notes about the sources while planning (e.g. "tripadvisorBusy"), shown on the plan. */
  sourceNotes?(): string[];
}

/** What the generator knew when it planned one day (printed by scripts/explainTrip.ts). */
export interface DayExplain {
  day: number;
  date: Date;
  anchor: Location;
  anchorName: string;
  /** Why the trip is where it is today (stayed, moved on, last day…). */
  placeReason: string;
  /** Where the day starts: the start city on day 1, otherwise last night's hotel. */
  base: { id: string; name: string };
  mustSee: Attraction[];
  /** The attractions offered to the scheduler, in greedy order (best first). */
  offered: Array<{ attraction: Attraction; parts: ScoreParts }>;
  /** Unused attractions in this town that ranked lower and were not offered today. */
  notOffered: number;
  events: Array<{ event: Event; timing: 'fixed' | 'dropIn'; start: number; end: number; score?: number }>;
  restaurants: Restaurant[];
  restaurantsRepeat: boolean;
  hotel: Hotel | null;
  /** Legs with real travel times from the routing API (others are estimates). */
  routedLegs: number;
}

/** Optional hooks that let testers watch every decision. */
export interface PlannerDebug {
  onDay?(d: DayExplain): void;
  trace?(day: number, t: TraceEntry): void;
}

export interface TripRequest {
  name?: string;
  description?: string;
  startingPoint: string;
  endingPoint: string;
  numAdults: number;
  numKids: number;
  types: EventType[];
  startDate: Date;
  endDate: Date;
  withEvents: boolean;
  kidFriendly: boolean;
  mode: ModeOfTravel;
  dayStart: number;
  dayEnd: number;
  mustSee: Attraction[];
  mustDo: Event[];
  lang: Lang;
  ownerId: string;
  people: string[];
  /**
   * Accessibility needs of someone in the group (see models/Accessibility.ts). Empty = the plan
   * ignores accessibility entirely. Each need is matched on its own.
   */
  accessNeeds?: string[];
  /** Leave out places not confirmed for every verifiable need chosen. */
  accessStrict?: boolean;
}

export function daysBetween(a: Date, b: Date): number {
  const d = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((d(b) - d(a)) / 86_400_000) + 1;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function validateRequest(req: TripRequest): void {
  if (req.numAdults < 1) throw new PlannerError('travellers');
  const n = daysBetween(req.startDate, req.endDate);
  if (n < 1) throw new PlannerError('dates');
  if (n > MAX_TRIP_DAYS) throw new PlannerError('tooLong', { n: MAX_TRIP_DAYS });
}

/** Runs async work with at most `limit` in flight, keeping order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

const gridKey = (l: Location) => `${Math.round(l.locLat * 20)}:${Math.round(l.locLon * 20)}`; // ~5 km cells

/** Consecutive nights in the same cell → one stay (indexes of first and last night). */
export function groupStays(nightBases: Location[], cell: (l: Location) => string): Array<{ first: number; last: number }> {
  const stays: Array<{ first: number; last: number }> = [];
  nightBases.forEach((b, i) => {
    const prev = stays[stays.length - 1];
    if (prev && cell(nightBases[prev.first]) === cell(b)) prev.last = i;
    else stays.push({ first: i, last: i });
  });
  return stays;
}

/** The best-rated hotel; between equally rated ones (within 0.1★), the cheaper per night. */
export function pickHotel(list: Hotel[]): Hotel | null {
  const sorted = [...list].sort((x, y) => {
    const dr = (y.rating ?? 0) - (x.rating ?? 0);
    if (Math.abs(dr) > 0.1) return dr;
    return (x.price ?? Infinity) - (y.price ?? Infinity) || dr;
  });
  return sorted[0] ?? null;
}

/** How an event fits into a day: at a fixed time, or as a drop-in within its opening window. */
export function eventTiming(
  e: Event,
  dayStart: number,
  dayEnd: number,
): { fixed: { start: number; end: number } } | { window: { start: number; end: number }; duration: number } {
  if (e.startTime && e.endTime) {
    const start = toMinutes(e.startTime);
    let end = toMinutes(e.endTime);
    if (end <= start) end += 1440;
    if (end - start <= FIXED_EVENT_MAX_MINUTES) return { fixed: { start, end } };
    return { window: { start, end }, duration: Math.min(EVENT_VISIT_MINUTES, end - start) };
  }
  if (e.startTime) {
    const start = toMinutes(e.startTime);
    return { fixed: { start, end: start + EVENT_VISIT_MINUTES } };
  }
  return { window: { start: dayStart, end: dayEnd }, duration: 90 };
}

export async function generateTrip(
  req: TripRequest,
  p: PlannerProviders,
  onProgress?: (step: PlannerStep) => void,
  debug?: PlannerDebug,
): Promise<Trip> {
  validateRequest(req);
  const { lang } = req;
  const familyTrip = req.numKids > 0;
  // Accessibility is only considered when the traveller chose needs, and each need on its own:
  // the verifiable ones (blind, hearing, autism, physical) are checked place by place; all of
  // them set the pace (fewer places a day, a quiet break after each).
  const accessNeeds = (req.accessNeeds ?? []).filter(isDisability);
  const verifyNeeds = accessNeeds.filter((n) => VERIFIABLE_NEEDS.includes(n));
  const strict = !!req.accessStrict && verifyNeeds.length > 0;
  const pace = pacingFor(accessNeeds);
  const niche: Niche = { types: req.types, familyTrip, needs: verifyNeeds };
  const scoreOf = (a: Attraction) => scoreAttraction(a, req.types, familyTrip);
  const visitMinutes = (a: Attraction) => (pace.maxVisitMinutes ? Math.min(a.suggestedMinutes, pace.maxVisitMinutes) : a.suggestedMinutes);
  const numDays = daysBetween(req.startDate, req.endDate);
  const legKm = maxLegKm(req.mode);
  const dayDate = (i: number) => addDays(req.startDate, i);

  /* 1. Where does the trip start and end? */
  onProgress?.('geocode');
  const start = await p.geocode(req.startingPoint, lang);
  if (!start) throw new PlannerError('city', { city: req.startingPoint });
  const sameCity = !req.endingPoint.trim() || req.endingPoint.trim().toLowerCase() === req.startingPoint.trim().toLowerCase();
  const end = sameCity ? start : await p.geocode(req.endingPoint, lang);
  if (!end) throw new PlannerError('city', { city: req.endingPoint });
  const oneWay = haversineKm(start.location, end.location) >= 30;
  const startPlace: Place = { id: 'start', name: start.name, country: start.country, location: start.location, population: 0, kind: 'start' };
  const endPlace: Place = oneWay ? { id: 'end', name: end.name, country: end.country, location: end.location, population: 0, kind: 'end' } : startPlace;

  /* 2. The route, day by day, with the greedy choice of attractions (route.ts). */
  onProgress?.('attractions');
  const pools = new Map<string, Attraction[]>();
  const poolFor = async (place: Place): Promise<Attraction[]> => {
    const known = pools.get(place.id);
    if (known) return known;
    const landmark = place.kind === 'landmark';
    const list = await p
      .attractionsNear(place.location, lang, landmark ? LANDMARK_RADIUS_KM : CITY_RADIUS_KM, landmark ? 30 : ATTRACTIONS_PER_CITY, verifyNeeds.length ? verifyNeeds : undefined)
      .catch(() => [] as Attraction[]);
    const ok = list.filter((a) => plannable(a, req.types) && isSuitable(a, familyTrip, req.kidFriendly));
    const pool = strict ? ok.filter((x) => supportsAll(x.disabilityCompatible, verifyNeeds)) : ok;
    pools.set(place.id, pool);
    return pool;
  };

  /** A world-class nature or heritage site on the way (Plitvice between Zagreb and Zadar). */
  const landmarkOnTheWay = async (from: Place, to: Place, daysAfterToday: number): Promise<Place | null> => {
    const leg = haversineKm(from.location, to.location);
    if (leg < 100) return null;
    const mid = interpolate(from.location, to.location, 0.5);
    const found = await p.attractionsNear(mid, lang, Math.min(60, leg / 2), 10, undefined, { landmarks: true }).catch(() => [] as Attraction[]);
    const toEnd = haversineKm(from.location, endPlace.location);
    for (const a of [...found].sort((x, y) => popularityOf(y) - popularityOf(x))) {
      const id = `landmark:${a.id}`;
      if (visitedPlaces.has(id) || popularityOf(a) < TOP_RATING) continue;
      if (haversineKm(a.location, from.location) < 40 || haversineKm(a.location, to.location) < 40) continue;
      if (haversineKm(from.location, a.location) > legKm) continue;
      // On the way between the two stops (no big detour)…
      if (haversineKm(from.location, a.location) + haversineKm(a.location, to.location) > 1.5 * leg + 60) continue;
      if (legsNeeded(a.location, endPlace.location, legKm) > daysAfterToday) continue;
      // …and, on a one-way trip, closer to the destination than where we are now.
      if (oneWay && haversineKm(a.location, endPlace.location) >= toEnd) continue;
      return { id, name: a.name, country: a.country, location: a.location, population: 0, kind: 'landmark' };
    }
    return null;
  };

  const dayPlace: Place[] = [];
  const dayReason: string[] = [];
  const visitedPlaces = new Set<string>([startPlace.id]);
  const plannedRough = new Set<string>();
  let place = startPlace;
  let daysHere = 0;
  let lastPoint = start.location;
  for (let i = 0; i < numDays; i++) {
    let reason = i === 0 ? 'start' : 'stay';
    if (i > 0) {
      const daysAfterToday = numDays - i - 1;
      const atTarget = haversineKm(place.location, endPlace.location) < MIN_LEG_KM;
      let move = false;
      if (i === numDays - 1 && !atTarget) [move, reason] = [true, 'lastDay'];
      else if (!atTarget && legsNeeded(place.location, endPlace.location, legKm) > daysAfterToday) [move, reason] = [true, 'onSchedule'];
      else if (overStay(place, daysHere)) [move, reason] = [true, 'fourDays'];
      else if (cityExhausted((await poolFor(place)).filter((a) => !plannedRough.has(a.id)), niche)) [move, reason] = [true, 'seenTheBest'];
      if (move) {
        let next = chooseNextStop({ current: place, target: endPlace, oneWay, daysAfter: daysAfterToday, visited: visitedPlaces, maxLegKm: legKm });
        // A landmark on the way gets its own day — also on the way to the destination, as long as
        // there is still a day left to get there afterwards.
        if (next.id !== place.id && (next.id !== endPlace.id || daysAfterToday >= 1)) {
          const stop = await landmarkOnTheWay(place, next, daysAfterToday);
          if (stop) [next, reason] = [stop, 'landmark'];
        }
        if (next.id === place.id) reason = 'stay';
        else {
          place = next;
          daysHere = 0;
          visitedPlaces.add(next.id);
        }
      }
    }
    dayPlace.push(place);
    dayReason.push(reason);
    daysHere++;
    // A quick draft of the day (straight-line travel times) decides what is "seen" here, so the
    // next day knows whether the city still has something worth staying for.
    const pool = (await poolFor(place)).filter((a) => !plannedRough.has(a.id));
    const ordered = greedyOrder(pool, lastPoint, niche, CANDIDATES_PER_DAY);
    const draft = scheduleDay({
      date: dayDate(i),
      dayStart: req.dayStart,
      dayEnd: req.dayEnd,
      base: { id: `night:${i}`, location: i === 0 ? start.location : dayPlace[i - 1].location },
      candidates: ordered.map((a) => ({ id: a.id, kind: 'attraction' as const, location: a.location, duration: visitMinutes(a), weeklyHours: a.weeklyHours, score: scoreOf(a), rank: rankOf(a, niche) })),
      fixed: [],
      restaurants: [],
      travel: new TravelTable(req.mode),
      maxAttractions: pace.maxPerDay,
      breakMinutes: pace.breakMinutes,
    });
    draft.placed.forEach((id) => plannedRough.add(id));
    const last = ordered.find((a) => a.id === draft.placed[draft.placed.length - 1]);
    lastPoint = last ? last.location : place.location;
  }
  if (strict && !req.mustSee.length && [...pools.values()].every((l) => !l.length)) throw new PlannerError('noAccessible');

  /** Each place's photo: its most popular sight that has a real photograph (Prague → Prague Castle). */
  const placePhotos = new Map<string, PlacePhoto | null>();
  const photoOf = (pl: Place): PlacePhoto | null => {
    if (placePhotos.has(pl.id)) return placePhotos.get(pl.id)!;
    let found: PlacePhoto | null = null;
    for (const a of [...(pools.get(pl.id) ?? [])].sort((x, y) => popularityOf(y) - popularityOf(x))) {
      const url = a.photo_urls[0];
      const src = a.photoSources[0];
      if (!url || AI_IMAGE.test(url) || AI_IMAGE.test(src?.sourcePage ?? '')) continue;
      found = { url, sourcePage: src?.sourcePage ?? a.link, credit: src?.credit ?? '', title: a.name };
      break;
    }
    placePhotos.set(pl.id, found);
    return found;
  };

  const anchors = dayPlace.map((pl) => pl.location);
  const anchorNames = dayPlace.map((pl) => pl.name);
  const uniquePlaces = [...new Map(dayPlace.map((pl) => [pl.id, pl])).values()];

  /* 3. Real local events during the trip. */
  onProgress?.('events');
  const eventPool = new Map<string, Event>();
  if (req.withEvents) {
    await mapLimit(uniquePlaces, 3, async (pl) => {
      const list = await p.eventsNear(pl.location, req.startDate, req.endDate, lang, EVENT_RADIUS_KM).catch(() => []);
      for (const e of list) {
        if ((familyTrip || req.kidFriendly) && !e.isKidFriendly) continue;
        eventPool.set(e.id, e);
      }
    });
  }
  for (const e of req.mustDo) eventPool.set(e.id, e);

  /* 4. Food in every place, and one hotel per stay (consecutive nights in the same place). */
  onProgress?.('food');
  const restaurantPools = new Map<string, Restaurant[]>();
  await mapLimit(uniquePlaces, 2, async (pl) => {
    const days = dayPlace.filter((d) => d.id === pl.id).length;
    const want = Math.min(30, Math.max(10, days * RESTAURANTS_PER_DAY));
    restaurantPools.set(pl.id, await p.restaurantsNear(pl.location, lang, want).catch(() => []));
  });
  const hotels: Array<Hotel | null> = new Array(numDays).fill(null); // the last night is at home
  const nights = dayPlace.slice(0, Math.max(0, numDays - 1));
  await mapLimit(groupStays(anchors.slice(0, nights.length), (l) => dayPlace[anchors.indexOf(l)]?.id ?? gridKey(l)), 3, async (st) => {
    const list = await p
      .hotelsNear(anchors[st.first], lang, {
        checkIn: dayDate(st.first),
        checkOut: dayDate(st.last + 1),
        adults: req.numAdults,
        kids: req.numKids,
      })
      .catch(() => []);
    const best = pickHotel(list);
    for (let n = st.first; n <= st.last; n++) hotels[n] = best;
  });

  /* 5. Must-see places go to the day spent closest to them. */
  const mustSeeByDay = new Map<number, Attraction[]>();
  for (const m of req.mustSee) {
    let bestDay = 0;
    anchors.forEach((a, i) => {
      if (haversineKm(a, m.location) < haversineKm(anchors[bestDay], m.location)) bestDay = i;
    });
    mustSeeByDay.set(bestDay, [...(mustSeeByDay.get(bestDay) ?? []), m]);
  }

  /* 6. Each day's timetable with real travel times (so nothing repeats). */
  onProgress?.('routes');
  const usedAttractions = new Set<string>();
  const usedEvents = new Set<string>();
  const usedRestaurants = new Set<string>();
  const itinerary: DayPlan[] = [];

  for (let i = 0; i < numDays; i++) {
    const date = dayDate(i);
    const anchor = anchors[i];
    const pl = dayPlace[i];
    const base: Point & { name: string } =
      i === 0
        ? { id: 'start', name: start.name, location: start.location }
        : hotels[i - 1]
          ? { id: `hotel:${hotels[i - 1]!.id}`, name: hotels[i - 1]!.name, location: hotels[i - 1]!.location }
          : { id: `anchor:${i - 1}`, name: anchorNames[i - 1], location: anchors[i - 1] };

    const mustSee = mustSeeByDay.get(i) ?? [];
    const pool = (pools.get(pl.id) ?? []).filter((a) => !usedAttractions.has(a.id) && !mustSee.some((m) => m.id === a.id));
    const ranked = greedyOrder(pool, base.location, niche, CANDIDATES_PER_DAY);

    const candidates: Candidate[] = [
      ...mustSee.map((a) => ({
        id: a.id,
        kind: 'attraction' as const,
        location: a.location,
        duration: visitMinutes(a),
        weeklyHours: a.weeklyHours,
        score: scoreOf(a),
        rank: rankOf(a, niche),
        mustInclude: true,
      })),
      ...ranked.map((a) => ({
        id: a.id,
        kind: 'attraction' as const,
        location: a.location,
        duration: visitMinutes(a),
        weeklyHours: a.weeklyHours,
        score: scoreOf(a),
        rank: rankOf(a, niche),
      })),
    ];

    const fixed: FixedItem[] = [];
    const todaysEvents: Event[] = [];
    const eventInfo: DayExplain['events'] = [];
    for (const e of eventPool.values()) {
      if (usedEvents.has(e.id) || !e.occursOn(date)) continue;
      const mustDo = req.mustDo.some((m) => m.id === e.id);
      if (!mustDo && haversineKm(anchor, e.location) > EVENT_RADIUS_KM) continue;
      const timing = eventTiming(e, req.dayStart, req.dayEnd);
      const typeMatches = e.types.filter((t) => req.types.includes(t)).length;
      todaysEvents.push(e);
      if ('fixed' in timing) {
        fixed.push({ id: e.id, location: e.location, ...timing.fixed });
        eventInfo.push({ event: e, timing: 'fixed', ...timing.fixed });
      } else {
        eventInfo.push({ event: e, timing: 'dropIn', ...timing.window, score: 75 + typeMatches * 12 });
        candidates.push({
          id: e.id,
          kind: 'event',
          location: e.location,
          duration: timing.duration,
          window: timing.window,
          score: 75 + typeMatches * 12,
          rank: [EVENT_RANK, 0, Math.min(2, typeMatches)],
          mustInclude: mustDo,
        });
      }
    }

    // Rough draft of the day (straight-line estimates, no network) to see which area it covers,
    // so the restaurants offered are the ones near where the family will actually be.
    const rough = scheduleDay({
      date,
      dayStart: req.dayStart,
      dayEnd: req.dayEnd,
      base,
      candidates,
      fixed,
      restaurants: [],
      travel: new TravelTable(req.mode),
      maxAttractions: pace.maxPerDay,
      breakMinutes: pace.breakMinutes,
    });
    const where = [base.location, ...rough.placed.map((id) => (candidates.find((c) => c.id === id) ?? fixed.find((f) => f.id === id))!.location)];
    const nearDay = (r: Restaurant) => Math.min(...where.map((w) => haversineKm(w, r.location)));
    const townRestaurants = restaurantPools.get(pl.id) ?? [];
    const fresh = townRestaurants.filter((r) => !usedRestaurants.has(r.id));
    // Long stays can exhaust a town's list: then repeating a restaurant beats skipping a meal.
    const allowRepeats = fresh.length < 3;
    const restaurants = (allowRepeats ? townRestaurants : fresh)
      .map((r) => ({ r, km: nearDay(r) }))
      .sort((x, y) => x.km - y.km)
      .slice(0, MEAL_OPTIONS_PER_DAY)
      .map((x) => x.r);
    const meals: MealOption[] = restaurants.map((r) => ({ id: r.id, location: r.location, weeklyHours: r.weeklyHours }));

    // Travel times between every point of the day (one Routes API matrix call).
    const hotel = hotels[i];
    const points: Point[] = [
      base,
      ...candidates.map((c) => ({ id: c.id, location: c.location })),
      ...fixed.map((f) => ({ id: f.id, location: f.location })),
      ...meals.map((m) => ({ id: m.id, location: m.location })),
      ...(hotel ? [{ id: `hotel:${hotel.id}`, location: hotel.location }] : []),
    ];
    const travel = new TravelTable(req.mode);
    const departure = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, req.dayStart);
    const matrix = await p.travelMatrix(points, req.mode, departure).catch(() => [] as MatrixEntry[]);
    for (const m of matrix) travel.set(m.from, m.to, m.minutes, m.meters);

    debug?.onDay?.({
      day: i + 1,
      date,
      anchor,
      anchorName: anchorNames[i] || base.name,
      placeReason: dayReason[i],
      base: { id: base.id, name: base.name },
      mustSee,
      offered: ranked.map((a) => ({ attraction: a, parts: scoreParts(a, req.types, familyTrip) })),
      notOffered: Math.max(0, pool.length - ranked.length),
      events: eventInfo,
      restaurants,
      restaurantsRepeat: allowRepeats,
      hotel,
      routedLegs: matrix.length,
    });

    const result = scheduleDay({
      date,
      dayStart: req.dayStart,
      dayEnd: req.dayEnd,
      base,
      candidates,
      fixed,
      restaurants: meals,
      travel,
      maxAttractions: pace.maxPerDay,
      breakMinutes: pace.breakMinutes,
      usedRestaurants: allowRepeats ? new Set<string>() : usedRestaurants,
      trace: debug?.trace ? (t) => debug.trace!(i + 1, t) : undefined,
    });

    result.placed.forEach((id) => {
      usedAttractions.add(id);
      usedEvents.add(id);
    });
    result.restaurants.forEach((id) => usedRestaurants.add(id));

    const placed = new Set(result.placed);
    const dayAttractions = [...mustSee, ...pool].filter((a) => placed.has(a.id));
    const dayEvents = todaysEvents.filter((e) => placed.has(e.id));
    const dayRestaurants = restaurants.filter((r) => result.restaurants.includes(r.id));

    itinerary.push(
      new DayPlan(
        i + 1,
        fromMinutes(req.dayStart),
        fromMinutes(req.dayEnd),
        dayAttractions,
        dayEvents,
        dayRestaurants,
        hotel,
        date,
        result.slots,
        anchor,
        anchorNames[i] || base.name,
        [],
        [],
        travel.toJSON(),
        { id: base.id, name: base.name, location: base.location },
        pace.breakMinutes,
        photoOf(pl),
      ),
    );
  }

  if (!itinerary.some((d) => d.attractions.length || d.events.length)) throw new PlannerError('nothingFound');

  /* 7. The kids' version: simple descriptions and a sourced fun fact per place. */
  if (familyTrip && p.kidContent) {
    onProgress?.('kids');
    for (const day of itinerary) {
      const content = await mapLimit(day.attractions, 3, (a) => p.kidContent!(a, lang).catch(() => ({})));
      day.kidTexts = content.map((c) => (c as { kidText?: KidText }).kidText).filter((x): x is KidText => !!x);
      day.funFacts = content.map((c) => (c as { funFact?: FunFact }).funFact).filter((x): x is FunFact => !!x);
    }
  }

  const tripName =
    req.name?.trim() ||
    (sameCity ? `${start.name} · ${isoDay(req.startDate)}` : `${start.name} → ${end.name} · ${isoDay(req.startDate)}`);

  return new Trip(
    Date.now(),
    tripName,
    req.description ?? '',
    req.people,
    req.numAdults,
    req.numKids,
    req.types,
    start.name,
    end.name,
    start.location,
    end.location,
    req.startDate,
    req.endDate,
    req.mustSee,
    req.mustDo,
    itinerary,
    req.mode,
    req.withEvents,
    req.kidFriendly,
    req.dayStart,
    req.dayEnd,
    req.ownerId,
    accessNeeds,
    strict,
    p.sourceNotes?.() ?? [],
  );
}
