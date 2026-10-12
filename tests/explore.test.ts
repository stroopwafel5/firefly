import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Attraction, Hotel, Location, MODE_CAR, Restaurant, WeeklyHours } from '../src/models';
import { classify } from '../src/planner/classify';
import { PlannerProviders, TripRequest, generateTrip } from '../src/planner/generator';
import { toMinutes } from '../src/planner/time';

const H = (h: number) => h * 60;
const week: WeeklyHours = Array.from({ length: 7 }, () => [{ open: H(8), close: H(18) }]);
let n = 0;
function sights(at: Location, count: number, pop = 9.2): Attraction[] {
  return Array.from({ length: count }, (_, i) => {
    const c = classify('Points of Interest & Landmarks');
    const a = new Attraction(`s${n++}`, `Sight ${n}`, '', c.types, '', null, 'https://x', [], new Location(at.locLat + (i % 5) * 0.004, at.locLon + Math.floor(i / 5) * 0.004), [], [], week, 4.5, 300, 'Landmarks', 60);
    a.popularity = pop - (i % 10) * 0.1;
    return a;
  });
}
function providers(at: Record<string, [number, number, string]>, near: (loc: Location, radius: number) => Attraction[]): PlannerProviders {
  return {
    geocode: async (q) => {
      const c = at[q.toLowerCase()];
      return c ? { location: new Location(c[0], c[1]), name: q, country: c[2] } : null;
    },
    route: async () => null,
    placeName: async () => '',
    attractionsNear: async (loc, _l, radius, _w, _n, o) => (o?.landmarks ? [] : near(loc, radius)),
    restaurantsNear: async (loc) => ['a', 'b', 'c'].map((id, i) => new Restaurant(`r${n++}`, `R ${id}`, '', [], 'https://r', new Location(loc.locLat + i * 0.002, loc.locLon), [])),
    hotelsNear: async (loc) => [new Hotel(`h${n++}`, 'Hotel', '', [], null, 'https://b', loc.locLat, loc.locLon, '', [], 4.5)],
    eventsNear: async () => [],
    travelMatrix: async () => [],
  };
}
const req = (start: string, days: number): TripRequest => ({
  startingPoint: start, endingPoint: '', numAdults: 2, numKids: 0, types: ['History'], withEvents: false, kidFriendly: false, mode: MODE_CAR,
  dayStart: H(9), dayEnd: H(19), mustSee: [], mustDo: [], lang: 'en', ownerId: 'u', people: ['u'], startDate: new Date(2026, 10, 2), endDate: new Date(2026, 10, 1 + days),
});

test('two weeks around Vientiane explore Laos (Vang Vieng, Luang Prabang…), not 14 days in one city', async () => {
  const trip = await generateTrip(req('Vientiane', 14), providers({ vientiane: [17.966, 102.6, 'LA'] }, (loc) => sights(loc, 12)));
  const places = new Set(trip.itinerary.map((d) => d.anchorName));
  assert.ok(places.size >= 3, [...places].join(', '));
  assert.ok(places.has('Vang Vieng') || places.has('Luang Prabang'), [...places].join(', '));
  const lao = ['Vientiane', 'Vang Vieng', 'Luang Prabang', 'Nong Khiaw', 'Luang Namtha', 'Thakhek', 'Savannakhet', 'Pakse'];
  assert.ok([...places].every((p) => lao.includes(p)), `stays in Laos: ${[...places].join(', ')}`);
});

test('a stop with hardly any sights is passed over for the next best', async () => {
  // Only Vang Vieng has nothing good; the trip goes elsewhere instead.
  const thin = new Location(18.923, 102.448);
  const trip = await generateTrip(
    req('Vientiane', 10),
    providers({ vientiane: [17.966, 102.6, 'LA'] }, (loc) => (Math.abs(loc.locLat - thin.locLat) < 0.05 ? sights(loc, 2, 6.0) : sights(loc, 12))),
  );
  assert.ok(!trip.itinerary.some((d) => d.anchorName === 'Vang Vieng'), trip.itinerary.map((d) => d.anchorName).join(' → '));
});

test('nowhere new within reach: the area around the place is explored instead of days with only meals', async () => {
  // A made-up island far from every town on the list: only its own 5 sights, and more 35 km around.
  const home = new Location(-30, -140);
  const trip = await generateTrip(
    req('Island', 6),
    providers({ island: [-30, -140, 'XX'] }, (loc) => (Math.abs(loc.locLat - home.locLat) < 0.01 && Math.abs(loc.locLon - home.locLon) < 0.01 ? sights(loc, 5) : sights(loc, 6, 8.5))),
  );
  const counts = trip.itinerary.map((d) => d.attractions.length);
  assert.ok(counts.slice(0, 5).every((c) => c > 0), counts.join(','));
  const far = trip.itinerary.flatMap((d) => d.attractions).filter((a) => Math.abs(a.location.locLat - home.locLat) > 0.2 || Math.abs(a.location.locLon - home.locLon) > 0.2);
  assert.ok(far.length > 0, 'sights from around the place');
});

test('a town added under must-see becomes a stop on the route; one too far for the days available is left out', async () => {
  const p = providers({ vientiane: [17.966, 102.6, 'LA'] }, (loc) => sights(loc, 12));
  const pakse = { name: 'Pakse', location: new Location(15.12, 105.799), country: 'LA' };
  const tbilisi = { name: 'Tbilisi', location: new Location(41.69, 44.83), country: 'GE' };
  const trip = await generateTrip({ ...req('Vientiane', 8), mustStops: [pakse, tbilisi] }, p);
  const names = trip.itinerary.map((d) => d.anchorName);
  assert.ok(trip.itinerary.some((d) => Math.hypot(d.anchor.locLat - 15.12, d.anchor.locLon - 105.799) < 0.4), names.join(' → '));
  assert.equal(names[names.length - 1], 'Vientiane', 'and back in time');
  assert.ok(!names.includes('Tbilisi'));
});

test('exploring around in circles: 35 km (or 8.5+ within 50), then 50 (or 85), then 85 (or 100) — each only when the last is used up', async () => {
  const home = new Location(-30, -140);
  const { offsetKm, haversineKm } = await import('../src/planner/geo');
  const world: Attraction[] = [];
  const put = (tag: string, km: number, pop: number, count = 3) => {
    for (let k = 0; k < count; k++) {
      const a = sights(offsetKm(home, km, 40 + k * 110), 1, pop)[0];
      a.name = `${tag}-${k}`;
      a.popularity = pop;
      world.push(a);
    }
  };
  put('home', 0.5, 9, 4);
  put('c1-near', 30, 7.5);
  put('c1-top', 45, 9);
  put('c2-near', 45, 7.5);
  put('c2-top', 70, 9);
  put('c3-near', 70, 7.5);
  put('c3-top', 95, 9);
  put('never', 97, 7.5);
  const near = (loc: Location, radius: number) => world.filter((a) => haversineKm(loc, a.location) <= radius);
  const used = async (days: number) => {
    const trip = await generateTrip(req('Island', days), providers({ island: [-30, -140, 'XX'] }, near));
    return trip.itinerary.flatMap((d) => d.attractions.map((a) => a.name.split('-').slice(0, 2).join('-')));
  };
  const short = await used(2);
  assert.ok(!short.some((n) => n.startsWith('c2') || n.startsWith('c3')), `two days: home and circle 1 at most (${short.join(', ')})`);
  const long = await used(10);
  for (const tag of ['c1-near', 'c1-top', 'c2-near', 'c2-top', 'c3-near', 'c3-top']) assert.ok(long.includes(tag), `${tag} in ${long.join(', ')}`);
  assert.ok(!long.includes('never-0'.split('-').slice(0, 2).join('-')), 'a 7.5 sight 97 km away is outside every circle');
  // Circles in order: the first circle-2 sight comes after the last circle-1 day starts.
  const firstC2 = long.findIndex((n) => n.startsWith('c2'));
  const firstC1 = long.findIndex((n) => n.startsWith('c1'));
  assert.ok(firstC1 >= 0 && firstC1 < firstC2, long.join(', '));
});

test('more destinations: visited in the order given (Destination 1, 2…), then the final destination — or back to the start', async () => {
  const { tripEnds } = await import('../src/planner/destinations');
  const pakse = { name: 'Pakse', location: new Location(15.12, 105.799), country: 'LA' };
  const lp = { name: 'Luang Prabang', location: new Location(19.885, 102.135), country: 'LA' };
  // The form: "Destination 1, 2…" (Add more destinations), then "Final destination"; empty fields skipped.
  assert.deepEqual(tripEnds([{ text: 'Pakse', pick: pakse }, { text: '' }], { text: 'Luang Prabang', pick: lp }, false), {
    endingPoint: 'Luang Prabang',
    endPick: lp,
    destinations: [{ text: 'Pakse', pick: pakse }],
  });
  assert.deepEqual(tripEnds([{ text: 'Pakse', pick: pakse }], { text: 'Luang Prabang', pick: lp }, true).destinations.map((d) => d.text), ['Pakse', 'Luang Prabang'], 'coming back: all on the way');
  assert.deepEqual(tripEnds([{ text: 'Pakse', pick: pakse }], { text: ' ' }, false), { endingPoint: '', endPick: undefined, destinations: [{ text: 'Pakse', pick: pakse }] }, 'no final destination = back to the start');
  assert.deepEqual(tripEnds([], { text: '' }, false), { endingPoint: '', endPick: undefined, destinations: [] }, 'nothing = a round trip');

  const p = providers({ vientiane: [17.966, 102.6, 'LA'] }, (loc) => sights(loc, 12));
  const near = (d: { anchor: Location }, at: Location) => Math.hypot(d.anchor.locLat - at.locLat, d.anchor.locLon - at.locLon) < 0.4;
  const order = async (stops: Array<typeof pakse>) => {
    const trip = await generateTrip({ ...req('Vientiane', 12), destinations: stops.map((s) => ({ text: s.name, pick: s })) }, p);
    return { trip, first: stops.map((s) => trip.itinerary.findIndex((d) => near(d, s.location))) };
  };
  const a = await order([pakse, lp]);
  assert.ok(a.first[0] >= 0 && a.first[1] > a.first[0], `Pakse, then Luang Prabang: ${a.trip.itinerary.map((d) => d.anchorName).join(' → ')}`);
  assert.equal(a.trip.itinerary[a.trip.itinerary.length - 1].anchorName, 'Vientiane', 'and back to the start (no ending city)');
  assert.match(a.trip.name, /Vientiane → Pakse → Luang Prabang/);
  const b = await order([lp, pakse]);
  assert.ok(b.first[0] >= 0 && b.first[1] > b.first[0], `Luang Prabang, then Pakse: ${b.trip.itinerary.map((d) => d.anchorName).join(' → ')}`);
});

test('Night Clubs: a night out at a club after the day (from 22:00), never as a daytime sight; not on a family trip', async () => {
  const late: WeeklyHours = Array.from({ length: 7 }, () => [{ open: H(22), close: H(28) }]);
  const withClubs = (loc: Location) => {
    const list = sights(loc, 12);
    for (let k = 0; k < 4; k++) {
      const c = sights(loc, 1, 8.8)[0];
      c.name = `Club ${k}`;
      c.kind = 'nightlife';
      c.category = 'Night club';
      c.weeklyHours = late;
      list.push(c);
    }
    return list;
  };
  const p = providers({ vientiane: [17.966, 102.6, 'LA'] }, withClubs);
  const clubSlots = (trip: Awaited<ReturnType<typeof generateTrip>>) =>
    trip.itinerary.flatMap((d) => d.slots.filter((s) => d.attractions.find((a) => a.id === s.refId)?.kind === 'nightlife').map((s) => ({ s, end: d.end })));
  const night = await generateTrip({ ...req('Vientiane', 3), types: ['History', 'Night Clubs'] }, p);
  const clubs = clubSlots(night);
  assert.ok(clubs.length >= 1, 'a night out');
  for (const { s, end } of clubs) {
    assert.ok(s.start >= H(22), `from 22:00 (${s.start})`);
    assert.ok(s.end <= H(25), 'over by 01:00');
    assert.ok(toMinutes(end) >= s.end, 'the day ends after the night out');
  }
  assert.equal(night.itinerary[night.itinerary.length - 1].attractions.some((a) => a.kind === 'nightlife'), false, 'not on the way-home day');
  assert.equal(clubSlots(await generateTrip(req('Vientiane', 3), p)).length, 0, 'no clubs without Night Clubs');
  assert.equal(clubSlots(await generateTrip({ ...req('Vientiane', 3), types: ['History', 'Night Clubs'], numKids: 1 }, p)).length, 0, 'none with children');
});

test("the traveller's destinations come first: Vienna → Venice → Amsterdam → Grenoble in 28 days visits both, with days in each", async () => {
  const at: Record<string, [number, number, string]> = { vienna: [48.2082, 16.3738, 'AT'], venice: [45.4408, 12.3155, 'IT'], amsterdam: [52.3676, 4.9041, 'NL'], grenoble: [45.1885, 5.7245, 'FR'] };
  const p = providers(at, (loc) => sights(loc, 60));
  const plan = async (days: number) => {
    const trip = await generateTrip(
      { ...req('Vienna', days), endingPoint: 'Grenoble', destinations: [{ text: 'Venice' }, { text: 'Amsterdam' }] },
      p,
    );
    const names = trip.itinerary.map((d) => d.anchorName);
    return { trip, names, count: (n: string) => names.filter((x) => x === n).length };
  };
  const long = await plan(28);
  const route = long.names.join(' → ');
  assert.ok(long.count('Venice') >= 4 && long.count('Amsterdam') >= 4, `days in each destination: ${route}`);
  assert.ok(long.names.indexOf('Venice') < long.names.indexOf('Amsterdam'), `in order: ${route}`);
  assert.equal(long.names[long.names.length - 1], 'Grenoble');
  assert.equal(long.trip.notes.some((n) => n.startsWith('destSkipped:')), false);
  const mid = await plan(14);
  assert.ok(mid.count('Venice') >= 2 && mid.count('Amsterdam') >= 2, `two weeks: ${mid.names.join(' → ')}`);
  // Too few days for everything: the trip says which destination it couldn't fit.
  const short = await plan(6);
  const { skippedDestinations } = await import('../src/planner/generator');
  assert.deepEqual(skippedDestinations(short.trip.notes), ['Amsterdam'], short.names.join(' → '));
  assert.ok(short.names.includes('Venice'));
});

test('a destination is visited only by a day in it, not by passing a town nearby (Venice ≠ Treviso)', async () => {
  // A made-up stop 25 km from Venice on the way from Vienna: the old 40 km rule called Venice "reached" there.
  const at: Record<string, [number, number, string]> = { vienna: [48.2082, 16.3738, 'AT'], venice: [45.4408, 12.3155, 'IT'], milan: [45.4642, 9.19, 'IT'] };
  const p = providers(at, (loc) => sights(loc, 60));
  const trip = await generateTrip({ ...req('Vienna', 10), endingPoint: 'Milan', destinations: [{ text: 'Venice' }] }, p);
  assert.ok(
    trip.itinerary.some((d) => Math.hypot(d.anchor.locLat - 45.4408, d.anchor.locLon - 12.3155) < 0.1),
    trip.itinerary.map((d) => d.anchorName).join(' → '),
  );
});

test('hard-to-enter countries are never a stop on the way: Warsaw → Vilnius never goes through Grodno (Belarus)', async () => {
  const at: Record<string, [number, number, string]> = { warsaw: [52.2297, 21.0122, 'PL'], vilnius: [54.6872, 25.2797, 'LT'], vienna: [48.2082, 16.3738, 'AT'], minsk: [53.9, 27.5667, 'BY'] };
  const p = providers(at, (loc) => sights(loc, 60));
  for (const [from, days] of [['Warsaw', 6], ['Vienna', 8], ['Vienna', 12]] as const) {
    const trip = await generateTrip({ ...req(from, days), endingPoint: 'Vilnius' }, p);
    const names = trip.itinerary.map((d) => d.anchorName);
    assert.ok(!names.some((n) => ['Grodno', 'Hrodna', 'Minsk', 'Brest'].includes(n)), names.join(' → '));
  }
  // …unless the traveller goes there: Vilnius → Minsk is allowed.
  const there = await generateTrip({ ...req('Vilnius', 3), endingPoint: 'Minsk' }, p);
  assert.equal(there.itinerary[there.itinerary.length - 1].anchorName, 'Minsk');
});

test('popular or off the beaten track: smaller towns and less crowded sights first when chosen', async () => {
  const { offbeatScore, offbeatTier, sizeTier, rankOf } = await import('../src/planner/route');
  const city = (name: string, population: number, kind: 'city' | 'town' = 'city') => ({ id: name, name, country: 'PL', location: new Location(50, 20), population, kind });
  assert.ok(sizeTier(city('Warsaw', 1_800_000)) > sizeTier(city('Lublin', 340_000)));
  assert.ok(offbeatTier(city('Lublin', 340_000)) > offbeatTier(city('Warsaw', 1_800_000)));
  assert.ok(offbeatTier(city('Kazimierz Dolny', 3_000, 'town')) > offbeatTier(city('Kraków', 800_000)));
  // The crowds' favourite vs a well-loved place few people know.
  const famous = { popularity: 9.6, numReviews: 120_000 };
  const gem = { popularity: 8.6, numReviews: 400 };
  assert.ok(offbeatScore(gem) > offbeatScore(famous));
  const a = (popularity: number, numReviews: number) => {
    const x = sights(new Location(50, 20), 1)[0];
    x.popularity = popularity;
    x.numReviews = numReviews;
    return x;
  };
  const niche = { types: [], familyTrip: false, needs: [] };
  assert.ok(rankOf(a(9.6, 120_000), niche)[0] > rankOf(a(8.6, 400), niche)[0], 'popular: the famous one first');
  assert.ok(rankOf(a(9.6, 120_000), { ...niche, offbeat: true })[0] < rankOf(a(8.6, 400), { ...niche, offbeat: true })[0], 'off the beaten track: the gem first');
});
