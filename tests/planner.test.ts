import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Attraction, Event, Hotel, Location, MODE_CAR, Restaurant, WeeklyHours } from '../src/models';
import { decodePolyline, dayAnchors, estimateTravelMinutes, haversineKm } from '../src/planner/geo';
import { checkOpen, earliestOpenStart, periodsToWeekly, toMinutes } from '../src/planner/time';
import { TravelTable } from '../src/planner/travel';
import { DINNER, LUNCH, OrderedItem, TraceEntry, scheduleDay, simulateOrder, tryMove } from '../src/planner/scheduler';
import { PlannerProviders, generateTrip, eventTiming } from '../src/planner/generator';
import { classify, scoreAttraction } from '../src/planner/classify';
import { pickFunFact, kidSummary, nameSimilarity } from '../src/planner/kidify';

const PRAGUE = new Location(50.0875, 14.4213);
const H = (h: number, m = 0) => h * 60 + m;
const allWeek = (open: number, close: number): WeeklyHours => Array.from({ length: 7 }, () => [{ open, close }]);
// Saturday 17 Oct 2026
const SAT = new Date(2026, 9, 17);

/* ---------------- geo & time ---------------- */

test('haversine: Prague → Vienna is about 250 km', () => {
  const d = haversineKm(PRAGUE, new Location(48.2082, 16.3738));
  assert.ok(d > 240 && d < 260, `got ${d}`);
});

test('decodePolyline matches the Google reference example', () => {
  const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.deepEqual(
    pts.map((p) => [p.locLat, p.locLon]),
    [
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ],
  );
});

test('day anchors: round trip stays put; one-way trip ends at the end city', () => {
  const vienna = new Location(48.2082, 16.3738);
  assert.ok(dayAnchors(PRAGUE, new Location(50.09, 14.43), 3, null).every((a) => a === PRAGUE));
  const a = dayAnchors(PRAGUE, vienna, 3, null);
  assert.equal(a[0].locLat, PRAGUE.locLat);
  assert.equal(a[2].locLat, vienna.locLat);
  assert.ok(Math.abs(haversineKm(a[0], a[1]) - haversineKm(a[1], a[2])) < 1);
});

test('travel estimate: car is slower in town, transit walks short hops', () => {
  assert.ok(estimateTravelMinutes(1, MODE_CAR) >= 7);
  assert.ok(estimateTravelMinutes(0.8, 1) < 15);
  assert.ok(estimateTravelMinutes(250, MODE_CAR) > 170);
});

test('opening hours: both day conventions and after-midnight closing', () => {
  // Google style: 0 = Sunday; open Mon 09:00–17:00 only
  const g = periodsToWeekly([{ open: { day: 1, time: '0900' }, close: { day: 1, time: '1700' } }])!;
  assert.deepEqual(g[1], [{ open: 540, close: 1020 }]);
  // ISO style (7 = Sunday): Sunday 20:00–02:00
  const iso = periodsToWeekly([{ open: { day: 7, time: '2000' }, close: { day: 1, time: '0200' } }])!;
  assert.deepEqual(iso[0], [{ open: 1200, close: 1560 }]);
  const sunday = new Date(2026, 9, 18);
  assert.equal(checkOpen(iso, sunday, H(23), H(25)), 'open');
  assert.equal(checkOpen(g, sunday, H(10), H(11)), 'closedDay');
  assert.equal(earliestOpenStart(allWeek(H(10), H(18)), SAT, H(8), 60), H(10));
  assert.equal(earliestOpenStart(allWeek(H(10), H(18)), SAT, H(17, 30), 60), null);
  assert.equal(toMinutes('25:00'), 1500);
});

/* ---------------- day scheduler ---------------- */

function place(id: string, dLat: number, dLon: number) {
  return { id, location: new Location(PRAGUE.locLat + dLat, PRAGUE.locLon + dLon) };
}

test('scheduleDay: respects hours, meals, a fixed event and the end of the day', () => {
  const travel = new TravelTable(MODE_CAR);
  const museum = { ...place('museum', 0.01, 0), kind: 'attraction' as const, duration: 120, score: 80, weeklyHours: allWeek(H(10), H(17)) };
  const castle = { ...place('castle', 0.0, 0.02), kind: 'attraction' as const, duration: 120, score: 90, weeklyHours: allWeek(H(9), H(18)) };
  const park = { ...place('park', -0.01, 0.01), kind: 'attraction' as const, duration: 75, score: 60 };
  const closedSat = { ...place('closed', 0.02, 0.02), kind: 'attraction' as const, duration: 60, score: 99, weeklyHours: [[], [], [], [], [], [], []] as WeeklyHours };
  const concert = { ...place('concert', 0.005, 0.005), start: H(16), end: H(17, 30) };
  const r1 = place('r1', 0.004, 0.004);
  const r2 = place('r2', -0.004, 0.006);

  const res = scheduleDay({
    date: SAT,
    dayStart: H(8),
    dayEnd: H(20),
    base: place('base', 0, 0),
    candidates: [museum, castle, park, closedSat],
    fixed: [concert],
    restaurants: [r1, r2],
    travel,
  });
  const byId = new Map(res.slots.map((s) => [s.refId, s]));

  assert.ok(!byId.has('closed'), 'never schedules a place closed that day');
  const c = byId.get('concert')!;
  assert.equal(c.start, H(16));
  assert.equal(c.fixed, true);
  const lunch = res.slots.find((s) => s.meal === 'lunch')!;
  assert.ok(lunch.start >= LUNCH.from && lunch.start <= LUNCH.to);
  const dinner = res.slots.find((s) => s.meal === 'dinner');
  assert.ok(dinner && dinner.end <= H(20), 'dinner fits before a 20:00 end of day');
  // No overlaps, everything in order and within the day.
  const sorted = [...res.slots].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i].start >= sorted[i - 1].end + (sorted[i].travelBefore?.minutes ?? 0) - 1, `overlap at ${sorted[i].refId}`);
  }
  assert.ok(sorted[sorted.length - 1].end <= H(20));
  const m = byId.get('museum');
  if (m) assert.ok(m.start >= H(10) && m.end <= H(17), 'museum visited only while open');
});

test('scheduleDay: dinner is planned on long days and must-see places always get in', () => {
  const travel = new TravelTable(MODE_CAR);
  const cands = Array.from({ length: 8 }, (_, i) => ({
    ...place(`a${i}`, i * 0.003, 0),
    kind: 'attraction' as const,
    duration: 60,
    score: 90 - i,
  }));
  cands.push({ ...place('must', 0.05, 0.05), kind: 'attraction' as const, duration: 60, score: 10, mustInclude: true } as never);
  const res = scheduleDay({
    date: SAT,
    dayStart: H(9),
    dayEnd: H(22),
    base: place('base', 0, 0),
    candidates: cands,
    fixed: [],
    restaurants: [place('r1', 0, 0.001), place('r2', 0.001, 0)],
    travel,
  });
  assert.ok(res.placed.includes('must'));
  const dinner = res.slots.find((s) => s.meal === 'dinner');
  assert.ok(dinner && dinner.start >= DINNER.from && dinner.start <= DINNER.to);
  assert.notEqual(res.slots.find((s) => s.meal === 'lunch')?.refId, dinner!.refId, 'lunch and dinner at different places');
});

test('scheduleDay: a late, far visit never pushes dinner out of a short day', () => {
  const travel = new TravelTable(MODE_CAR);
  const lake = { ...place('lake', 0.06, -0.06), kind: 'attraction' as const, duration: 75, score: 60 };
  const res = scheduleDay({
    date: SAT,
    dayStart: H(17),
    dayEnd: H(20),
    base: place('base', 0, 0),
    candidates: [lake],
    fixed: [],
    restaurants: [place('r1', 0.001, 0)],
    travel,
  });
  assert.ok(!res.placed.includes('lake'), 'the lake would end too late to still reach dinner');
  assert.ok(res.slots.some((s) => s.meal === 'dinner' && s.kind === 'restaurant'));
});

test('scheduleDay: a long visit over lunchtime includes lunch on site; the trace explains skips', () => {
  const travel = new TravelTable(MODE_CAR);
  const trace: TraceEntry[] = [];
  const res = scheduleDay({
    date: SAT,
    dayStart: H(10),
    dayEnd: H(18),
    base: place('base', 0, 0),
    candidates: [
      { ...place('themepark', 0.01, 0), kind: 'attraction', duration: 240, score: 200, weeklyHours: allWeek(H(10), H(18)), foodOnSite: true },
      { ...place('shut', 0.002, 0), kind: 'attraction', duration: 60, score: 50, weeklyHours: [[], [], [], [], [], [], []] },
    ],
    fixed: [],
    restaurants: [place('r1', 0.001, 0)],
    travel,
    trace: (t) => trace.push(t),
  });
  const park = res.slots.find((s) => s.refId === 'themepark')!;
  assert.equal(park.meal, 'lunch', 'lunch is eaten at the theme park');
  assert.ok(!res.slots.some((s) => s.kind === 'restaurant' && s.meal === 'lunch'), 'no separate lunch stop');
  const pick = trace.find((t) => t.kind === 'pick');
  assert.ok(pick && pick.kind === 'pick' && pick.mealOnSite === 'lunch');
  assert.ok(pick && pick.kind === 'pick' && pick.others.some((o) => o.id === 'shut' && o.skip === 'closedToday'));
});

test('scheduleDay: a long museum visit without food there never "includes lunch": lunch is a restaurant', () => {
  const res = scheduleDay({
    date: SAT,
    dayStart: H(10),
    dayEnd: H(18),
    base: place('base', 0, 0),
    candidates: [{ ...place('museum', 0.01, 0), kind: 'attraction', duration: 240, score: 200, weeklyHours: allWeek(H(10), H(18)) }],
    fixed: [],
    restaurants: [place('r1', 0.001, 0)],
    travel: new TravelTable(MODE_CAR),
  });
  const museum = res.slots.find((s) => s.refId === 'museum');
  assert.ok(!museum?.meal, 'no meal at the museum');
  assert.ok(res.slots.some((s) => s.kind === 'restaurant' && s.meal === 'lunch'), 'lunch at a restaurant');
  if (museum) {
    const lunch = res.slots.find((s) => s.kind === 'restaurant' && s.meal === 'lunch')!;
    assert.ok(museum.end <= lunch.start || museum.start >= lunch.end, 'the visit is before or after lunch');
  }
});

test('hasFoodOnSite: theme parks, zoos and a museum with a café; not a plain museum', async () => {
  const { hasFoodOnSite } = await import('../src/planner/classify');
  const a = (kind: string, name: string, description = '') => ({ kind, name, description, category: '' }) as never;
  assert.ok(hasFoodOnSite(a('themepark', 'Phantasialand')));
  assert.ok(hasFoodOnSite(a('zoo', 'Zoo Berlin')));
  assert.ok(hasFoodOnSite(a('museum', 'Deutsches Museum', 'The museum has a restaurant and a café on the ground floor.')));
  assert.ok(!hasFoodOnSite(a('museum', 'Pergamonmuseum', 'One of the museums on Museum Island in Berlin.')));
});

/* ---------------- drag & drop ---------------- */

function item(id: string, extra: Partial<OrderedItem> = {}): OrderedItem {
  return { ...place(id, 0.002, 0.002), kind: 'attraction', duration: 90, slotKey: `k-${id}`, ...extra };
}
const ctx = { date: SAT, dayStart: H(9), dayEnd: H(20), base: place('base', 0, 0), travel: new TravelTable(MODE_CAR) };

test('drag & drop: a valid reorder is accepted and re-timed', () => {
  const order = [item('a'), item('b'), item('c')];
  const res = tryMove(order, 2, 0, ctx);
  assert.equal(res.ok, true);
  if (res.ok) assert.deepEqual(res.slots.map((s) => s.refId), ['c', 'a', 'b']);
});

test('drag & drop: refuses to put a museum after it closes', () => {
  const order = [item('museum', { weeklyHours: allWeek(H(9), H(12)) }), item('x', { duration: 240 }), item('y', { duration: 60 })];
  const res = tryMove(order, 0, 2, ctx);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.refId, 'museum');
    assert.equal(res.reason, 'closed');
  }
});

test('drag & drop: refuses to push a visit into a fixed-time event', () => {
  const order = [
    item('a', { duration: 60 }),
    item('show', { kind: 'event', fixedStart: H(11), fixedEnd: H(12) }),
    item('long', { duration: 180 }),
  ];
  const res = tryMove(order, 2, 0, ctx);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.reason, 'overlap');
    assert.equal(res.otherRefId, 'show');
  }
  // Fixed events themselves cannot be dragged.
  assert.equal(tryMove(order, 1, 0, ctx).ok, false);
});

test('drag & drop: refuses an order that runs past the end of the day', () => {
  const order = [item('a', { duration: 300 }), item('b', { duration: 300 }), item('c', { duration: 60 })];
  const res = simulateOrder(order, ctx);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, 'afterEnd');
});

/* ---------------- classification & kids ---------------- */

test('classify + score: zoo is family-friendly, bars are adults-only', () => {
  const zoo = classify('Zoos & Aquariums');
  assert.ok(zoo.types.includes('Kid Friendly'));
  assert.equal(zoo.duration, 180);
  assert.equal(classify('Bars & Clubs').adultOnly, true);
  const a = new Attraction('1', 'Zoo', '', zoo.types, 'CZ', null, '', [], PRAGUE, [], [], undefined, 4.6, 20000);
  assert.ok(scoreAttraction(a, ['Family'], true) > scoreAttraction(a, ['History'], false));
});

test('kid helpers: fun fact prefers a sentence with a number, summary is short', () => {
  const text =
    'Prague Castle is a castle complex in Prague. It was built in the 9th century. It is the largest ancient castle in the world, covering 70,000 square metres.';
  assert.match(pickFunFact(text, 'en')!, /9th century|largest/);
  assert.equal(kidSummary(text, 1), 'Prague Castle is a castle complex in Prague.');
  assert.ok(nameSimilarity('Prague Castle', 'Prague Castle (Pražský hrad)') > 0.9);
});

/* ---------------- whole-trip generator with fake providers ---------------- */

function fakeAttraction(id: string, dLat: number, rating: number, category: string, hours?: WeeklyHours): Attraction {
  const c = classify(category);
  return new Attraction(id, `Place ${id}`, `About ${id}`, c.types, 'CZ', null, `https://www.tripadvisor.com/${id}`, [], new Location(PRAGUE.locLat + dLat, PRAGUE.locLon), [], [], hours, rating, 1000, category, c.duration);
}

const providers: PlannerProviders = {
  geocode: async (q) => (q.toLowerCase().includes('nowhere') ? null : { location: PRAGUE, name: 'Prague', country: 'CZ' }),
  route: async () => null,
  placeName: async () => 'Prague',
  attractionsNear: async () => [
    fakeAttraction('castle', 0.01, 4.8, 'Castles'),
    fakeAttraction('zoo', 0.03, 4.6, 'Zoos & Aquariums'),
    fakeAttraction('museum', 0.005, 4.4, 'Museums', allWeek(H(10), H(18))),
    fakeAttraction('bridge', 0.002, 4.7, 'Bridges'),
    fakeAttraction('bar', 0.001, 4.9, 'Bars & Clubs'),
    fakeAttraction('garden', -0.01, 4.3, 'Gardens'),
    fakeAttraction('church', 0.004, 4.5, 'Churches & Cathedrals'),
    fakeAttraction('square', 0.0, 4.6, 'Points of Interest & Landmarks, Squares'),
  ],
  restaurantsNear: async () =>
    ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map((id, i) => new Restaurant(id, `Restaurant ${id}`, '', [], `https://ta/${id}`, new Location(PRAGUE.locLat + i * 0.002, PRAGUE.locLon), [])),
  hotelsNear: async () => [new Hotel('h1', 'Hotel One', '', [], null, 'https://www.booking.com/x', PRAGUE.locLat, PRAGUE.locLon, '', [], 4.5)],
  eventsNear: async () => [
    new Event({
      id: 'ev1',
      name: 'Puppet show',
      description: '',
      startDate: SAT,
      endDate: SAT,
      types: ['Kid Friendly', 'Theatre'],
      country: 'CZ',
      price: 0,
      link: 'https://example.org/ev1',
      photo_urls: ['https://example.org/p.jpg'],
      photoSources: [{ url: 'https://example.org/p.jpg', sourcePage: 'https://example.org/ev1', credit: 'X' }],
      location: new Location(PRAGUE.locLat + 0.003, PRAGUE.locLon),
      venue: 'Theatre',
      address: 'Street 1',
      origin: 'curated',
      sourceName: 'test',
      startTime: '15:00',
      endTime: '16:00',
    }),
  ],
  travelMatrix: async () => [],
  kidContent: async (a) => ({
    kidText: { attractionId: a.id, text: `Kids text ${a.id}`, sourceUrl: 'https://simple.wikipedia.org', sourceTitle: a.name },
    funFact: { attractionId: a.id, text: `Fact ${a.id}`, sourceUrl: 'https://en.wikipedia.org', sourceTitle: a.name },
  }),
};

test('generateTrip: family weekend in Prague', async () => {
  const steps: string[] = [];
  const trip = await generateTrip(
    {
      startingPoint: 'Prague',
      endingPoint: '',
      numAdults: 2,
      numKids: 2,
      types: ['History', 'Kid Friendly'],
      startDate: new Date(2026, 9, 16),
      endDate: new Date(2026, 9, 18),
      withEvents: true,
      kidFriendly: false,
      mode: MODE_CAR,
      dayStart: H(9),
      dayEnd: H(20),
      mustSee: [fakeAttraction('must', 0.02, 3.0, 'Museums')],
      mustDo: [],
      lang: 'en',
      ownerId: 'u1',
      people: ['u1'],
    },
    providers,
    (s) => steps.push(s),
  );
  assert.equal(trip.itinerary.length, 3);
  assert.deepEqual(steps, ['geocode', 'attractions', 'events', 'food', 'routes', 'kids']);
  const all = trip.itinerary.flatMap((d) => d.attractions.map((a) => a.id));
  assert.equal(new Set(all).size, all.length, 'no attraction repeats');
  assert.ok(!all.includes('bar'), 'no bars on a family trip');
  assert.ok(all.includes('must'), 'must-see is included');
  const saturday = trip.itinerary[1];
  assert.ok(saturday.events.some((e) => e.id === 'ev1'), 'event lands on its own day');
  assert.equal(saturday.slots.find((s) => s.refId === 'ev1')?.start, H(15));
  assert.equal(trip.itinerary[2].hotel, null, 'no hotel on the last day');
  assert.ok(trip.itinerary[0].hotel);
  assert.ok(trip.itinerary.every((d) => d.kidTexts.length === d.attractions.length));
  // Round-trips JSON for Firestore.
  const copy = (await import('../src/models')).Trip.fromJSON(JSON.parse(JSON.stringify(trip.toJSON())));
  assert.equal(copy.itinerary[1].slots.length, saturday.slots.length);
});

test('generateTrip: unknown city and bad dates are reported clearly', async () => {
  const base = {
    startingPoint: 'Nowhere-ville',
    endingPoint: '',
    numAdults: 1,
    numKids: 0,
    types: [],
    startDate: SAT,
    endDate: SAT,
    withEvents: false,
    kidFriendly: false,
    mode: MODE_CAR,
    dayStart: H(9),
    dayEnd: H(20),
    mustSee: [],
    mustDo: [],
    lang: 'en' as const,
    ownerId: 'u',
    people: [],
  };
  await assert.rejects(generateTrip(base, providers), (e: { code?: string }) => e.code === 'city');
  await assert.rejects(
    generateTrip({ ...base, startingPoint: 'Prague', endDate: new Date(2026, 9, 10) }, providers),
    (e: { code?: string }) => e.code === 'dates',
  );
});

test('eventTiming: short shows are fixed, long opening windows are drop-in', () => {
  const mk = (s?: string, e?: string) =>
    ({ name: '', venue: '', description: '', startTime: s, endTime: e } as unknown as Event);
  assert.deepEqual(eventTiming(mk('19:00', '21:00'), H(8), H(22)), { fixed: { start: H(19), end: H(21) } });
  const w = eventTiming(mk('19:00', '23:59'), H(8), H(22));
  assert.ok('window' in w && w.duration === 120);
  const all = eventTiming(mk(), H(8), H(22));
  assert.ok('window' in all && all.window.start === H(8));
});

test('eventTiming: a theme park or film park day ticket is a long visit in opening hours, with lunch there', () => {
  const ev = (name: string, venue = '', s?: string, e?: string) => ({ name, venue, description: '', startTime: s, endTime: e }) as unknown as Event;
  const film = eventTiming(ev('Filmpark Babelsberg - Tagesticket', 'Filmpark Babelsberg'), H(8), H(20));
  assert.ok('window' in film && film.duration >= 240 && film.window.start >= H(10) && film.foodOnSite, JSON.stringify(film));
  const zoo = eventTiming(ev('Zoo Berlin – Eintritt', 'Zoologischer Garten'), H(8), H(20));
  assert.ok('window' in zoo && zoo.duration === 180 && zoo.foodOnSite);
  const hours = eventTiming(ev('Europa-Park', '', '09:00', '18:00'), H(8), H(20));
  assert.ok('window' in hours && hours.duration === 300, 'its opening hours are a window, not a 9-hour show');
  const opens = eventTiming(ev('Movie Park Germany day ticket', '', '10:00'), H(8), H(20));
  assert.ok('window' in opens && opens.window.start === H(10) && opens.duration === 300);
  const concert = eventTiming(ev('Rammstein', 'Olympiastadion', '20:00'), H(8), H(23));
  assert.deepEqual(concert, { fixed: { start: H(20), end: H(22) } }, 'a concert is still a show');
});

test('generateTrip: a long stay in one city asks for more places and fills every day', async () => {
  const asked: number[] = [];
  const cats = ['Museums', 'Castles', 'Gardens', 'Churches & Cathedrals', 'Bridges', 'Markets'];
  const many: PlannerProviders = {
    ...providers,
    attractionsNear: async (_loc, _lang, _r, want = 10) => {
      asked.push(want);
      // Spread on a grid around the centre, like a real city.
      return Array.from({ length: want }, (_, i) =>
        fakeAttraction(`a${i}`, ((i % 6) - 3) * 0.006, 4.0 + (i % 5) / 10, cats[i % cats.length]),
      ).map((a, i) => {
        a.location = new Location(a.location.locLat, PRAGUE.locLon + (Math.floor(i / 6) - 3) * 0.008);
        return a;
      });
    },
    restaurantsNear: async () =>
      ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map((id, i) => new Restaurant(id, `Restaurant ${id}`, '', [], `https://ta/${id}`, new Location(PRAGUE.locLat + i * 0.002, PRAGUE.locLon), [])),
    eventsNear: async () => [],
  };
  const trip = await generateTrip(
    {
      startingPoint: 'Prague',
      endingPoint: 'Prague',
      numAdults: 2,
      numKids: 0,
      types: ['History'],
      startDate: new Date(2026, 9, 12),
      endDate: new Date(2026, 9, 16),
      withEvents: false,
      kidFriendly: false,
      mode: MODE_CAR,
      dayStart: H(9),
      dayEnd: H(20),
      mustSee: [],
      mustDo: [],
      lang: 'en',
      ownerId: 'u1',
      people: ['u1'],
    },
    many,
  );
  assert.deepEqual(asked, [60], 'one search for the city (Tripadvisor + Wikidata together)');
  assert.equal(trip.itinerary.length, 5);
  for (const d of trip.itinerary) assert.ok(d.attractions.length >= 3, `day ${d.id} has ${d.attractions.length} attractions`);
  const all = trip.itinerary.flatMap((d) => d.attractions.map((a) => a.id));
  assert.equal(new Set(all).size, all.length, 'no attraction repeats');
  // Only 6 restaurants for 10 meals: they repeat rather than leaving people hungry.
  for (const d of trip.itinerary) {
    const meals = d.slots.filter((s) => s.kind === 'restaurant').map((s) => s.meal);
    assert.deepEqual(meals, ['lunch', 'dinner'], `day ${d.id} meals`);
  }
});

test('hotels: one search per stay; best rated wins, the cheaper one on a tie; JSON keeps price and links', async () => {
  const { groupStays, pickHotel } = await import('../src/planner/generator');
  const cell = (l: Location) => `${Math.round(l.locLat * 20)}:${Math.round(l.locLon * 20)}`;
  const brno = new Location(49.1951, 16.6068);
  assert.deepEqual(groupStays([PRAGUE, PRAGUE, brno, brno, PRAGUE], cell), [
    { first: 0, last: 1 },
    { first: 2, last: 3 },
    { first: 4, last: 4 },
  ]);
  const mk = (id: string, rating: number, price: number | null) =>
    new Hotel(id, id, '', [], price, 'https://www.agoda.com/x', PRAGUE.locLat, PRAGUE.locLon, '', [], rating, 'EUR', 'agoda', 'https://www.booking.com/y', 'agoda');
  assert.equal(pickHotel([mk('a', 4.5, 200), mk('b', 4.55, 120), mk('c', 4.2, 60)])?.id, 'b');
  assert.equal(pickHotel([mk('a', 4.9, 300), mk('b', 4.5, 100)])?.id, 'a');
  assert.equal(pickHotel([]), null);
  const back = Hotel.fromJSON(JSON.parse(JSON.stringify(mk('a', 4.5, 99).toJSON())));
  assert.equal(back.price, 99);
  assert.equal(back.currency, 'EUR');
  assert.equal(back.bookingVia, 'agoda');
  assert.equal(back.linkToBookingCom, 'https://www.booking.com/y');
  // Trips saved before this change (no source fields) still load.
  const old = Hotel.fromJSON({ id: 'o', name: 'Old', description: '', photos: [], photoSources: [], price: null, linkToBooking: 'https://www.booking.com/z', linkToListing: '', locLat: 1, locLon: 2 });
  assert.equal(old.bookingVia, 'booking.com');
  assert.equal(old.linkToBookingCom, 'https://www.booking.com/z');
});

test('generateTrip: consecutive nights in one place are one hotel search covering all of them', async () => {
  const calls: Array<{ lat: string; checkIn: string; checkOut: string }> = [];
  const base = cityProviders();
  const p: PlannerProviders = {
    ...base,
    hotelsNear: async (l, _lang, s) => {
      calls.push({ lat: l.locLat.toFixed(3), checkIn: s.checkIn.toDateString(), checkOut: s.checkOut.toDateString() });
      return [new Hotel('h1', 'Hotel One', '', [], 180, 'https://www.agoda.com/h1', l.locLat, l.locLon, '', [], 4.5, 'EUR', 'agoda', '', 'agoda')];
    },
  };
  const trip = await generateTrip({ ...baseReq, startingPoint: 'Prague', endingPoint: 'Athens', startDate: new Date(2026, 9, 16), endDate: new Date(2026, 9, 25) }, p);
  // Stays = runs of consecutive nights in the same place (the last night is at home).
  const nights = trip.itinerary.slice(0, -1).map((d) => d.anchorName);
  const stays = nights.filter((n, i) => i === 0 || nights[i - 1] !== n).length;
  assert.equal(calls.length, stays, `${nights.join(', ')}`);
  let night = 0;
  for (const c of calls) {
    const name = nights[night];
    let last = night;
    while (last + 1 < nights.length && nights[last + 1] === name) last++;
    assert.equal(c.checkIn, new Date(2026, 9, 16 + night).toDateString());
    assert.equal(c.checkOut, new Date(2026, 9, 17 + last).toDateString(), `${name}: one booking for all its nights`);
    night = last + 1;
  }
  assert.equal(trip.itinerary[0].hotel?.price, 180);
  assert.equal(trip.itinerary[trip.itinerary.length - 1].hotel, null);
});

/* ---------------- multi-city trips (the greedy route, src/planner/route.ts) ---------------- */

const CITY_COORDS: Record<string, [number, number]> = { prague: [50.088, 14.421], athens: [37.984, 23.728], zagreb: [45.815, 15.982], split: [43.508, 16.44] };

/** Every place gets a few attractions of its own, the best rated 9.4 down to 7.2. */
function cityProviders(extra: Partial<PlannerProviders> = {}): PlannerProviders & { asked: Array<{ lat: number; landmarks: boolean }> } {
  const asked: Array<{ lat: number; landmarks: boolean }> = [];
  return {
    asked,
    geocode: async (q) => {
      const c = CITY_COORDS[q.toLowerCase()];
      return c ? { location: new Location(c[0], c[1]), name: q, country: 'XX' } : null;
    },
    route: async () => null,
    placeName: async () => '',
    attractionsNear: async (loc, _lang, _r, _want, _needs, opts) => {
      asked.push({ lat: loc.locLat, landmarks: !!opts?.landmarks });
      if (opts?.landmarks) return [];
      const key = `${loc.locLat.toFixed(2)}_${loc.locLon.toFixed(2)}`;
      return [9.4, 9.1, 8.6, 8.0, 7.6, 7.2].map((pop, i) => {
        const a = new Attraction(`${key}-${i}`, `Sight ${i} @${key}`, '', ['History'], 'XX', null, 'https://x', [], new Location(loc.locLat + i * 0.004, loc.locLon), [], [], undefined, undefined, undefined, 'Castles', 60);
        a.popularity = pop;
        a.kind = 'castle';
        return a;
      });
    },
    restaurantsNear: async (loc) => ['a', 'b', 'c', 'd'].map((id, i) => new Restaurant(`${loc.locLat}-${id}`, `R ${id}`, '', [], 'https://r', new Location(loc.locLat + i * 0.002, loc.locLon), [])),
    hotelsNear: async (loc) => [new Hotel(`h-${loc.locLat.toFixed(2)}`, 'Hotel', '', [], null, 'https://b', loc.locLat, loc.locLon, '', [], 4.5)],
    eventsNear: async () => [],
    travelMatrix: async () => [],
    ...extra,
  };
}

const baseReq = {
  numAdults: 2, numKids: 0, types: ['History' as const], withEvents: false, kidFriendly: false, mode: MODE_CAR, dayStart: H(9), dayEnd: H(19),
  mustSee: [], mustDo: [], lang: 'en' as const, ownerId: 'u', people: [],
};

test('generateTrip: Prague → Athens in 10 days goes city by city, ≤ 4 days each, ends in Athens', async () => {
  const p = cityProviders();
  const trip = await generateTrip({ ...baseReq, startingPoint: 'Prague', endingPoint: 'Athens', startDate: new Date(2027, 6, 1), endDate: new Date(2027, 6, 10) }, p);
  const names = trip.itinerary.map((d) => d.anchorName);
  assert.equal(trip.itinerary.length, 10);
  assert.equal(names[0], 'Prague');
  assert.equal(names[9], 'Athens', names.join(' → '));
  // Consecutive days in one place never exceed 4.
  let run = 1;
  for (let i = 1; i < names.length; i++) {
    run = names[i] === names[i - 1] ? run + 1 : 1;
    assert.ok(run <= 4, names.join(' → '));
  }
  // Each move is at most a day's drive and heads towards Athens.
  for (let i = 1; i < 10; i++) {
    const a = trip.itinerary[i - 1].anchor;
    const b = trip.itinerary[i].anchor;
    assert.ok(haversineKm(a, b) <= 450, `${names[i - 1]} → ${names[i]}`);
    assert.ok(haversineKm(b, new Location(37.984, 23.728)) <= haversineKm(a, new Location(37.984, 23.728)) + 1);
  }
  assert.ok(new Set(names).size >= 4, `several cities: ${names.join(' → ')}`);
  // One hotel search per stay; no hotel on the last night (home).
  assert.equal(trip.itinerary[9].hotel, null);
  assert.ok(trip.itinerary.slice(0, 9).every((d) => d.hotel));
  // Attractions are visited best first, and nothing repeats.
  const all = trip.itinerary.flatMap((d) => d.attractions.map((a) => a.id));
  assert.equal(new Set(all).size, all.length);
  assert.ok(trip.itinerary.every((d) => d.attractions.length > 0), `every day has attractions: ${trip.itinerary.map((d) => `${d.anchorName}:${d.attractions.length}`).join(' ')}`);
  assert.ok(trip.itinerary[0].attractions.some((a) => a.popularity === 9.4), 'the 9.4 place on day 1');
});

test('generateTrip: a world-class landmark on the way becomes a stop of its own (Zagreb → Split via Plitvice)', async () => {
  const plitvice = new Attraction('wd-Q190165', 'Plitvice Lakes National Park', '', ['Nature'], 'HR', null, 'https://en.wikipedia.org/wiki/Plitvice_Lakes_National_Park', [], new Location(44.88, 15.62), []);
  plitvice.popularity = 9.6;
  plitvice.kind = 'nationalpark';
  const base = cityProviders();
  const p: PlannerProviders = {
    ...base,
    attractionsNear: async (loc, lang, r, want, needs, opts) => (opts?.landmarks ? [plitvice] : base.attractionsNear(loc, lang, r, want, needs, opts)),
  };
  const trip = await generateTrip({ ...baseReq, types: [], startingPoint: 'Zagreb', endingPoint: 'Split', startDate: new Date(2027, 6, 1), endDate: new Date(2027, 6, 6) }, p);
  const names = trip.itinerary.map((d) => d.anchorName);
  assert.ok(names.includes('Plitvice Lakes National Park'), names.join(' → '));
  assert.equal(names[names.length - 1], 'Split');
});

test('generateTrip: trips can be up to 30 days', async () => {
  const p = cityProviders();
  const req = { ...baseReq, startingPoint: 'Prague', endingPoint: '', startDate: new Date(2027, 6, 1) };
  await assert.rejects(generateTrip({ ...req, endDate: new Date(2027, 6, 31) }, p), (e: { code?: string }) => e.code === 'tooLong');
  const trip = await generateTrip({ ...req, endDate: new Date(2027, 6, 30) }, p);
  assert.equal(trip.itinerary.length, 30);
  assert.equal(trip.itinerary[29].anchorName, 'Prague', 'a round trip ends where it started');
});

test('generateTrip: each place gets a photo of its most popular sight; AI-made pictures are never used', async () => {
  const base = cityProviders();
  const p: PlannerProviders = {
    ...base,
    attractionsNear: async (loc, lang, r, want, needs, opts) => {
      const list = await base.attractionsNear(loc, lang, r, want, needs, opts);
      list.forEach((a, i) => {
        const file = i === 0 ? 'Prague_skyline_AI-generated.jpg' : `Real_photo_${i}.jpg`;
        a.photo_urls = [`https://upload.wikimedia.org/x/${file}`];
        a.photoSources = [{ url: a.photo_urls[0], sourcePage: `https://commons.wikimedia.org/wiki/File:${file}`, credit: `Author ${i} · CC BY-SA 4.0 · Wikimedia Commons` }];
      });
      return list;
    },
  };
  const trip = await generateTrip({ ...baseReq, startingPoint: 'Prague', endingPoint: 'Athens', startDate: new Date(2027, 6, 1), endDate: new Date(2027, 6, 5) }, p);
  for (const d of trip.itinerary) {
    assert.ok(d.placePhoto, `day ${d.id} has a photo`);
    assert.ok(!/AI-generated/i.test(d.placePhoto!.url), 'the AI-made picture is skipped');
    assert.match(d.placePhoto!.url, /Real_photo_1/, 'the most popular sight with a real photo (9.1)');
    assert.match(d.placePhoto!.credit, /Wikimedia Commons/);
  }
  const copy = (await import('../src/models')).Trip.fromJSON(JSON.parse(JSON.stringify(trip.toJSON())));
  assert.deepEqual(copy.itinerary[0].placePhoto, trip.itinerary[0].placePhoto, 'saved with the trip');
});
