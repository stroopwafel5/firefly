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
  NOT_A_MEAL,
  isNotARestaurant,
} from '../models';
import { ScoreParts, hasFoodOnSite, isSuitable, scoreAttraction, scoreParts } from './classify';
import { nameSimilarity } from './kidify';
import { haversineKm, interpolate, offsetKm } from './geo';
import { Candidate, FixedItem, MealOption, Point, TraceEntry, planNightOut, scheduleDay } from './scheduler';
import { fromMinutes, toMinutes } from './time';
import {
  CITY_RADIUS_KM,
  LANDMARK_RADIUS_KM,
  MIN_LEG_KM,
  NICHE_RATING,
  Niche,
  Place,
  TOP_RATING,
  TripStyle,
  chooseNextStop,
  cityExhausted,
  greedyOrder,
  routeCandidates,
  legsNeeded,
  maxLegKm,
  overStay,
  plannable,
  rankOf,
} from './route';
import { TravelTable } from './travel';
import { WarningCollector, allowedSpot, areaStatus, tripArea } from './safety';

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
/**
 * Events are mixed in with the sights: each day gets its share of the best events around (see
 * `eventsQuota`). A chosen drop-in event (a fair, an open day) ranks with the world-famous sights,
 * so it is fitted into the day rather than left for leftover time; the other drop-in events only
 * fill time no sight can use.
 */
const CHOSEN_EVENT_RANK = 9.5;
const FILLER_EVENT_RANK = -1;
/** Drop-in events kept as fillers on a day, besides the chosen ones. */
const FILLER_EVENTS_PER_DAY = 2;
/** Timed events (a concert at 20:00) per day, besides the ones the traveller picked. */
const TIMED_EVENTS_PER_DAY = 2;
/** A sight worth planning a day around (on the 0–10 popularity scale). */
export const GOOD_SIGHT = 7.5;
/**
 * Exploring around a place whose own sights are used up, one circle at a time: every sight within
 * `allKm`, or a top sight (8.5+) within `topKm`. Each circle is searched at `points` points on a
 * ring `ringKm` from the place, `radiusKm` wide (so the next circle's search also covers the gap).
 */
export const CIRCLES: ReadonlyArray<{ allKm: number; topKm: number; ringKm: number; radiusKm: number; points: number }> = [
  { allKm: 35, topKm: 50, ringKm: 25, radiusKm: 25, points: 6 },
  { allKm: 50, topKm: 85, ringKm: 65, radiusKm: 25, points: 8 },
  { allKm: 85, topKm: 100, ringKm: 92, radiusKm: 15, points: 8 },
];
/** "Top sight" for the wider part of a circle (0–10 popularity). */
export const CIRCLE_TOP_RATING = 8.5;
/** A next stop needs at least this many well-rated (7.0+) sights to be worth a day. */
export const THIN_STOP_SIGHTS = 4;
/** A must-see place within this distance of a day's base counts as visited (a day trip). */
export const MUST_NEAR_KM = 40;
/** A destination the traveller added is visited only by a day spent within this distance of it. */
export const DEST_NEAR_KM = 15;
/** Trip note listing the traveller's destinations the days couldn't fit ("destSkipped:Venice|Bruges"). */
export const DEST_SKIPPED_NOTE = 'destSkipped:';
/** The destinations a trip couldn't fit (from its notes). */
export const skippedDestinations = (notes: readonly string[]): string[] =>
  notes.find((n) => n.startsWith(DEST_SKIPPED_NOTE))?.slice(DEST_SKIPPED_NOTE.length).split('|').filter(Boolean) ?? [];
/** Events for the scheduler to fit in today: one where there is plenty to see, up to four where there is nothing. */
export function eventsQuota(goodSightsLeft: number): number {
  return goodSightsLeft >= 6 ? 1 : goodSightsLeft >= 3 ? 2 : goodSightsLeft >= 1 ? 3 : 4;
}
/** A description worth replacing: missing, or one short line from Wikidata ("park in Tel Aviv"). */
export const needsDescription = (a: Attraction) => a.description.trim().length < 160 || (a.descriptionSource ?? a.provider) === 'wikidata';
/** Events families skip (adults only): left out of trips with children. */
export const ADULT_ONLY = /\b(18\+|21\+|adults? only|night ?club|strip(tease)?|burlesque|erotic|pub crawl|bar crawl|rave)\b|для взрослых|18\+|למבוגרים בלבד|מסיבת טכנו/i;
/** Restaurants offered to the day scheduler (the ones closest to where the day goes). */
export const MEAL_OPTIONS_PER_DAY = 8;
/** Events whose published hours span more than this are treated as "drop in any time". */
const FIXED_EVENT_MAX_MINUTES = 4 * 60;
const EVENT_VISIT_MINUTES = 120;

export type PlannerStep = 'geocode' | 'attractions' | 'events' | 'food' | 'routes' | 'details' | 'kids';

export class PlannerError extends Error {
  constructor(
    public code: 'city' | 'dates' | 'tooLong' | 'travellers' | 'nothingFound' | 'noAccessible' | 'noAttractions' | 'closedArea',
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
  attractionsNear(
    loc: Location,
    lang: Lang,
    radiusKm: number,
    want?: number,
    needs?: string[],
    /** `types`: the trip's types (Shopping, Night Clubs, Food… ask the server for those places too). */
    opts?: { landmarks?: boolean; types?: string[] },
  ): Promise<Attraction[]>;
  restaurantsNear(loc: Location, lang: Lang, want?: number): Promise<Restaurant[]>;
  hotelsNear(loc: Location, lang: Lang, stay: { checkIn: Date; checkOut: Date; adults: number; kids: number }): Promise<Hotel[]>;
  eventsNear(loc: Location, from: Date, to: Date, lang: Lang, radiusKm: number): Promise<Event[]>;
  /** `departure`: when the day starts (public-transport timetables depend on day and hour). */
  travelMatrix(points: Point[], mode: ModeOfTravel, departure?: Date): Promise<MatrixEntry[]>;
  kidContent?(a: Attraction, lang: Lang): Promise<{ kidText?: KidText; funFact?: FunFact }>;
  /** A fuller description of a planned place (its Wikipedia article's introduction), or null. */
  describe?(a: Attraction, lang: Lang): Promise<{ text: string; url: string; source: 'wikipedia' } | null>;
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

/** Questions the planner may ask the traveller while it plans (all optional). */
export interface PlannerQuestions {
  /**
   * "Only places confirmed for these needs" found no confirmed place anywhere on the route.
   * true = plan with the best places anyway (each says what is and isn't confirmed, as when the
   * option is off); false = stop with PlannerError('noAccessible').
   */
  planWithoutConfirmation?(needs: string[]): Promise<boolean>;
}

const SHARED = Symbol('sharedAttractions');
/**
 * The providers with one request per attraction search, so planning again (after the question
 * above) reuses what was already found instead of asking the server again.
 */
function sharedAttractions(p: PlannerProviders): PlannerProviders {
  if ((p as unknown as Record<symbol, unknown>)[SHARED]) return p;
  const memo = new Map<string, Promise<Attraction[]>>();
  const q = Object.create(p) as PlannerProviders;
  q.attractionsNear = (loc, lang, radiusKm, want, needs, opts) => {
    const key = JSON.stringify([loc.locLat, loc.locLon, lang, radiusKm, want ?? null, needs ?? null, opts ?? null]);
    let v = memo.get(key);
    if (!v) {
      v = p.attractionsNear(loc, lang, radiusKm, want, needs, opts);
      memo.set(key, v);
      v.catch(() => memo.delete(key));
    }
    return v;
  };
  Object.defineProperty(q, SHARED, { value: true });
  return q;
}

/** A place the traveller picked from the suggestions (no need to look the text up again). */
export interface PickedPlace {
  name: string;
  location: Location;
  country: string;
}

export interface TripRequest {
  name?: string;
  description?: string;
  startingPoint: string;
  endingPoint: string;
  /** Set when the start / end was chosen from the place suggestions (any language). */
  startPick?: PickedPlace;
  endPick?: PickedPlace;
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
  /** Towns the traveller wants the route to pass through, in any order. */
  mustStops?: PickedPlace[];
  /**
   * More destinations ("Add more destinations", under Destination): visited in this order on the
   * way from the start to the end. `pick` when chosen from the suggestions, else `text` is looked up.
   */
  destinations?: Array<{ text: string; pick?: PickedPlace }>;
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
  /** Popular places (the default) or off the beaten track (route.ts → TripStyle). */
  style?: TripStyle;
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

/** Theme parks, film parks and water parks: a day ticket is most of a day (food on site). */
const PARK_DAY =
  /theme ?park|amusement park|freizeitpark|erlebnispark|vergnügungspark|filmpark|film park|movie ?park|movie world|studios? tour|disneyland|disney ?world|europa-?park|legoland|phantasialand|efteling|heide park|port ?aventura|gardaland|tivoli|lunapark|luna park|water ?park|wasserpark|aqua ?park|erlebnisbad|spaßbad|parc d'attractions|parco (divertimenti|giochi)|parque (temático|de atracciones)|луна-парк|парк развлечений|аквапарк|פארק שעשועים|פארק מים|לונה פארק/i;
/** Zoos, safari parks and aquariums: half a day (food on site). */
const ZOO_DAY = /(?:^|[^\p{L}])(zoo|tierpark|wildpark|safari ?park|zoologischer garten|aquarium|oceanarium|sea ?life)(?![\p{L}])|зоопарк|океанариум|גן החיות|גן חיות|ספארי/iu;
/** A day ticket or pass to somewhere (without a park or zoo named). */
const DAY_TICKET = /tages(ticket|karte|pass)|day ?(ticket|pass)|full[- ]day|ganztag|billet (d'une )?journée|biglietto giornaliero|entrada (de )?día|однодневн|כרטיס יומי/i;

/**
 * How long to plan for an event without a short set time: a theme park or film park day ticket
 * ("Filmpark Babelsberg – Tagesticket") 5 hours, a zoo or aquarium 3 hours, another day ticket
 * 4 hours; null for an ordinary event. `foodOnSite`: a meal can be had there.
 */
export function eventVisit(e: Pick<Event, 'name' | 'description' | 'venue'>): { minutes: number; foodOnSite: boolean; opens: number; closes: number } | null {
  const title = `${e.name ?? ''} ${e.venue ?? ''}`;
  const text = `${title} ${(e.description ?? '').slice(0, 300)}`;
  if (PARK_DAY.test(text)) return { minutes: 300, foodOnSite: true, opens: 10 * 60, closes: 18 * 60 };
  if (ZOO_DAY.test(title)) return { minutes: 180, foodOnSite: true, opens: 9 * 60, closes: 18 * 60 };
  if (DAY_TICKET.test(text)) return { minutes: 240, foodOnSite: false, opens: 10 * 60, closes: 18 * 60 };
  return null;
}

/** How an event fits into a day: at a fixed time, or as a drop-in within its opening window. */
export function eventTiming(
  e: Event,
  dayStart: number,
  dayEnd: number,
): { fixed: { start: number; end: number } } | { window: { start: number; end: number }; duration: number; foodOnSite?: boolean } {
  const long = eventVisit(e);
  if (e.startTime && e.endTime) {
    const start = toMinutes(e.startTime);
    let end = toMinutes(e.endTime);
    if (end <= start) end += 1440;
    // A park's opening hours ("10:00–18:00") are a window to visit in, not a show.
    if (long && end - start > long.minutes) return { window: { start, end }, duration: long.minutes, foodOnSite: long.foodOnSite };
    if (end - start <= FIXED_EVENT_MAX_MINUTES) return { fixed: { start, end } };
    return { window: { start, end }, duration: Math.min(long?.minutes ?? EVENT_VISIT_MINUTES, end - start) };
  }
  if (e.startTime) {
    const start = toMinutes(e.startTime);
    // A day ticket valid from its opening time: a visit of the park's length from then on.
    if (long) return { window: { start, end: Math.max(start + long.minutes, long.closes) }, duration: long.minutes, foodOnSite: long.foodOnSite };
    return { fixed: { start, end: start + EVENT_VISIT_MINUTES } };
  }
  // No times: a park or zoo during its usual opening hours; anything else at any time of the day.
  if (long) return { window: { start: Math.max(dayStart, long.opens), end: Math.max(long.closes, Math.max(dayStart, long.opens) + long.minutes) }, duration: long.minutes, foodOnSite: long.foodOnSite };
  return { window: { start: dayStart, end: dayEnd }, duration: 90 };
}

export interface DayEventChoice {
  e: Event;
  timing: ReturnType<typeof eventTiming>;
  mustDo: boolean;
  /** How well it suits the trip (interests, children, photo, distance, evening). */
  score: number;
}

/**
 * Today's events, best first: the traveller's own picks always; then up to `quota` others that
 * fit the day's hours and don't overlap each other — those matching the trip's interests (and,
 * with children, the family ones) first, then those with a photo and a description, nearer ones,
 * and timed shows in the evening rather than in the middle of a sightseeing day.
 */
export function pickDayEvents(
  events: Iterable<Event>,
  o: { date: Date; anchor: Location; dayStart: number; dayEnd: number; types: EventType[]; familyTrip: boolean; mustDo: Set<string>; used: Set<string>; quota: number },
): DayEventChoice[] {
  const options: DayEventChoice[] = [];
  for (const e of events) {
    if (o.used.has(e.id) || !e.occursOn(o.date)) continue;
    const mustDo = o.mustDo.has(e.id);
    const km = haversineKm(o.anchor, e.location);
    if (!mustDo && km > EVENT_RADIUS_KM) continue;
    const timing = eventTiming(e, o.dayStart, o.dayEnd);
    // A show after the day ends (or before it starts) can't be planned: don't let it take a place.
    if (!mustDo && 'fixed' in timing && (timing.fixed.start < o.dayStart || timing.fixed.end > o.dayEnd)) continue;
    if (!mustDo && 'window' in timing && Math.min(timing.window.end, o.dayEnd) - Math.max(timing.window.start, o.dayStart) < timing.duration) continue;
    const fit = e.types.filter((t) => o.types.includes(t)).length;
    const score =
      fit * 10 +
      (o.familyTrip && e.isKidFriendly ? 6 : 0) +
      (e.photo_urls.length ? 2 : 0) +
      (e.description.trim() ? 1 : 0) +
      ('fixed' in timing ? (timing.fixed.start >= 17 * 60 ? 1.5 : 0) : 1) -
      km / 10;
    options.push({ e, timing, mustDo, score });
  }
  options.sort((a, b) => Number(b.mustDo) - Number(a.mustDo) || b.score - a.score);
  const chosen: DayEventChoice[] = [];
  let others = 0;
  let timedOthers = 0;
  const span = (x: DayEventChoice) => ('fixed' in x.timing ? x.timing.fixed : null);
  // Two shows closer than half an hour can't both be seen.
  const overlaps = (x: DayEventChoice) => {
    const a = span(x);
    return !!a && chosen.some((c) => {
      const b = span(c);
      return !!b && a.start < b.end + 30 && b.start < a.end + 30;
    });
  };
  for (const x of options) {
    if (x.mustDo) {
      chosen.push(x);
      continue;
    }
    if (others >= o.quota || overlaps(x)) continue;
    if ('fixed' in x.timing && timedOthers >= TIMED_EVENTS_PER_DAY) continue;
    chosen.push(x);
    others++;
    if ('fixed' in x.timing) timedOthers++;
  }
  return chosen;
}

export async function generateTrip(
  req: TripRequest,
  providers: PlannerProviders,
  onProgress?: (step: PlannerStep) => void,
  debug?: PlannerDebug,
  ask?: PlannerQuestions,
): Promise<Trip> {
  validateRequest(req);
  const p = sharedAttractions(providers);
  const { lang } = req;
  const familyTrip = req.numKids > 0;
  // Accessibility is only considered when the traveller chose needs, and each need on its own:
  // the verifiable ones (blind, hearing, autism, physical) are checked place by place; all of
  // them set the pace (fewer places a day, a quiet break after each).
  const accessNeeds = (req.accessNeeds ?? []).filter(isDisability);
  const verifyNeeds = accessNeeds.filter((n) => VERIFIABLE_NEEDS.includes(n));
  const strict = !!req.accessStrict && verifyNeeds.length > 0;
  const pace = pacingFor(accessNeeds);
  const offbeat = req.style === 'offbeat';
  const niche: Niche = { types: req.types, familyTrip, needs: verifyNeeds, offbeat };
  const scoreOf = (a: Attraction) => scoreAttraction(a, req.types, familyTrip);
  const visitMinutes = (a: Attraction) => (pace.maxVisitMinutes ? Math.min(a.suggestedMinutes, pace.maxVisitMinutes) : a.suggestedMinutes);
  const numDays = daysBetween(req.startDate, req.endDate);
  const legKm = maxLegKm(req.mode);
  const dayDate = (i: number) => addDays(req.startDate, i);

  /* 1. Where does the trip start and end? */
  onProgress?.('geocode');
  const start = req.startPick ?? (await p.geocode(req.startingPoint, lang));
  if (!start) throw new PlannerError('city', { city: req.startingPoint });
  const sameCity =
    (!req.endingPoint.trim() && !req.endPick) ||
    req.endingPoint.trim().toLowerCase() === req.startingPoint.trim().toLowerCase() ||
    (!!req.endPick && haversineKm(req.endPick.location, start.location) < 2);
  const end = sameCity ? start : (req.endPick ?? (await p.geocode(req.endingPoint, lang)));
  if (!end) throw new PlannerError('city', { city: req.endingPoint });
  // The destinations in between, in the traveller's order (each looked up unless picked).
  const wanted = (req.destinations ?? []).filter((d) => d.pick || d.text.trim());
  const destinations: GeoResult[] = await Promise.all(
    wanted.map(async (d) => {
      const g = d.pick ?? (await p.geocode(d.text.trim(), lang));
      if (!g) throw new PlannerError('city', { city: d.text.trim() });
      return { name: g.name || d.text.trim(), location: g.location, country: g.country };
    }),
  );
  // Nobody can visit the Gaza Strip or North Korea: say so instead of planning a trip there.
  for (const pt of [start, end, ...destinations]) {
    if (areaStatus(pt.location, pt.country)?.level === 'closed') throw new PlannerError('closedArea', { city: pt.name });
  }
  const area = tripArea([start, end, ...destinations]);
  const okSpot = (loc: Location, country?: string) => allowedSpot(loc, country, area);
  // A trip that starts and ends in the same country stays in it (Haifa → Eilat never goes through
  // Amman: two border crossings, and rental cars can't cross); otherwise any open country. A
  // destination the traveller added in another country opens the trip to it.
  const homeCountry =
    /^[A-Z]{2}$/.test(start.country) && start.country === end.country && destinations.every((d) => !d.country || d.country === start.country)
      ? start.country
      : '';
  const open = routeCandidates().filter((c) => okSpot(c.location, c.country));
  const oneWay = haversineKm(start.location, end.location) >= 30;
  const domesticAll = homeCountry ? open.filter((c) => c.country === homeCountry) : [];
  // A round trip from a country with hardly any towns on the list (Singapore, Luxembourg…) may
  // cross a border; otherwise the trip stays in its country.
  const domestic = domesticAll.length && (oneWay || domesticAll.length >= 3) ? domesticAll : [];
  const stops = domestic.length ? domestic : open;
  const inTripCountry = (a: Attraction) => !domestic.length || !a.country || a.country.toUpperCase() === homeCountry;
  const startPlace: Place = { id: 'start', name: start.name, country: start.country, location: start.location, population: 0, kind: 'start' };
  const endPlace: Place = oneWay ? { id: 'end', name: end.name, country: end.country, location: end.location, population: 0, kind: 'end' } : startPlace;

  /* 2. The route, day by day, with the greedy choice of attractions (route.ts). */
  onProgress?.('attractions');
  const pools = new Map<string, Attraction[]>();
  /** The places a day can use: places to visit, suitable for the group, open to visit (and confirmed, when asked). */
  const usable = (list: Attraction[]) => {
    const ok = list.filter((a) => plannable(a, req.types) && isSuitable(a, familyTrip, req.kidFriendly) && okSpot(a.location, a.country));
    return strict ? ok.filter((x) => supportsAll(x.disabilityCompatible, verifyNeeds)) : ok;
  };
  /** The trip's types go with each search (shops, clubs, beaches, cafés… are asked for when chosen). */
  const typeOpts = req.types?.length ? { types: [...req.types] as string[] } : undefined;
  /** One request per place, shared by everyone who asks (a place fetched ahead is ready when reached). */
  const asked = new Map<string, Promise<Attraction[]>>();
  const poolFor = (place: Place): Promise<Attraction[]> => {
    const known = asked.get(place.id);
    if (known) return known;
    const landmark = place.kind === 'landmark';
    const promise = p
      .attractionsNear(
        place.location,
        lang,
        landmark ? LANDMARK_RADIUS_KM : CITY_RADIUS_KM,
        landmark ? 30 : ATTRACTIONS_PER_CITY,
        verifyNeeds.length ? verifyNeeds : undefined,
        landmark ? undefined : typeOpts,
      )
      .catch(() => [] as Attraction[])
      .then((list) => {
        const pool = usable(list);
        pools.set(place.id, pool);
        return pool;
      });
    asked.set(place.id, promise);
    return promise;
  };
  // A one-way trip always ends at its destination: fetch its sights while the first city is planned.
  if (oneWay) void poolFor(endPlace);

  /** A world-class nature or heritage site on the way (Plitvice between Zagreb and Zadar). */
  const landmarkOnTheWay = async (from: Place, to: Place, daysAfterToday: number): Promise<Place | null> => {
    const leg = haversineKm(from.location, to.location);
    if (leg < 100) return null;
    const mid = interpolate(from.location, to.location, 0.5);
    const found = await p.attractionsNear(mid, lang, Math.min(60, leg / 2), 10, undefined, { landmarks: true }).catch(() => [] as Attraction[]);
    const toEnd = haversineKm(from.location, endPlace.location);
    for (const a of [...found].sort((x, y) => popularityOf(y) - popularityOf(x))) {
      const id = `landmark:${a.id}`;
      if (visitedPlaces.has(id) || popularityOf(a) < TOP_RATING || !okSpot(a.location, a.country) || !inTripCountry(a)) continue;
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

  /**
   * Once a place's own sights rated 7.0+ are used up and the trip stays (nowhere new within reach,
   * or back at the end of the trip with days to spare), the area around it is explored in circles
   * (CIRCLES): first every sight within 35 km or a top one (8.5+) within 50 km, then within 50 km
   * or 85 km, then 85 km or 100 km, each only when the previous one has nothing good left. Circles
   * cross borders where the traveller can go (Vienna → Bratislava, even Brno), never into closed or
   * no-entry areas. Each circle's sights join that place's list.
   */
  const circleLevel = new Map<string, number>();
  /** Everything each place's circle searches found (a later circle reuses an earlier one's finds). */
  const circleFinds = new Map<string, Map<string, Attraction>>();
  const nextCircle = async (pl: Place): Promise<boolean> => {
    const level = circleLevel.get(pl.id) ?? 0;
    if (level >= CIRCLES.length || pl.kind === 'landmark') return false;
    circleLevel.set(pl.id, level + 1);
    const c = CIRCLES[level];
    const finds = circleFinds.get(pl.id) ?? new Map<string, Attraction>();
    circleFinds.set(pl.id, finds);
    const points = Array.from({ length: c.points }, (_, k) => offsetKm(pl.location, c.ringKm, (360 / c.points) * k));
    const found = await Promise.all(
      points.map((pt) => p.attractionsNear(pt, lang, c.radiusKm, 20, verifyNeeds.length ? verifyNeeds : undefined, typeOpts).catch(() => [] as Attraction[])),
    );
    for (const a of usable(found.flat())) if (!finds.has(a.id)) finds.set(a.id, a);
    const base = await poolFor(pl);
    const have = new Set(base.map((a) => a.id));
    const inCircle = (a: Attraction) => {
      const km = haversineKm(pl.location, a.location);
      return km <= c.allKm || (km <= c.topKm && popularityOf(a) >= CIRCLE_TOP_RATING);
    };
    const extra = [...finds.values()].filter((a) => !have.has(a.id) && inCircle(a));
    const next = [...base, ...extra];
    pools.set(pl.id, next);
    asked.set(pl.id, Promise.resolve(next));
    return true;
  };
  /** Opens circles until the place has enough good (7.0+) sights left for a day, or none are left. */
  const exploreAround = async (pl: Place) => {
    const goodLeft = async () => (await poolFor(pl)).filter((a) => !plannedRough.has(a.id) && popularityOf(a) >= NICHE_RATING).length;
    while ((await goodLeft()) < (pace.maxPerDay ?? 4) && (await nextCircle(pl))) {
      /* the next circle */
    }
  };
  /** A stop worth a day: enough well-rated sights (a big city the sources know little about isn't). */
  const worthAStop = async (pl: Place) => (await poolFor(pl)).filter((a) => popularityOf(a) >= NICHE_RATING).length >= THIN_STOP_SIGHTS;

  /**
   * Must-see places and towns further than a day trip from where the trip goes: the route heads
   * there (the nearest first) when it moves on, and in time to still reach the end of the trip.
   * One that can't be reached in the days available is left out.
   */
  const mustVisit: Place[] = [
    ...(req.mustStops ?? []).map((m, k): Place => ({ id: `stop:${k}`, name: m.name, country: m.country, location: m.location, population: 0, kind: 'town' })),
    ...req.mustSee.map((a): Place => ({ id: `must:${a.id}`, name: a.name, country: a.country, location: a.location, population: 0, kind: 'landmark' })),
  ].filter((m) => okSpot(m.location, m.country));
  /**
   * The traveller's own destinations, in their order — they come before anything else. A
   * destination counts as visited only after a day spent in it (within DEST_NEAR_KM), never because
   * the route passed a town nearby (Venice was "reached" from Treviso and skipped). The ones the
   * days can't fit (with the travel between them) are left out and the traveller is told
   * (note "destSkipped:…").
   */
  const destAll: Place[] = destinations
    .map((d, k): Place => ({ id: `dest:${k}`, name: d.name, country: d.country, location: d.location, population: 0, kind: 'town' }))
    .filter((m) => okSpot(m.location, m.country));
  const routeLegs = (pts: Location[]) => pts.slice(1).reduce((n, pt, k) => n + legsNeeded(pts[k], pt, legKm), 0);
  const destStops: Place[] = [];
  const skippedDests: string[] = destinations.filter((d) => !okSpot(d.location, d.country)).map((d) => d.name);
  for (const d of destAll) {
    const route = [start.location, ...[...destStops, d].map((x) => x.location), end.location];
    if (routeLegs(route) <= numDays - 1) destStops.push(d);
    else skippedDests.push(d.name);
  }
  /**
   * Each destination's share of the trip: the days not needed for travelling are shared equally by
   * the start, each destination and the end (28 days Vienna → Venice → Amsterdam → Grenoble:
   * about 6 days in Venice and in Amsterdam). The trip stays that long unless it must move on.
   */
  const spareDays = numDays - 1 - routeLegs([start.location, ...destStops.map((d) => d.location), end.location]);
  const destShare = destStops.length ? 1 + Math.floor(Math.max(0, spareDays) / (destStops.length + 2)) : 0;
  /** Travel days between two places as the route really goes: a day's hop averages ¾ of the day's maximum. */
  const hopsNeeded = (a: Location, b: Location) => {
    const d = haversineKm(a, b);
    return d < MIN_LEG_KM ? 0 : d <= legKm ? 1 : Math.ceil(d / (legKm * 0.75));
  };
  const atDest = (pl: Place, m: Place) => pl.id === m.id || haversineKm(pl.location, m.location) < DEST_NEAR_KM;
  const visitedDest = (m: Place) => dayPlace.some((pl) => atDest(pl, m));
  const reached = (m: Place) => (m.id.startsWith('dest:') ? visitedDest(m) : dayPlace.some((pl) => haversineKm(pl.location, m.location) < MUST_NEAR_KM));
  /**
   * Days needed after today when the trip heads for `m` today: the travel there, then on through
   * every destination not yet visited (each with its share of days when `withShares`), to the end.
   */
  const daysNeeded = (from: Location, m: Place, withShares = true) => {
    const share = withShares ? destShare - 1 : 0;
    // With the shares, travel is counted as the route really goes (hops between towns are shorter
    // than a full day's travel); without them, at the full day's travel (can it be done at all?).
    const legs = withShares ? hopsNeeded : (a: Location, b: Location) => legsNeeded(a, b, legKm);
    let need = legs(from, m.location) - 1 + (m.id.startsWith('dest:') ? share : 0);
    let at = m.location;
    const k = destStops.indexOf(m);
    for (const n of destStops.slice(k + 1)) {
      if (n === m || visitedDest(n)) continue;
      need += legs(at, n.location) + share;
      at = n.location;
    }
    // The final destination too gets its share (when the trip ends somewhere new).
    return need + legs(at, endPlace.location) + (oneWay ? share : 0);
  };
  /**
   * Where to head next: the next destination in the traveller's order (one the days can no longer
   * reach is skipped for the one after it), and must-see places that still leave every
   * destination its days — the nearest first.
   */
  const mustAhead = (from: Place, daysAfter: number) => {
    const nextDest = destStops.find((m) => !visitedDest(m) && !atDest(from, m) && daysNeeded(from.location, m, false) <= daysAfter);
    const musts = mustVisit.filter(
      (m) => !reached(m) && haversineKm(from.location, m.location) >= MUST_NEAR_KM && daysNeeded(from.location, m) <= daysAfter,
    );
    return [...(nextDest ? [nextDest] : []), ...musts].sort((a, b) => haversineKm(from.location, a.location) - haversineKm(from.location, b.location));
  };
  /** The destination the trip is at now (its share not yet spent), if any. */
  const holdingAt = (pl: Place, daysHere: number) => destStops.find((m) => atDest(pl, m) && daysHere < destShare);

  const dayPlace: Place[] = [];
  const dayReason: string[] = [];
  const visitedPlaces = new Set<string>([startPlace.id]);
  const plannedRough = new Set<string>();
  let place = startPlace;
  let daysHere = 0;
  let lastPoint = start.location;
  for (let i = 0; i < numDays; i++) {
    let reason = i === 0 ? 'start' : 'stay';
    /** Time to move on, but nowhere new within reach. */
    let stuck = false;
    /** Staying on at one of the traveller's destinations for its share of the days. */
    let holding = false;
    if (i > 0) {
      const daysAfterToday = numDays - i - 1;
      const atTarget = haversineKm(place.location, endPlace.location) < MIN_LEG_KM;
      let move = false;
      const ahead = mustAhead(place, daysAfterToday);
      if (i === numDays - 1 && !atTarget) [move, reason] = [true, 'lastDay'];
      else if (!atTarget && legsNeeded(place.location, endPlace.location, legKm) > daysAfterToday) [move, reason] = [true, 'onSchedule'];
      // With destinations of the traveller's own, the final destination keeps its share of the days too.
      else if (destStops.length && oneWay && !atTarget && !ahead.length && hopsNeeded(place.location, endPlace.location) - 1 + destShare - 1 >= daysAfterToday) {
        [move, reason] = [true, 'onSchedule'];
      }
      // Just enough days left to reach a destination or must-visit (and give the destinations after
      // it their days) and still get to the end: go now.
      else if (ahead.some((m) => daysNeeded(place.location, m) >= daysAfterToday)) [move, reason] = [true, 'mustVisit'];
      // At one of the traveller's destinations: stay for its share of the days (exploring around
      // it once its own sights are used up).
      else if (holdingAt(place, daysHere)) [reason, holding] = ['destination', true];
      else if (overStay(place, daysHere)) [move, reason] = [true, 'fourDays'];
      // A city the sources had nothing for is not "seen": stay rather than drive off for lack of data.
      else if ((await poolFor(place)).length && cityExhausted((await poolFor(place)).filter((a) => !plannedRough.has(a.id)), niche)) {
        [move, reason] = [true, 'seenTheBest'];
      }
      if (move) {
        const fewestHops = destStops.length > 0;
        const choose = () => chooseNextStop({ current: place, target: endPlace, oneWay, daysAfter: daysAfterToday, visited: visitedPlaces, maxLegKm: legKm, places: stops, fewestHops, offbeat });
        const must = ahead[0];
        let next = must
          ? haversineKm(place.location, must.location) <= legKm
            ? must
            : chooseNextStop({ current: place, target: must, oneWay: true, daysAfter: daysAfterToday, visited: visitedPlaces, maxLegKm: legKm, places: stops, fewestHops, offbeat })
          : choose();
        if (must && next.id === must.id) reason = 'mustVisit';
        // A stop with hardly any sights (Puyang rather than Wuzhen) is passed over for the next
        // best, twice at most; it stays the choice when there is nothing else.
        for (let tries = 0; tries < 2 && !must && next.id !== place.id && next.id !== endPlace.id; tries++) {
          if (await worthAStop(next)) break;
          visitedPlaces.add(next.id);
          const other = choose();
          if (other.id === place.id || other.id === endPlace.id) break;
          next = other;
        }
        // A landmark on the way gets its own day — also on the way to the destination, as long as
        // there is still a day left to get there afterwards.
        if (!must && next.id !== place.id && (next.id !== endPlace.id || daysAfterToday >= 1)) {
          const stop = await landmarkOnTheWay(place, next, daysAfterToday);
          if (stop) [next, reason] = [stop, 'landmark'];
        }
        if (next.id === place.id) [reason, stuck] = ['stay', true];
        else {
          place = next;
          daysHere = 0;
          visitedPlaces.add(next.id);
        }
      }
    }
    // Nowhere new to go (or back at the end of the trip with days to spare) and this place's own
    // sights are (nearly) used up: explore the area around it.
    if (i > 0 && (stuck || holding || (place.id === endPlace.id && (oneWay || visitedPlaces.size > 1)))) await exploreAround(place);
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
      candidates: ordered.map((a) => ({ id: a.id, kind: 'attraction' as const, location: a.location, duration: visitMinutes(a), weeklyHours: a.weeklyHours, score: scoreOf(a), rank: rankOf(a, niche), foodOnSite: hasFoodOnSite(a) })),
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
  // The traveller's destinations the days couldn't fit: the plan says so (TripPlanScreen).
  const notVisited = [...skippedDests, ...destStops.filter((m) => !visitedDest(m)).map((m) => m.name)];
  if (strict && !req.mustSee.length && [...pools.values()].every((l) => !l.length)) {
    // Nothing confirmed anywhere (common where few venues publish accessibility information):
    // ask whether to plan with the best places, each marked, rather than end with an error.
    if (ask?.planWithoutConfirmation && (await ask.planWithoutConfirmation(verifyNeeds))) {
      return generateTrip({ ...req, accessStrict: false }, p, onProgress, debug);
    }
    throw new PlannerError('noAccessible');
  }
  const noSights = !req.mustSee.length && [...pools.values()].every((l) => !l.length);
  // No sights anywhere and nothing else asked for: say so plainly instead of an empty plan.
  if (noSights && !req.withEvents && !req.mustDo.length) throw new PlannerError('noAttractions', { city: startPlace.name });

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

  /* 3–4. Real local events, food in every place and one hotel per stay (consecutive nights in the
     same place) — all asked at the same time, since none depends on the others. */
  onProgress?.('events');
  const eventPool = new Map<string, Event>();
  const restaurantPools = new Map<string, Restaurant[]>();
  const hotels: Array<Hotel | null> = new Array(numDays).fill(null); // the last night is at home
  const nights = dayPlace.slice(0, Math.max(0, numDays - 1));
  const eventsDone = (async () => {
    if (!req.withEvents) return;
    await mapLimit(uniquePlaces, 4, async (pl) => {
      const list = await p.eventsNear(pl.location, req.startDate, req.endDate, lang, EVENT_RADIUS_KM).catch(() => []);
      for (const e of list) {
        // "Kid-friendly only" keeps the family events; a trip with children just skips adults-only ones.
        if (req.kidFriendly && !e.isKidFriendly) continue;
        if (familyTrip && ADULT_ONLY.test(`${e.name} ${e.description}`)) continue;
        if (!okSpot(e.location, e.country)) continue;
        eventPool.set(e.id, e);
      }
    });
  })();
  const foodDone = mapLimit(uniquePlaces, 3, async (pl) => {
    const days = dayPlace.filter((d) => d.id === pl.id).length;
    const want = Math.min(30, Math.max(10, days * RESTAURANTS_PER_DAY));
    const list = await p.restaurantsNear(pl.location, lang, want).catch(() => [] as Restaurant[]);
    // Places to eat only (never a Tripadvisor "things to do" or hotel page), each restaurant once —
    // the same restaurant twice under two ids could otherwise be lunch and dinner on one day.
    const meals: Restaurant[] = [];
    for (const r of list) {
      if (NOT_A_MEAL.test(`${r.name} ${r.description} ${r.cuisine.join(' ')}`) || isNotARestaurant(r) || !okSpot(r.location)) continue;
      if (/Attraction_Review|AttractionProductReview|Hotel_Review|VacationRentalReview/i.test(r.linkToPage)) continue;
      if (meals.some((m) => haversineKm(m.location, r.location) < 0.2 && nameSimilarity(m.name, r.name) >= 0.8)) continue;
      meals.push(r);
    }
    restaurantPools.set(pl.id, meals);
  });
  const hotelsDone = mapLimit(groupStays(anchors.slice(0, nights.length), (l) => dayPlace[anchors.indexOf(l)]?.id ?? gridKey(l)), 3, async (st) => {
    const list = await p
      .hotelsNear(anchors[st.first], lang, {
        checkIn: dayDate(st.first),
        checkOut: dayDate(st.last + 1),
        adults: req.numAdults,
        kids: req.numKids,
      })
      .catch(() => []);
    const best = pickHotel(list.filter((h) => okSpot(h.location)));
    for (let n = st.first; n <= st.last; n++) hotels[n] = best;
  });
  await eventsDone;
  onProgress?.('food');
  await Promise.all([foodDone, hotelsDone]);
  for (const e of req.mustDo) eventPool.set(e.id, e);

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
    // A place that is also on the town's restaurant list is a meal, not a sight ("Carmen's Corner"
    // was lunch and then a 90-minute visit).
    const eateries = restaurantPools.get(pl.id) ?? [];
    const alsoRestaurant = (a: Attraction) => eateries.some((r) => haversineKm(r.location, a.location) < 0.2 && nameSimilarity(r.name, a.name) >= 0.8);
    const pool = (pools.get(pl.id) ?? []).filter((a) => !usedAttractions.has(a.id) && !mustSee.some((m) => m.id === a.id) && !alsoRestaurant(a));
    // Night clubs are for the night out after the day (NIGHT_OUT), never a daytime visit.
    const clubs = pool.filter((a) => a.kind === 'nightlife');
    const ranked = greedyOrder(
      pool.filter((a) => a.kind !== 'nightlife'),
      base.location,
      niche,
      CANDIDATES_PER_DAY,
    );

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
        foodOnSite: hasFoodOnSite(a),
      })),
      ...ranked.map((a) => ({
        id: a.id,
        kind: 'attraction' as const,
        location: a.location,
        duration: visitMinutes(a),
        weeklyHours: a.weeklyHours,
        score: scoreOf(a),
        rank: rankOf(a, niche),
        foodOnSite: hasFoodOnSite(a),
      })),
    ];

    const fixed: FixedItem[] = [];
    const todaysEvents: Event[] = [];
    const eventInfo: DayExplain['events'] = [];
    // The day's share of events: more where the town has few good sights left.
    const goodLeft = mustSee.length + pool.filter((a) => popularityOf(a) >= GOOD_SIGHT).length;
    const mustDoIds = new Set(req.mustDo.map((m) => m.id));
    const chosen = pickDayEvents(eventPool.values(), {
      date,
      anchor,
      dayStart: req.dayStart,
      dayEnd: req.dayEnd,
      types: req.types,
      familyTrip,
      mustDo: mustDoIds,
      used: usedEvents,
      quota: req.withEvents ? eventsQuota(goodLeft) : 0,
    });
    const chosenIds = new Set(chosen.map((x) => x.e.id));
    for (const { e, timing, mustDo } of chosen) {
      todaysEvents.push(e);
      const fit = Math.min(2, e.types.filter((t) => req.types.includes(t)).length);
      if ('fixed' in timing) {
        fixed.push({ id: e.id, location: e.location, ...timing.fixed });
        eventInfo.push({ event: e, timing: 'fixed', ...timing.fixed });
      } else {
        eventInfo.push({ event: e, timing: 'dropIn', ...timing.window, score: 90 + fit * 12 });
        candidates.push({
          id: e.id,
          kind: 'event',
          location: e.location,
          duration: timing.duration,
          window: timing.window,
          score: 90 + fit * 12,
          rank: [CHOSEN_EVENT_RANK, 0, fit],
          mustInclude: mustDo,
          foodOnSite: timing.foodOnSite,
        });
      }
    }
    // A couple of other drop-in events, for time no sight can use (an evening, a gap before a meal).
    if (req.withEvents) {
      const fillers = pickDayEvents(eventPool.values(), {
        date,
        anchor,
        dayStart: req.dayStart,
        dayEnd: req.dayEnd,
        types: req.types,
        familyTrip,
        mustDo: new Set(),
        used: new Set([...usedEvents, ...chosenIds]),
        quota: 20,
      })
        .filter((x) => !('fixed' in x.timing))
        .slice(0, FILLER_EVENTS_PER_DAY);
      for (const { e, timing } of fillers) {
        if ('fixed' in timing) continue;
        const fit = Math.min(2, e.types.filter((t) => req.types.includes(t)).length);
        todaysEvents.push(e);
        eventInfo.push({ event: e, timing: 'dropIn', ...timing.window, score: 75 + fit * 12 });
        candidates.push({
          id: e.id,
          kind: 'event',
          location: e.location,
          duration: timing.duration,
          window: timing.window,
          score: 75 + fit * 12,
          rank: [FILLER_EVENT_RANK, 0, fit],
          foodOnSite: timing.foodOnSite,
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

    // The night out (Night Clubs chosen, adults only, not on the way-home day): the best club near
    // tonight's hotel, after the day's last stop.
    let dayEnd = req.dayEnd;
    const night = req.types.includes('Night Clubs') && !familyTrip && i < numDays - 1 ? hotel ?? { id: `anchor:${i}`, name: '', location: anchor } : null;
    if (night && clubs.length) {
      const last = [...result.slots].sort((a, b) => a.end - b.end).pop();
      const lastPoint = last ? points.find((pt) => pt.id === last.refId) : undefined;
      const slot = planNightOut(
        [...clubs].sort((a, b) => popularityOf(b) - popularityOf(a)),
        { date, after: last?.end ?? req.dayStart, from: lastPoint ?? base, near: night.location, travel },
      );
      if (slot) {
        result.slots.push(slot);
        result.placed.push(slot.refId);
        dayEnd = Math.max(dayEnd, slot.end);
      }
    }

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
        fromMinutes(dayEnd),
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

  if (!itinerary.some((d) => d.attractions.length || d.events.length)) {
    throw noSights ? new PlannerError('noAttractions', { city: startPlace.name }) : new PlannerError('nothingFound');
  }

  /* 7. Fuller descriptions for the planned places that only have a line ("park in Tel Aviv"). */
  if (p.describe) {
    onProgress?.('details');
    const planned = [...new Map(itinerary.flatMap((d) => d.attractions).map((a) => [a.id, a])).values()].filter(needsDescription);
    await mapLimit(planned, 6, async (a) => {
      const d = await p.describe!(a, lang).catch(() => null);
      if (d && d.text.trim().length > a.description.trim().length) {
        a.description = d.text.trim();
        a.descriptionSource = d.source;
        a.descriptionUrl = d.url;
      }
    });
  }

  /* 8. Warnings for the places that need one (Palestinian Authority towns, Ukraine, Crimea…). */
  const warnings = new WarningCollector();
  itinerary.forEach((d, i) => {
    warnings.add(i + 1, d.anchor, dayPlace[i].country, d.anchorName);
    d.attractions.forEach((a) => warnings.add(i + 1, a.location, a.country, a.name));
    d.events.forEach((e) => warnings.add(i + 1, e.location, e.country, e.name));
  });

  /* 9. The kids' version: simple descriptions and a sourced fun fact per place. */
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
    `${[start.name, ...destinations.map((d) => d.name), ...(sameCity ? [] : [end.name])].join(' → ')} · ${isoDay(req.startDate)}`;

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
    [
      ...(p.sourceNotes?.() ?? []),
      ...(noSights ? ['noAttractions'] : []),
      ...(notVisited.length ? [`${DEST_SKIPPED_NOTE}${notVisited.join('|')}`] : []),
      ...warnings.notes(),
    ],
  );
}
