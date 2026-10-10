/**
 * Builds a trip and prints WHY every item is where it is: the scores, what was offered each
 * day, and each decision of the day builder (what fitted, what was skipped and why).
 *
 * 1) Offline, with a fictional town "Testville" (no keys, no network, always the same result):
 *      npx tsx scripts/explainTrip.ts
 *      npx tsx scripts/explainTrip.ts --kids 0 --types Nature,Food --day-end 22:00
 *
 * 2) Live, against your deployed Cloud Functions (real TripAdvisor / Google / events data):
 *      FIREBASE_API_KEY=... FIREBASE_PROJECT_ID=... \
 *      npx tsx scripts/explainTrip.ts --live --from "Prague" --start 2026-10-16 --days 3 --kids 2 --types History,Kid\ Friendly
 *    …or against the local emulators:  add USE_EMULATORS=1 (and run `firebase emulators:start`).
 *
 * Options: --from CITY  --to CITY  --start YYYY-MM-DD  --days N  --adults N  --kids N
 *          --types A,B  --mode car|transit  --day-start HH:MM  --day-end HH:MM
 *          --no-events  --kid-friendly  --lang en|he|ru  --must-see "Name"(fixture only)
 * HOW_TO_TEST.md §6 explains how to read the output.
 */
import { Attraction, EVENT_TYPES, Event, EventJSON, EventType, Hotel, Location, MODE_CAR, MODE_PUBLIC_TRANSPORT, Restaurant, WeeklyHours, isoDay } from '../src/models';
import type { Lang } from '../src/i18n/localized';
import { formatClock } from '../src/i18n/translate';
import { classify, isSuitable } from '../src/planner/classify';
import { DayExplain, PlannerProviders, TripRequest, generateTrip } from '../src/planner/generator';
import type { TraceEntry } from '../src/planner/scheduler';
import { describeHours, toMinutes } from '../src/planner/time';

/* ------------------------------ arguments ------------------------------ */

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const live = flag('live');
const lang = opt('lang', 'en') as Lang;
const start = new Date(`${opt('start', '2026-10-16')}T00:00:00`);
const days = Number(opt('days', '3'));
const types = opt('types', 'History,Kid Friendly')
  .split(',')
  .map((t) => t.trim())
  .filter((t): t is EventType => (EVENT_TYPES as readonly string[]).includes(t));

/* ------------------------- fixture: "Testville" ------------------------- */
// A fictional town used only by this script. Nothing here is shown in the app.

const C = new Location(45.0, 10.0);
const at = (dNorthKm: number, dEastKm: number) => new Location(C.locLat + dNorthKm / 111.32, C.locLon + dEastKm / 78.71);
const week = (open: string, close: string, closedOn: number[] = []): WeeklyHours =>
  Array.from({ length: 7 }, (_, d) => (closedOn.includes(d) ? [] : [{ open: toMinutes(open), close: toMinutes(close) }]));

function place(id: string, name: string, category: string, rating: number, reviews: number, loc: Location, hours?: WeeklyHours) {
  const c = classify(category);
  return new Attraction(id, name, `${name} (fixture)`, c.types, 'XX', null, `https://example.org/${id}`, [], loc, [], [], hours, rating, reviews, category, c.duration);
}

const FIXTURE_ATTRACTIONS: Attraction[] = [
  place('zoo', 'Testville Zoo', 'Zoos & Aquariums', 4.6, 21000, at(2.5, 1.0), week('09:00', '19:00')),
  place('castle', 'Hill Castle', 'Castles, Historic Sites', 4.7, 34000, at(0.8, -1.2), week('09:00', '17:00')),
  place('synagogue', 'Old Synagogue Museum', 'Museums, Historic Sites', 4.5, 6000, at(0.3, 0.4), week('09:00', '17:00', [6])),
  place('science', 'Hands-on Science Centre', 'Science Museums, Interactive', 4.4, 3800, at(-1.5, 2.0), week('10:00', '18:00')),
  place('market', 'Morning Market', 'Farmers Markets', 4.3, 2100, at(0.1, 0.1), week('07:00', '13:00')),
  place('garden', 'Botanic Garden', 'Gardens', 4.5, 5200, at(-0.8, -0.6), week('08:00', '20:00')),
  place('bridge', 'Stone Bridge', 'Bridges, Points of Interest & Landmarks', 4.8, 52000, at(0.2, -0.3)),
  place('cathedral', "St Anne's Cathedral", 'Churches & Cathedrals, Historic Sites', 4.6, 15000, at(0.0, 0.2), week('07:00', '19:00')),
  place('themepark', 'Fun Valley Theme Park', 'Theme Parks, Amusement Parks', 4.2, 9000, at(-6.0, 4.0), week('10:00', '18:00')),
  place('lantern', 'Lantern Walk', 'Walking Tours, Historical Tours', 4.9, 800, at(0.0, 0.0), week('19:30', '22:00')),
  place('lake', 'Blue Lake Beach', 'Lakes, Beaches', 4.1, 1500, at(4.0, -5.0)),
  place('history', 'City History Museum', 'History Museums', 4.2, 4100, at(-0.4, 1.1), week('10:00', '18:00', [1])),
  place('bar', 'Harbour Bar', 'Bars & Clubs', 4.8, 3000, at(0.4, 0.4), week('18:00', '26:00')),
];

const restaurant = (id: string, name: string, loc: Location, hours?: WeeklyHours) =>
  new Restaurant(id, name, '(fixture)', [], `https://example.org/${id}`, loc, [], [], hours);

const FIXTURE_RESTAURANTS: Restaurant[] = [
  restaurant('r-square', 'Square Bistro', at(0.1, 0.0), week('11:00', '22:00')),
  restaurant('r-castle', 'Castle Tavern', at(0.9, -1.0), week('11:30', '21:00')),
  restaurant('r-zoo', 'Zoo Café', at(2.4, 1.1), week('09:00', '18:30')),
  restaurant('r-garden', 'Garden Kitchen', at(-0.7, -0.5), week('12:00', '22:00', [0])),
  restaurant('r-dinner', 'Evening Grill (dinner only)', at(-0.2, 0.6), week('18:00', '23:00')),
  restaurant('r-science', 'Lab Pizza', at(-1.4, 2.1), week('11:00', '21:30')),
];

const FIXTURE_HOTELS = [
  new Hotel('h-river', 'Hotel Riverside', '(fixture)', [], null, 'https://www.booking.com/', at(0.3, -0.1).locLat, at(0.3, -0.1).locLon, '', [], 4.6),
  new Hotel('h-station', 'Station Inn', '(fixture)', [], null, 'https://www.booking.com/', at(-1.0, 1.0).locLat, at(-1.0, 1.0).locLon, '', [], 4.1),
];

function fixtureEvent(o: { id: string; name: string; from: Date; to: Date; types: EventType[]; loc: Location; startTime?: string; endTime?: string }) {
  return new Event({
    id: o.id,
    name: o.name,
    description: '(fixture)',
    startDate: o.from,
    endDate: o.to,
    types: o.types,
    country: 'XX',
    price: 0,
    link: `https://example.org/${o.id}`,
    photo_urls: ['https://example.org/p.jpg'],
    photoSources: [{ url: 'https://example.org/p.jpg', sourcePage: `https://example.org/${o.id}`, credit: 'fixture' }],
    location: o.loc,
    venue: o.name,
    address: 'Testville',
    origin: 'curated',
    sourceName: 'fixture',
    startTime: o.startTime,
    endTime: o.endTime,
  });
}

const day = (n: number) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + n);
const FIXTURE_EVENTS: Event[] = [
  fixtureEvent({ id: 'ev-puppets', name: 'Puppet Theatre matinée', from: day(1), to: day(1), types: ['Kid Friendly', 'Theatre'], loc: at(0.2, 0.3), startTime: '15:00', endTime: '16:00' }),
  fixtureEvent({ id: 'ev-food', name: 'Autumn Food Festival', from: day(1), to: day(2), types: ['Food', 'Festival', 'Family'], loc: at(-0.3, -0.2), startTime: '11:00', endTime: '22:00' }),
  fixtureEvent({ id: 'ev-jazz', name: 'Late Jazz Night (adults)', from: day(1), to: day(1), types: ['Festival'], loc: at(0.1, 0.1), startTime: '21:30', endTime: '23:30' }),
];

const fixtureProviders: PlannerProviders = {
  geocode: async (q) => ({ location: C, name: q || 'Testville', country: 'XX' }),
  route: async () => null,
  placeName: async () => 'Testville',
  attractionsNear: async () => FIXTURE_ATTRACTIONS,
  restaurantsNear: async () => FIXTURE_RESTAURANTS,
  hotelsNear: async () => FIXTURE_HOTELS,
  eventsNear: async (_l, from, to) => FIXTURE_EVENTS.filter((e) => e.overlaps(from, to)),
  travelMatrix: async () => [], // → straight-line estimates, marked "(estimate)"
};

/* ------------------------- live: Cloud Functions ------------------------ */

const REGION = process.env.FIREBASE_FUNCTIONS_REGION ?? 'europe-west1';
const PROJECT = process.env.FIREBASE_PROJECT_ID ?? 'demo-firefly';
const EMU = process.env.USE_EMULATORS === '1';
let idToken = process.env.FIREBASE_ID_TOKEN ?? '';

async function token(): Promise<string> {
  if (idToken) return idToken;
  const key = process.env.FIREBASE_API_KEY ?? 'fake-api-key';
  const base = EMU ? 'http://127.0.0.1:9099/identitytoolkit.googleapis.com' : 'https://identitytoolkit.googleapis.com';
  const r = await fetch(`${base}/v1/accounts:signUp?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  const j = (await r.json()) as { idToken?: string; error?: { message: string } };
  if (!j.idToken) throw new Error(`Anonymous sign-in failed: ${j.error?.message} (enable Anonymous auth in Firebase)`);
  idToken = j.idToken;
  return idToken;
}

async function call<T>(name: string, data: unknown): Promise<T> {
  const url = EMU ? `http://127.0.0.1:5001/${PROJECT}/${REGION}/${name}` : `https://${REGION}-${PROJECT}.cloudfunctions.net/${name}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ data }),
  });
  const j = (await r.json()) as { result?: T; error?: { status: string; message: string } };
  if (j.error) throw new Error(`${name}: ${j.error.status} ${j.error.message}`);
  return j.result as T;
}

const ll = (l: Location) => ({ lat: l.locLat, lon: l.locLon });
const liveProviders: PlannerProviders = {
  async geocode(query, lang) {
    const r = await call<{ lat: number; lon: number; name: string; country: string } | null>('geocode', { query, lang });
    return r ? { location: new Location(r.lat, r.lon), name: r.name, country: r.country } : null;
  },
  async route(a, b) {
    const r = await call<{ points: Array<[number, number]> } | null>('routeLine', { from: ll(a), to: ll(b) });
    return r ? r.points.map(([la, lo]) => new Location(la, lo)) : null;
  },
  async placeName(loc, lang) {
    return (await call<{ name: string }>('reverseGeocode', { ...ll(loc), lang })).name;
  },
  async attractionsNear(loc, lang, radiusKm, want) {
    return (await call<{ items: never[] }>('attractionsNear', { ...ll(loc), lang, radiusKm, want })).items.map(Attraction.fromJSON);
  },
  async restaurantsNear(loc, lang, want) {
    return (await call<{ items: never[] }>('restaurantsNear', { ...ll(loc), lang, want })).items.map(Restaurant.fromJSON);
  },
  async hotelsNear(loc, lang, s) {
    const r = await call<{ items: never[] }>('hotelsNear', { ...ll(loc), lang, checkIn: isoDay(s.checkIn), checkOut: isoDay(s.checkOut), adults: s.adults, kids: s.kids });
    return r.items.map(Hotel.fromJSON);
  },
  async eventsNear(loc, from, to, lang, radiusKm) {
    const r = await call<{ events: EventJSON[] }>('searchEvents', { ...ll(loc), radiusKm, from: isoDay(from), to: isoDay(to), lang });
    return r.events.map((e) => Event.fromJSON(e));
  },
  async travelMatrix(points, mode, departure) {
    const r = await call<{ entries: Array<{ from: string; to: string; minutes: number; meters: number }> }>('travelMatrix', {
      points: points.map((p) => ({ id: p.id, ...ll(p.location) })),
      mode,
      departure: departure && departure.getTime() > Date.now() ? departure.toISOString() : undefined,
    });
    return r.entries;
  },
};

/* -------------------------------- output -------------------------------- */

const clock = formatClock;
const names = new Map<string, string>();
const label = (id: string) => names.get(id) ?? id;
const SKIP_TEXT: Record<string, string> = {
  closed: 'closed at that time',
  closedToday: 'closed all day today',
  afterDayEnd: 'would end after your day ends',
  clashesWithFixed: 'would make you late for a fixed-time event',
  noRoomForLunch: 'would leave no time for lunch',
  noRoomForDinner: 'would leave no time for dinner',
};

function printDay(d: DayExplain) {
  const date = d.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  console.log(`\n══ Day ${d.day} · ${date} · based around ${d.anchorName} ══`);
  const why: Record<string, string> = {
    start: 'the starting city',
    stay: 'stayed: there are still 9.0+ places, or 7.0+ places that fit the chosen types/needs',
    seenTheBest: 'moved on: no 9.0+ place and no 7.0+ place that fits the niches was left',
    fourDays: 'moved on: 4 days in one city is the limit (world cities excepted)',
    onSchedule: 'moved on: needed to keep the destination reachable in the days left',
    lastDay: 'the last day is spent at the destination',
    landmark: 'a world-class landmark on the way gets its own day',
  };
  console.log(`Why here: ${why[d.placeReason] ?? d.placeReason}`);
  console.log(`Starts from: ${d.base.name}${d.day === 1 ? ' (your starting city)' : " (last night's hotel)"}`);
  for (const m of d.mustSee) names.set(m.id, m.name);
  if (d.mustSee.length) console.log(`Must-see (always tried first): ${d.mustSee.map((m) => m.name).join(', ')}`);
  console.log(`Attractions offered today (greedy order: popularity, accessibility, type/age, distance; ${d.offered.length} offered${d.notOffered ? `; ${d.notOffered} ranked lower wait for later days` : ''}):`);
  console.log('   score =  quality + popular. + types + family   place [visit, hours today]');
  for (const { attraction: a, parts: p } of d.offered) {
    names.set(a.id, a.name);
    const hours = describeHours(a.weeklyHours, d.date, clock) ?? (a.weeklyHours ? 'closed today' : 'hours unknown → treated as open');
    console.log(
      `   ${p.total.toFixed(1).padStart(5)} = ${p.quality.toFixed(1).padStart(5)} + ${p.popularity.toFixed(1).padStart(5)} + ${String(p.typeMatch).padStart(5)} + ${String(p.family).padStart(6)}   ${a.name} [${a.suggestedMinutes} min, ${hours}]`,
    );
  }
  if (d.events.length) {
    console.log('Events today:');
    for (const e of d.events) {
      names.set(e.event.id, e.event.name);
      console.log(
        e.timing === 'fixed'
          ? `   ★ ${e.event.name} — fixed time ${clock(e.start)}–${clock(e.end)}: the day is built around it`
          : `   ★ ${e.event.name} — drop-in ${clock(e.start)}–${clock(e.end)}, score ${e.score} (75 + 12 per matching type)`,
      );
    }
  }
  for (const r of d.restaurants) names.set(r.id, r.name);
  console.log(`Restaurants offered (closest to where the day goes${d.restaurantsRepeat ? '; town list used up, repeats allowed' : ''}): ${d.restaurants.map((r) => r.name).join(', ') || 'none'}`);
  console.log(`Travel times: ${d.routedLegs ? `${d.routedLegs} legs from Google Routes, the rest estimated` : 'all straight-line estimates (no routing data)'}`);
  console.log('Decisions:');
}

function printTrace(t: TraceEntry) {
  const at = clock(t.at).padStart(5);
  switch (t.kind) {
    case 'pick': {
      const fit = t.others.filter((o) => o.value != null).sort((a, b) => b.value! - a.value!).slice(0, 3);
      const skipped = t.others.filter((o) => o.skip).slice(0, 4);
      const value = t.value > 1e5 ? `must-see, ${(t.value - 1e6).toFixed(1)}` : t.value.toFixed(1);
      console.log(`   ${at}  → ${label(t.chosen)} ${clock(t.start)}–${clock(t.end)}  (travel ${t.travel} min${t.wait ? `, wait ${t.wait} min for opening` : ''}; value ${value})`);
      if (t.mealOnSite) console.log(`            a long visit over ${t.mealOnSite}time → ${t.mealOnSite} is eaten on site`);
      if (fit.length) console.log(`            also fitted: ${fit.map((o) => `${label(o.id)} ${o.value!.toFixed(1)}`).join(', ')}`);
      if (skipped.length) console.log(`            didn't fit: ${skipped.map((o) => `${label(o.id)} (${SKIP_TEXT[o.skip!]})`).join('; ')}`);
      break;
    }
    case 'meal':
      console.log(
        t.restaurant
          ? `   ${at}  🍴 ${t.meal} at ${label(t.restaurant)} ${clock(t.start!)} (travel ${t.travel} min) — the closest open restaurant`
          : `   ${at}  🍴 ${t.meal}: no offered restaurant is open and reachable in time — meal skipped`,
      );
      break;
    case 'fixed':
      console.log(`   ${at}  ★ ${label(t.id)} ${clock(t.start)}–${clock(t.end)} (fixed time; travel ${t.travel} min)`);
      break;
    case 'jump':
      console.log(`   ${at}  … nothing fits before ${t.meal}: free time until ${clock(t.to)}`);
      break;
    case 'end':
      console.log(`   ${at}  day ends: ${t.why === 'maxAttractions' ? 'already 6 attractions today' : 'nothing else fits before the end of your day'}`);
      break;
  }
}

async function main() {
  const providers = live ? liveProviders : fixtureProviders;
  const mustSeeName = opt('must-see', '');
  const req: TripRequest = {
    startingPoint: opt('from', live ? 'Prague' : 'Testville'),
    endingPoint: opt('to', ''),
    numAdults: Number(opt('adults', '2')),
    numKids: Number(opt('kids', '2')),
    types,
    startDate: start,
    endDate: day(days - 1),
    withEvents: !flag('no-events'),
    kidFriendly: flag('kid-friendly'),
    mode: opt('mode', 'car') === 'transit' ? MODE_PUBLIC_TRANSPORT : MODE_CAR,
    dayStart: toMinutes(opt('day-start', '09:00')),
    dayEnd: toMinutes(opt('day-end', '20:00')),
    mustSee: !live && mustSeeName ? FIXTURE_ATTRACTIONS.filter((a) => a.name.toLowerCase().includes(mustSeeName.toLowerCase())) : [],
    mustDo: [],
    lang,
    ownerId: 'tester',
    people: [],
  };
  const family = req.numKids > 0;
  console.log(`Firefly trip explainer — ${live ? `LIVE (${EMU ? 'emulators' : PROJECT})` : 'fixture town "Testville" (fictional)'}`);
  console.log(
    `${req.startingPoint}${req.endingPoint ? ` → ${req.endingPoint}` : ''}, ${days} day(s) from ${isoDay(start)}, ${req.numAdults} adults + ${req.numKids} kids, ` +
      `types: ${types.join(', ') || 'none'}, ${req.mode === MODE_CAR ? 'car' : 'public transport'}, day ${clock(req.dayStart)}–${clock(req.dayEnd)}, events ${req.withEvents ? 'on' : 'off'}`,
  );
  if (!live) {
    const hidden = FIXTURE_ATTRACTIONS.filter((a) => !isSuitable(a, family, req.kidFriendly));
    if (hidden.length) console.log(`Not suggested on this trip: ${hidden.map((a) => a.name).join(', ')} (adults-only or not kid-friendly)`);
    const adultEvents = FIXTURE_EVENTS.filter((e) => (family || req.kidFriendly) && !e.isKidFriendly);
    if (adultEvents.length) console.log(`Events left out (not for children): ${adultEvents.map((e) => e.name).join(', ')}`);
  }

  const trip = await generateTrip(req, providers, (s) => live && process.stderr.write(`[${s}] `), {
    onDay: printDay,
    trace: (_d, t) => printTrace(t),
  });

  console.log('\n══ Final plan ══');
  for (const d of trip.itinerary) {
    console.log(`Day ${d.id} (${isoDay(d.date)}) — ${d.anchorName}`);
    for (const s of [...d.slots].sort((a, b) => a.start - b.start)) {
      const name =
        s.kind === 'attraction' ? d.findAttraction(s.refId)?.name : s.kind === 'event' ? d.findEvent(s.refId)?.name : `${s.meal}: ${d.findRestaurant(s.refId)?.name}`;
      const leg = s.travelBefore ? ` (${s.travelBefore.minutes} min${s.travelBefore.estimated ? ', estimate' : ''})` : '';
      console.log(`   ${clock(s.start)}–${clock(s.end)}  ${s.kind === 'event' ? '🎉 ' : s.kind === 'restaurant' ? '🍴 ' : ''}${name}${leg}`);
    }
    console.log(`   🛏  ${d.hotel ? d.hotel.name : 'no hotel (last day)'}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
