import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Attraction, Event, Hotel, Location, MODE_CAR, Restaurant, WeeklyHours } from '../src/models';
import { ADULT_ONLY, PlannerError, PlannerProviders, eventsQuota, generateTrip, pickDayEvents } from '../src/planner/generator';
import { introduction, wikipediaTitle } from '../src/planner/describe';
import { parseAreaNote } from '../src/planner/safety';

const H = (h: number, m = 0) => h * 60 + m;
const allWeek = (open: number, close: number): WeeklyHours => Array.from({ length: 7 }, () => [{ open, close }]);
const TEL_AVIV = new Location(32.0853, 34.7818);
const JERUSALEM = new Location(31.7767, 35.2345);
const DAY = new Date(2026, 9, 16);

function ev(id: string, name: string, at: Location, start?: string, end?: string, types: Event['types'] = ['Festival'], extra: { description?: string; photo?: boolean } = {}): Event {
  const photo = extra.photo ?? true;
  return new Event({
    id, name, description: extra.description ?? 'An event', startDate: DAY, endDate: DAY, types, country: 'IL', price: null, link: `https://example.org/${id}`,
    photo_urls: photo ? ['https://example.org/p.jpg'] : [], photoSources: photo ? [{ url: 'https://example.org/p.jpg', sourcePage: 'https://example.org', credit: 'x' }] : [],
    location: new Location(at.locLat + 0.004, at.locLon), venue: 'Venue', address: 'Street', origin: 'curated', sourceName: 't', startTime: start, endTime: end,
  });
}

function sight(id: string, pop: number, i: number, at = TEL_AVIV, extra: Partial<Attraction> = {}): Attraction {
  const a = new Attraction(id, `Sight ${id}`, extra.description ?? '', ['History'], 'IL', null, 'https://x', [], new Location(at.locLat + i * 0.003, at.locLon + 0.002), [], [], allWeek(H(9), H(18)), undefined, undefined, 'Museums', 60);
  a.popularity = pop;
  a.kind = 'museum';
  Object.assign(a, extra);
  return a;
}

function providers(extra: Partial<PlannerProviders> = {}): PlannerProviders {
  return {
    geocode: async (q) =>
      /jerusalem/i.test(q) ? { location: JERUSALEM, name: 'Jerusalem', country: 'IL' } : /gaza/i.test(q) ? { location: new Location(31.5017, 34.4668), name: 'Gaza', country: 'PS' } : { location: TEL_AVIV, name: 'Tel Aviv', country: 'IL' },
    route: async () => null,
    placeName: async () => 'Tel Aviv',
    attractionsNear: async () => [],
    restaurantsNear: async (loc) => ['a', 'b', 'c', 'd'].map((id, i) => new Restaurant(`r-${id}`, `Restaurant ${id}`, '', [], 'https://r', new Location(loc.locLat + 0.002 * (i + 1), loc.locLon), [])),
    hotelsNear: async (loc) => [new Hotel('h', 'Hotel', '', [], null, 'https://b', loc.locLat, loc.locLon, '', [], 4.5)],
    eventsNear: async () => [],
    travelMatrix: async () => [],
    ...extra,
  };
}

const req = {
  startingPoint: 'Tel Aviv', endingPoint: '', numAdults: 2, numKids: 0, types: ['History' as const, 'Festival' as const], withEvents: true, kidFriendly: false, mode: MODE_CAR,
  dayStart: H(9), dayEnd: H(21), mustSee: [], mustDo: [], lang: 'en' as const, ownerId: 'u', people: [], startDate: DAY, endDate: DAY,
};

test('events quota: one a day where there is plenty to see, up to four where there is nothing', () => {
  assert.deepEqual([10, 6, 5, 3, 2, 1, 0].map(eventsQuota), [1, 1, 2, 2, 3, 3, 4]);
});

test('a town full of sights still gets its best event fitted into the day', async () => {
  const sights = Array.from({ length: 10 }, (_, i) => sight(`s${i}`, 9.4 - i * 0.1, i));
  const events = [ev('fair', 'Wine & food fair', TEL_AVIV, '10:00', '18:00'), ev('open', 'Open house day', TEL_AVIV)];
  const trip = await generateTrip(req, providers({ attractionsNear: async () => sights, eventsNear: async () => events }));
  const d = trip.itinerary[0];
  assert.ok(d.events.length >= 1, 'an event is in the plan');
  assert.ok(d.attractions.length >= 3, `sights are still the backbone: ${d.attractions.map((a) => a.id)}`);
});

test('a town with few sights gets more events (mixed in, not only at the end of the day)', async () => {
  const sights = [sight('s1', 8.2, 1), sight('s2', 6.4, 2)];
  const events = [
    ev('e1', 'Harvest festival', TEL_AVIV, '10:00', '17:00'),
    ev('e2', 'Street music festival', TEL_AVIV, '11:00', '19:00'),
    ev('e3', 'Lantern parade', TEL_AVIV, '19:00', '20:30'),
    ev('e4', 'Late jazz', TEL_AVIV, '22:00', '23:30'), // after the day ends: never chosen
  ];
  const trip = await generateTrip(req, providers({ attractionsNear: async () => sights, eventsNear: async () => events }));
  const ids = trip.itinerary[0].events.map((e) => e.id);
  assert.ok(ids.length >= 3, `events: ${ids}`);
  assert.ok(!ids.includes('e4'), 'a show after the day ends is not planned');
  assert.ok(ids.includes('e3'), 'the evening parade is in');
});

test('family trips skip adults-only events but keep ordinary ones; "kid-friendly only" keeps family events', async () => {
  assert.ok(ADULT_ONLY.test('Techno rave 18+'));
  assert.ok(!ADULT_ONLY.test('Lantern festival in Caesarea'));
  const events = [ev('rave', 'Techno rave 18+', TEL_AVIV, '12:00', '14:00'), ev('lanterns', 'Lantern festival', TEL_AVIV, '18:00', '20:00'), ev('puppets', 'Puppet theatre', TEL_AVIV, '11:00', '12:00', ['Kid Friendly'])];
  const family = await generateTrip({ ...req, numKids: 2 }, providers({ eventsNear: async () => events }));
  const ids = family.itinerary[0].events.map((e) => e.id);
  assert.ok(!ids.includes('rave'));
  assert.ok(ids.includes('lanterns'), `an ordinary festival is fine for families: ${ids}`);
  const strict = await generateTrip({ ...req, numKids: 2, kidFriendly: true }, providers({ eventsNear: async () => events }));
  assert.deepEqual(strict.itinerary[0].events.map((e) => e.id), ['puppets']);
});

test('pickDayEvents: no two shows less than half an hour apart; the traveller’s picks always', () => {
  const a = ev('a', 'Concert A', TEL_AVIV, '18:00', '19:30');
  const b = ev('b', 'Concert B', TEL_AVIV, '19:45', '21:00');
  const c = ev('c', 'Matinee', TEL_AVIV, '12:00', '13:00', ['History']);
  const chosen = pickDayEvents([a, b, c], { date: DAY, anchor: TEL_AVIV, dayStart: H(9), dayEnd: H(22), types: ['History'], familyTrip: false, mustDo: new Set(['b']), used: new Set(), quota: 3 });
  const ids = chosen.map((x) => x.e.id);
  assert.equal(ids[0], 'b', 'the traveller’s pick first');
  assert.ok(!ids.includes('a'), 'A overlaps B (15 minutes apart)');
  assert.ok(ids.includes('c'));
});

test('dry descriptions are replaced by the Wikipedia introduction, with its link; good ones are kept', async () => {
  const long = 'A large museum of Jewish history with permanent galleries, a synagogue model collection, a genealogy centre and temporary exhibitions; '.repeat(2);
  const sights = [sight('park', 8.8, 1, TEL_AVIV, { description: 'park in Tel Aviv', provider: 'wikidata' }), sight('anu', 8.5, 2, TEL_AVIV, { description: long })];
  const asked: string[] = [];
  const trip = await generateTrip(
    { ...req, withEvents: false },
    providers({
      attractionsNear: async () => sights,
      describe: async (a) => {
        asked.push(a.id);
        return { text: `${a.name} is the largest urban park in the city, with a lake, gardens and sports fields.`, url: `https://en.wikipedia.org/wiki/${a.id}`, source: 'wikipedia' };
      },
    }),
  );
  const park = trip.itinerary[0].attractions.find((a) => a.id === 'park')!;
  assert.match(park.description, /largest urban park/);
  assert.equal(park.descriptionSource, 'wikipedia');
  assert.equal(park.descriptionUrl, 'https://en.wikipedia.org/wiki/park');
  assert.deepEqual(asked, ['park'], 'a full description is not looked up again');
  // Saved trips keep where the description came from.
  const copy = Attraction.fromJSON(JSON.parse(JSON.stringify(park.toJSON())));
  assert.equal(copy.descriptionSource, 'wikipedia');
  assert.equal(copy.descriptionUrl, park.descriptionUrl);
});

test('description helpers: Wikipedia links and a short introduction cut at a sentence end', () => {
  assert.deepEqual(wikipediaTitle('https://he.wikipedia.org/wiki/%D7%A4%D7%90%D7%A8%D7%A7_%D7%94%D7%99%D7%A8%D7%A7%D7%95%D7%9F'), ['he', 'פארק הירקון']);
  assert.equal(wikipediaTitle('https://www.tripadvisor.com/x'), null);
  const text = 'One sentence here. Two sentences here. ' + 'Long words '.repeat(80) + 'end.';
  const intro = introduction(text, 100);
  assert.equal(intro, 'One sentence here. Two sentences here.');
});

test('closed areas: no trip to Gaza; sights inside it are never planned; Bethlehem is planned with a warning', async () => {
  await assert.rejects(generateTrip({ ...req, startingPoint: 'Gaza' }, providers()), (e: unknown) => e instanceof PlannerError && e.code === 'closedArea');
  const nativity = sight('nativity', 9.3, 0, JERUSALEM, { name: 'Church of the Nativity', country: 'PS', location: new Location(31.7043, 35.2076) } as Partial<Attraction>);
  const wall = sight('wall', 9.5, 0, JERUSALEM, { name: 'Western Wall', location: new Location(31.7767, 35.2345) } as Partial<Attraction>);
  const gaza = sight('gaza-mosque', 9.9, 0, JERUSALEM, { name: 'Great Mosque of Gaza', country: 'PS', location: new Location(31.5045, 34.4644) } as Partial<Attraction>);
  const beaufort = sight('beaufort', 9.6, 0, JERUSALEM, { name: 'Beaufort Castle', country: '', location: new Location(33.3247, 35.5303) } as Partial<Attraction>);
  const trip = await generateTrip({ ...req, startingPoint: 'Jerusalem', withEvents: false }, providers({ attractionsNear: async () => [gaza, beaufort, wall, nativity] }));
  const ids = trip.itinerary.flatMap((d) => d.attractions.map((a) => a.id));
  assert.ok(!ids.includes('gaza-mosque') && !ids.includes('beaufort'), `closed / across a closed border: ${ids}`);
  assert.ok(ids.includes('nativity') && ids.includes('wall'), `${ids}`);
  const w = trip.notes.map(parseAreaNote).find((x) => x?.id === 'paArea');
  assert.ok(w, `warning note: ${trip.notes}`);
  assert.deepEqual(w!.places, ['Bethlehem']);
});

test('a trip that starts and ends in one country stays in it (Haifa → Eilat never via Amman)', async () => {
  const HAIFA = new Location(32.794, 34.989);
  const EILAT = new Location(29.557, 34.951);
  const p = providers({
    geocode: async (q) => (/haifa/i.test(q) ? { location: HAIFA, name: 'Haifa', country: 'IL' } : { location: EILAT, name: 'Eilat', country: 'IL' }),
    attractionsNear: async (loc, _l, _r, _w, _n, opts) =>
      opts?.landmarks
        ? [sight('petra', 9.8, 0, new Location(30.3285, 35.4444), { name: 'Petra', country: 'JO', kind: 'ruins' } as Partial<Attraction>)]
        : Array.from({ length: 8 }, (_, i) => sight(`${loc.locLat.toFixed(2)}-${i}`, 9 - i * 0.2, i, loc)),
  });
  for (const days of [4, 10]) {
    const trip = await generateTrip({ ...req, startingPoint: 'Haifa', endingPoint: 'Eilat', startDate: DAY, endDate: new Date(2026, 9, 15 + days), withEvents: false }, p);
    const places = trip.itinerary.map((d) => d.anchorName);
    assert.ok(!places.some((n) => /Amman|Petra|Aqaba|Irbid|Zarqa/.test(n)), `${days} days: ${places.join(' → ')}`);
    assert.equal(places.at(-1), 'Eilat');
  }
});

test('Wikipedia around a place (the phone’s last resort): sights only, named in the trip’s language', async () => {
  const { readGeosearch, wikiAttractions, wikiKind, popularityFromViews, geosearchUrl, detailsUrl } = await import('../src/planner/wikiNearby');
  assert.match(geosearchUrl(32.8144, 34.9874, 25), /gsradius=10000/, 'Wikipedia allows 10 km at most');
  assert.match(detailsUrl([1, 2], 'he'), /lllang=he/);
  assert.ok(!/lllang/.test(detailsUrl([1], 'en')));
  assert.equal(wikiKind('Garden terraces in Haifa, Israel', 'Bahá\'í Gardens'), 'garden');
  assert.equal(wikiKind('Naval museum in Haifa', 'Clandestine Immigration and Naval Museum'), 'museum', 'a museum even though "naval"');
  assert.equal(wikiKind('Neighbourhood of Haifa, Israel', 'German Colony'), null);
  assert.equal(wikiKind('University in Haifa, Israel', 'University of Haifa'), null);
  assert.equal(wikiKind('Sultan of Morocco six times from 1729 to 1757', 'Abdallah of Morocco'), null, 'a person is not a sight');
  assert.equal(wikiKind('Moroccan Sufi saint', 'Sidi Bel Abbes'), null);
  assert.equal(wikiKind('Mausoleum in Rabat, Morocco', 'Mausoleum of Mohammed V'), 'monument');
  assert.equal(wikiKind('2010 wildfire in northern Israel', 'Mount Carmel forest fire'), null, 'an event is not a sight, even with "Mount" in its title');
  assert.equal(wikiKind('', 'Mount Carmel forest fire'), null);
  assert.equal(wikiKind('Battle of the 1948 Arab–Israeli War', 'Battle of Haifa'), null);
  assert.equal(wikiKind('War memorial in Haifa', 'Haifa War Memorial'), 'monument', 'a memorial to a war is a place');
  assert.equal(wikiKind('Mountain range in northern Israel', 'Mount Carmel'), 'viewpoint');
  assert.equal(wikiKind('', 'Hecht Museum'), 'museum');
  assert.equal(wikiKind('', 'Hadar HaCarmel'), null);
  assert.ok(popularityFromViews(20_000) > 9 && popularityFromViews(1_000) > 7 && popularityFromViews(10) >= 5);
  const hits = readGeosearch({
    query: {
      geosearch: [
        { pageid: 1, title: "Bahá'í Gardens", lat: 32.8144, lon: 34.9874, dist: 100, type: 'landmark' },
        { pageid: 2, title: 'Haifa', lat: 32.79, lon: 34.99, dist: 0, type: 'city' },
        { pageid: 3, title: 'German Colony, Haifa', lat: 32.82, lon: 34.99, dist: 900 },
        { pageid: 4, title: 'Stella Maris (disambiguation)', lat: 32.83, lon: 34.97, dist: 1200 },
      ],
    },
  });
  assert.deepEqual(hits.map((h) => h.pageid), [1, 3, 4], 'cities never');
  const out = wikiAttractions(
    hits,
    [
      { pageid: 1, title: "Bahá'í Gardens", description: 'garden terraces in Haifa, Israel', pageprops: { wikibase_item: 'Q1' }, pageviews: { a: 9000, b: 9000 }, thumbnail: { source: 'https://upload.wikimedia.org/x.jpg' }, pageimage: 'Bahai_gardens.jpg', langlinks: [{ lang: 'he', title: 'הגנים הבהאיים' }] },
      { pageid: 3, title: 'German Colony, Haifa', description: 'Neighbourhood of Haifa' },
      { pageid: 4, title: 'Stella Maris (disambiguation)', description: 'Church', pageprops: { disambiguation: '' } },
    ],
    'he',
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'wd-Q1', 'same id as the server’s Wikidata places, so no duplicates');
  assert.equal(out[0].name, 'הגנים הבהאיים');
  assert.equal(out[0].kind, 'garden');
  assert.match(out[0].link, /he\.wikipedia\.org/);
  assert.deepEqual(out[0].photo_urls, ['https://upload.wikimedia.org/x.jpg']);
  assert.ok(out[0].photoSources[0].sourcePage.includes('File:Bahai_gardens.jpg'));
  assert.equal(out[0].popularity, popularityFromViews(18_000));
});

test('the planner never offers a tour company or guest house as a sight', async () => {
  const seller = sight('abboud', 9.4, 1, TEL_AVIV, { name: 'Abboud Tours', category: 'Private Tours', description: 'We are a well-known family business.' } as Partial<Attraction>);
  const lodge = sight('gh', 9.3, 2, TEL_AVIV, { name: 'Jaffa Guest House', category: 'B&Bs & Inns' } as Partial<Attraction>);
  const jeep = sight('jeep', 9.2, 3, TEL_AVIV, { name: 'Desert Jeep Tours', category: '4WD, ATV & Off-Road Tours' } as Partial<Attraction>);
  const real = sight('museum', 8.8, 4, TEL_AVIV, { name: 'ANU Museum', category: 'History Museums' } as Partial<Attraction>);
  const trip = await generateTrip({ ...req, withEvents: false }, providers({ attractionsNear: async () => [seller, lodge, jeep, real] }));
  const ids = trip.itinerary.flatMap((d) => d.attractions.map((a) => a.id));
  assert.ok(!ids.includes('abboud') && !ids.includes('gh'), ids.join(','));
  assert.ok(ids.includes('jeep') && ids.includes('museum'), ids.join(','));
});

test('take me anywhere: the liveliest places within 1,500 km on the dates, never home or a closed area', async () => {
  const { eventHotspots, ANYWHERE_MAX_KM } = await import('../src/planner/anywhere');
  assert.equal(ANYWHERE_MAX_KM, 1500);
  const AMSTERDAM = new Location(52.37, 4.9);
  const at = (lat: number, lon: number) => new Location(lat, lon);
  const make = (city: string, n: number, where: Location, types: Event['types'] = ['Festival']) =>
    Array.from({ length: n }, (_, i) => {
      const e = ev(`${city}-${i}`, `${city} event ${i}`, where, undefined, undefined, types);
      e.location = at(where.locLat + i * 0.001, where.locLon); // the helper nudges events; keep them in town
      return e;
    });
  const events = [
    ...make('home', 12, AMSTERDAM), // the traveller's own city: never suggested
    ...make('brussels', 3, at(50.85, 4.35)),
    ...make('berlin', 6, at(52.52, 13.405)),
    ...make('lisbon', 15, at(38.72, -9.14)), // ~1,850 km: too far
    ...make('vienna', 2, at(48.21, 16.37)), // too few
  ];
  const list = eventHotspots(events, AMSTERDAM, DAY, DAY);
  const names = list.map((h) => h.name);
  assert.equal(names[0], 'Berlin', names.join(', '));
  assert.ok(names.includes('Brussels'));
  assert.ok(!names.some((n) => /Amsterdam|Lisbon|Vienna/.test(n)), names.join(', '));
  assert.equal(list[0].events.length, 6);
  assert.ok(list[0].km > 500 && list[0].km < 620);
  // From Israel, events in Gaza or across the closed border with Lebanon never make a place.
  const gaza = make('gaza', 8, at(31.5017, 34.4668));
  const beirut = make('beirut', 8, at(33.893, 35.502));
  assert.deepEqual(eventHotspots([...gaza, ...beirut], new Location(32.0853, 34.7818), DAY, DAY), []);
});

test('a club, karaoke bar or restaurant gets no Wikipedia text found nearby; hotels and transfers are not restaurants', async () => {
  const { isBusinessVenue, scriptOf, wikiScript } = await import('../src/planner/describe');
  const { isNotARestaurant, kindFromText } = await import('../src/models/AttractionKind');
  assert.ok(isBusinessVenue({ name: 'Karafun Bruxelles', category: 'Karaoke Bars' }));
  assert.ok(isBusinessVenue({ name: 'Club Watergate', kind: 'nightlife' }));
  assert.ok(isBusinessVenue({ name: "Carmen's Corner", kind: 'food' }));
  assert.ok(!isBusinessVenue({ name: 'Bagatti Valsecchi Museum', kind: 'museum', category: 'Speciality Museums' }));
  assert.equal(kindFromText('Karaoke Bars'), 'nightlife');
  // The "article on the spot" rule is only for a name in another alphabet.
  assert.equal(scriptOf('Karafun Bruxelles'), wikiScript('en'));
  assert.notEqual(scriptOf('הכותל המערבי'), wikiScript('en'));
  for (const n of ['Aparthotel Adagio Wien', 'Hotel Sacher', 'Motel One Wien', 'Hostel Ruthensteiner', 'DanaTrips Tours', 'TransferAirport24'])
    assert.ok(isNotARestaurant({ name: n }), n);
  for (const n of ['Café Sacher', 'Hotel Restaurant Zum Hirschen', 'Figlmüller', 'Plachutta Wollzeile']) assert.ok(!isNotARestaurant({ name: n }), n);
});
