import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Attraction, Event, Hotel, Location, MODE_CAR, Restaurant, WeeklyHours } from '../src/models';
import { PlannerError, PlannerProviders, generateTrip } from '../src/planner/generator';
import { BackupRow, mergeWithBackup, popularityFromSitelinks, rowToJSON, rowsNear, toRow } from '../src/planner/backupAttractions';
import { localPlaceMatches, mergePlaceSuggestions } from '../src/planner/places';

const PRAGUE = new Location(50.0875, 14.4213);
const H = (h: number, m = 0) => h * 60 + m;
const allWeek = (open: number, close: number): WeeklyHours => Array.from({ length: 7 }, () => [{ open, close }]);

function ev(id: string, name: string, day: Date, start?: string, end?: string, types: Event['types'] = ['Festival']): Event {
  return new Event({
    id, name, description: '', startDate: day, endDate: day, types, country: 'CZ', price: null, link: `https://example.org/${id}`,
    photo_urls: ['https://example.org/p.jpg'], photoSources: [{ url: 'https://example.org/p.jpg', sourcePage: 'https://example.org', credit: 'x' }],
    location: new Location(PRAGUE.locLat + 0.004, PRAGUE.locLon), venue: 'Venue', address: 'Street', origin: 'curated', sourceName: 't', startTime: start, endTime: end,
  });
}

function sight(id: string, pop: number, i: number): Attraction {
  const a = new Attraction(id, `Sight ${id}`, '', ['History'], 'CZ', null, 'https://x', [], new Location(PRAGUE.locLat + i * 0.003, PRAGUE.locLon + 0.002), [], [], allWeek(H(9), H(18)), undefined, undefined, 'Castles', 60);
  a.popularity = pop;
  a.kind = 'castle';
  return a;
}

function providers(extra: Partial<PlannerProviders> = {}): PlannerProviders & { geocoded: string[] } {
  const geocoded: string[] = [];
  return {
    geocoded,
    geocode: async (q) => {
      geocoded.push(q);
      return /prague|פראג|прага/i.test(q) ? { location: PRAGUE, name: 'Prague', country: 'CZ' } : null;
    },
    route: async () => null,
    placeName: async () => 'Prague',
    attractionsNear: async () => [],
    restaurantsNear: async (loc) => [
      new Restaurant('beer-baths', 'Beer Baths Letna', '', [], 'https://r', new Location(loc.locLat + 0.001, loc.locLon), []),
      new Restaurant('brewing', 'Czech Brewing School', '', [], 'https://r', new Location(loc.locLat + 0.002, loc.locLon), []),
      ...['a', 'b', 'c', 'd'].map((id, i) => new Restaurant(`r-${id}`, `Restaurant ${id}`, '', [], 'https://r', new Location(loc.locLat + 0.003 * (i + 1), loc.locLon), [])),
    ],
    hotelsNear: async (loc) => [new Hotel('h', 'Hotel', '', [], null, 'https://b', loc.locLat, loc.locLon, '', [], 4.5)],
    eventsNear: async () => [],
    travelMatrix: async () => [],
    ...extra,
  };
}

const req = {
  startingPoint: 'Prague', endingPoint: '', numAdults: 2, numKids: 0, types: ['History' as const], withEvents: true, kidFriendly: false, mode: MODE_CAR,
  dayStart: H(9), dayEnd: H(20), mustSee: [], mustDo: [], lang: 'en' as const, ownerId: 'u', people: [],
  startDate: new Date(2026, 9, 18), endDate: new Date(2026, 9, 20),
};

test('no sights from any source: the trip stays in Prague (not "Day 2 – Vienna") and says why', async () => {
  const hockey = ev('hockey', 'HC Sparta Praha x HC Oceláři Třinec', new Date(2026, 9, 20), '16:00', '18:00');
  const trip = await generateTrip(req, providers({ eventsNear: async () => [hockey] }));
  assert.deepEqual(trip.itinerary.map((d) => d.anchorName), ['Prague', 'Prague', 'Prague'], 'no 4-hour drive to Vienna for lack of data');
  assert.ok(trip.notes.includes('noAttractions'));
  const meals = trip.itinerary.flatMap((d) => d.restaurants.map((r) => r.name));
  assert.ok(!meals.some((m) => /Beer Baths|Brewing School/.test(m)), `not a meal: ${meals.join(', ')}`);
});

test('no sights and events turned off: a clear "no sights" error instead of an empty plan', async () => {
  await assert.rejects(
    generateTrip({ ...req, withEvents: false }, providers()),
    (e: unknown) => e instanceof PlannerError && e.code === 'noAttractions' && (e.params as { city: string }).city === 'Prague',
  );
});

test('attractions come before events: sights fill the day, at most one timed event', async () => {
  const day = new Date(2026, 9, 18);
  const sights = Array.from({ length: 10 }, (_, i) => sight(`s${i}`, 9.5 - i * 0.2, i));
  const events = [
    ev('fair', 'All-day fair', day), // drop-in
    ev('market', 'Craft market', day),
    ev('noon', 'Noon concert', day, '12:00', '13:30'),
    ev('show', 'Afternoon show', day, '15:00', '16:30'),
    ev('eve', 'Evening concert', day, '19:00', '20:00'),
  ];
  const trip = await generateTrip(
    { ...req, endDate: day, types: ['History'] },
    providers({ attractionsNear: async () => sights, eventsNear: async () => events }),
  );
  const d = trip.itinerary[0];
  assert.ok(d.attractions.length >= 4, `sights: ${d.attractions.map((a) => a.id)}`);
  assert.ok(d.attractions.some((a) => a.id === 's0'), 'the best sight is in');
  const timed = d.events.filter((e) => e.startTime);
  assert.ok(timed.length <= 1, `timed events: ${timed.map((e) => e.id)}`);
  assert.ok(!timed.some((e) => e.id === 'noon' || e.id === 'show'), 'the one kept is in the evening, not in prime sightseeing hours');
});

test('a place picked from the suggestions is used as is (typed in Hebrew, never looked up again)', async () => {
  const p = providers({ attractionsNear: async () => [sight('s1', 9.2, 1), sight('s2', 8.4, 2)] });
  const trip = await generateTrip({ ...req, startingPoint: 'פראג', startPick: { name: 'פראג', location: PRAGUE, country: 'CZ' }, withEvents: false }, p);
  assert.equal(p.geocoded.length, 0);
  assert.equal(trip.itinerary[0].anchorName, 'פראג');
  assert.ok(trip.itinerary[0].attractions.length > 0);
});

const ROW: BackupRow = [
  'Q130206', 'Prague Castle', 'מצודת פראג', 'Пражский Град', 50.0911, 14.4016, 120, 'castle', 'Prague Castle.jpg',
  'https://en.wikipedia.org/wiki/Prague_Castle', 'https://he.wikipedia.org/wiki/x', '', 'CZ', 'Jane', 'CC BY-SA 4.0', 'castle complex in Prague',
];

test('the list on the phone: rows become attractions in the reader’s language, with credited photos', () => {
  const he = rowToJSON(ROW, 'he');
  assert.equal(he.id, 'wd-Q130206');
  assert.equal(he.name, 'מצודת פראג');
  assert.equal(he.link, 'https://he.wikipedia.org/wiki/x');
  const ru = rowToJSON(ROW, 'ru');
  assert.equal(ru.name, 'Пражский Град');
  assert.equal(ru.link, 'https://en.wikipedia.org/wiki/Prague_Castle', 'no Russian article → the English one');
  assert.equal(he.popularity, popularityFromSitelinks(120));
  assert.ok((he.popularity ?? 0) >= 9.5);
  assert.equal(he.photoSources![0].credit, 'Jane · CC BY-SA 4.0 · Wikimedia Commons');
  assert.match(he.photo_urls[0], /Special:FilePath\/Prague_Castle\.jpg/);
  assert.deepEqual(toRow({ qid: 'Q1', name: 'A', lat: 1.234567, lon: 2, sitelinks: 3, kind: 'museum', names: { he: 'א' } }).slice(0, 7), ['Q1', 'A', 'א', '', 1.23457, 2, 3]);
  const far: BackupRow = [...ROW] as BackupRow;
  far[0] = 'Q2';
  far[4] = 48.2;
  const near = rowsNear([far, ROW], PRAGUE, 12, 'en');
  assert.deepEqual(near.map((a) => a.id), ['wd-Q130206'], 'only within the radius');
});

test('the list on the phone completes the server answer without repeating a place', () => {
  const server = [sight('ta-1', 9.0, 0)];
  server[0].wikidataId = 'Q130206';
  const fromPhone = rowsNear([ROW], PRAGUE, 12, 'en');
  const twin = new Attraction('wd-Q99', 'Sight ta-1', '', [], 'CZ', null, 'https://x', [], server[0].location, []);
  const extra = new Attraction('wd-Q5', 'Vyšehrad', '', [], 'CZ', null, 'https://x', [], new Location(50.0644, 14.4183), []);
  extra.popularity = 8.6;
  const merged = mergeWithBackup(server, [...fromPhone, twin, extra]);
  assert.deepEqual(merged.map((a) => a.id), ['ta-1', 'wd-Q5'], 'same Wikidata item and same name nearby are one place');
  assert.deepEqual(mergeWithBackup([], fromPhone).map((a) => a.id), ['wd-Q130206'], 'server down: the phone’s list alone');
});

test('place suggestions: big cities at once, biggest first; one entry per place', () => {
  assert.equal(localPlaceMatches('pra')[0].name, 'Prague');
  assert.equal(localPlaceMatches('tel')[0].name, 'Tel Aviv');
  assert.equal(localPlaceMatches('פראג').length, 0, 'Hebrew comes from the server');
  assert.equal(localPlaceMatches('p').length, 0);
  const s = (name: string, lat: number) => ({ name, detail: '', lat, lon: 14.42, country: 'CZ' });
  assert.deepEqual(mergePlaceSuggestions([s('פראג', 50.08)], [s('Prague', 50.088), s('Brno', 49.19)]).map((x) => x.name), ['פראג', 'Brno']);
});

test('the list on the phone stays small: Wikipedia links kept as titles and rebuilt', () => {
  const row = toRow({
    qid: 'Q130206', name: 'Prague Castle', lat: 50.09, lon: 14.4, sitelinks: 120, kind: 'castle',
    articles: { en: 'https://en.wikipedia.org/wiki/Prague_Castle', he: 'https://he.wikipedia.org/wiki/%D7%9E%D7%A6%D7%95%D7%93%D7%AA_%D7%A4%D7%A8%D7%90%D7%92' },
  });
  assert.equal(row[9], 'Prague Castle');
  assert.equal(row[10], 'מצודת פראג');
  assert.equal(rowToJSON(row, 'he').link, 'https://he.wikipedia.org/wiki/%D7%9E%D7%A6%D7%95%D7%93%D7%AA_%D7%A4%D7%A8%D7%90%D7%92');
  assert.equal(rowToJSON(row, 'ru').link, 'https://en.wikipedia.org/wiki/Prague_Castle');
  assert.ok(JSON.stringify(row).length < 200, `compact: ${JSON.stringify(row).length} bytes`);
});
