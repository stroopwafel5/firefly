import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GPlace, PLACES_FIELD_MASK, extraTypesFor, googleKind, googleToAttraction, nearbyBody, photoCredit, photoMediaUrl, weeklyFromGoogle } from '../src/attractions/googlePlaces';
import { localSights, localSightsQuery, osmSights, parseOpeningHours } from '../src/attractions/osm';
import { AttractionOut, mergeSources, typicalHours } from '../src/attractions/merge';
import { eateryKind } from '../src/attractions/kinds';

const YARKON: GPlace = {
  id: 'ChIJyarkon',
  displayName: { text: 'Yarkon Park', languageCode: 'en' },
  location: { latitude: 32.0989, longitude: 34.8121 },
  rating: 4.6,
  userRatingCount: 42_000,
  primaryType: 'park',
  types: ['park', 'tourist_attraction', 'point_of_interest'],
  editorialSummary: { text: 'Vast urban park with a river, rowing boats, a rock garden and a tropical garden.' },
  regularOpeningHours: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] },
  googleMapsUri: 'https://maps.google.com/?cid=1',
  websiteUri: 'https://www.park.co.il',
  formattedAddress: 'Rokach Blvd, Tel Aviv-Yafo, Israel',
  photos: [{ name: 'places/ChIJyarkon/photos/abc', authorAttributions: [{ displayName: 'Dana', uri: 'https://maps.google.com/contrib/1' }] }],
  businessStatus: 'OPERATIONAL',
  addressComponents: [{ shortText: 'IL', types: ['country', 'political'] }],
};

test('Google Places: a nearby search for sights, by popularity, within 50 km at most', () => {
  const b = nearbyBody(31.25, 34.79, 80, 'he');
  assert.equal(b.languageCode, 'he');
  assert.equal(b.rankPreference, 'POPULARITY');
  assert.equal(b.maxResultCount, 20);
  assert.equal(b.locationRestriction.circle.radius, 50_000, 'capped at 50 km');
  assert.ok(b.includedTypes.includes('tourist_attraction') && b.includedTypes.includes('national_park'));
  for (const f of ['regularOpeningHours', 'editorialSummary', 'rating', 'userRatingCount', 'photos', 'businessStatus']) assert.ok(PLACES_FIELD_MASK.includes(`places.${f}`), f);
});

test('Google Places: opening hours with day 0 = Sunday, overnight closing, and open all the time', () => {
  const museum = weeklyFromGoogle({
    periods: [
      { open: { day: 1, hour: 10 }, close: { day: 1, hour: 18 } },
      { open: { day: 4, hour: 10 }, close: { day: 4, hour: 20, minute: 30 } },
      { open: { day: 5, hour: 22 }, close: { day: 6, hour: 2 } },
    ],
  })!;
  assert.deepEqual(museum[0], [], 'closed on Sunday');
  assert.deepEqual(museum[1], [{ open: 600, close: 1080 }]);
  assert.deepEqual(museum[4], [{ open: 600, close: 1230 }]);
  assert.deepEqual(museum[5], [{ open: 1320, close: 1560 }], 'Friday 22:00 to Saturday 02:00');
  assert.deepEqual(weeklyFromGoogle(YARKON.regularOpeningHours)![3], [{ open: 0, close: 1440 }], 'open without a close = always open');
  assert.equal(weeklyFromGoogle(undefined), undefined);
});

test('Google Places: a place becomes an attraction with its description, hours, rating and country', () => {
  const a = googleToAttraction(YARKON)!;
  assert.equal(a.id, 'g-ChIJyarkon');
  assert.equal(a.provider, 'google');
  assert.equal(a.kind, 'park');
  assert.equal(a.country, 'IL');
  assert.match(String(a.description), /rowing boats/);
  assert.equal(a.descriptionSource, 'google');
  assert.equal(a.hoursSource, 'google');
  assert.deepEqual(a.openingHours, ['00:00', '00:00']);
  assert.equal(a.popularity! >= 9, true, 'a famous park ranks with the famous sights');
  assert.deepEqual(a.photo_urls, [], 'the photo is fetched later, only if the place is used');
  assert.equal(a.googlePhoto, 'places/ChIJyarkon/photos/abc');
  assert.equal(googleToAttraction({ ...YARKON, businessStatus: 'CLOSED_PERMANENTLY' }), null, 'closed places are dropped');
  assert.equal(googleKind({ ...YARKON, primaryType: 'museum', types: ['museum'] }), 'museum');
  assert.equal(googleKind({ id: 'x', displayName: { text: 'Montfort Castle' }, types: ['tourist_attraction'] }), 'castle', 'kind from the name');
  assert.match(photoMediaUrl('places/x/photos/y', 'KEY'), /places\/x\/photos\/y\/media\?maxWidthPx=800&skipHttpRedirect=true&key=KEY/);
  assert.deepEqual(photoCredit(YARKON), { credit: 'Dana · Google Maps', sourcePage: 'https://maps.google.com/contrib/1' });
});

test('OpenStreetMap opening hours: the common forms; anything unusual is "unknown", never wrong', () => {
  const w = parseOpeningHours('Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su off')!;
  assert.deepEqual(w[1], [{ open: 540, close: 1020 }]);
  assert.deepEqual(w[6], [{ open: 600, close: 840 }]);
  assert.deepEqual(w[0], []);
  const israel = parseOpeningHours('Su-Th 08:00-17:00; Fr 08:00-14:00')!;
  assert.deepEqual(israel[0], [{ open: 480, close: 1020 }], 'Sunday is a working day in Israel');
  assert.deepEqual(israel[6], [], 'days not mentioned are closed');
  assert.deepEqual(parseOpeningHours('Tu-Su 10:00-13:00,14:00-18:00')![2], [{ open: 600, close: 780 }, { open: 840, close: 1080 }]);
  assert.deepEqual(parseOpeningHours('Fr-Mo 10:00-16:00')![0], [{ open: 600, close: 960 }], 'ranges wrap round the week');
  assert.deepEqual(parseOpeningHours('24/7')![4], [{ open: 0, close: 1440 }]);
  assert.deepEqual(parseOpeningHours('09:00-18:00')![2], [{ open: 540, close: 1080 }], 'no days = every day');
  assert.deepEqual(parseOpeningHours('Mo-Su 09:00-17:00; PH off')![1], [{ open: 540, close: 1020 }], 'holiday rules are skipped');
  for (const odd of ['Apr-Oct: Mo-Su 09:00-19:00', 'sunrise-sunset', 'Mo-Fr 09:00-17:00 "by appointment"', '', undefined]) assert.equal(parseOpeningHours(odd), undefined, String(odd));
  assert.deepEqual(typicalHours(israel), ['08:00', '17:00']);
});

test('OpenStreetMap: sights with a Wikidata link keep their hours; quiet areas also get the unlinked ones', () => {
  const linked = osmSights({ elements: [{ type: 'way', id: 1, center: { lat: 31.6, lon: 35.1 }, tags: { name: 'Beit Guvrin', historic: 'archaeological_site', wikidata: 'Q1', opening_hours: 'Su-Th 08:00-17:00; Fr 08:00-16:00' } }] });
  assert.deepEqual(linked[0].hours?.[5], [{ open: 480, close: 960 }]);
  const q = localSightsQuery(30.6, 34.8, 80);
  assert.match(q, /around:50000,30\.60000,34\.80000/, 'up to 50 km');
  assert.ok(!q.includes('["wikidata"]'), 'no Wikidata link needed');
  const sights = localSights({
    elements: [
      { type: 'node', id: 10, lat: 30.61, lon: 34.79, tags: { name: 'Ein Avdat Spring', natural: 'spring', wikipedia: 'he:עין עבדת', website: 'https://www.parks.org.il', opening_hours: 'Su-Th,Sa 08:00-17:00; Fr 08:00-16:00', wikimedia_commons: 'File:Ein Avdat.jpg' } },
      { type: 'node', id: 11, lat: 30.62, lon: 34.8, tags: { name: 'Old well', historic: 'ruins' } },
      { type: 'node', id: 12, lat: 30.63, lon: 34.8, tags: { name: 'Private farm museum', tourism: 'museum', access: 'private' } },
      { type: 'node', id: 13, lat: 30.62, lon: 34.8, tags: { name: 'Old well', historic: 'ruins' } },
    ],
  });
  assert.deepEqual(sights.map((s) => s.id), ['osm-node-10', 'osm-node-11'], 'best described first; private and repeated ones dropped');
  assert.equal(sights[0].kind, 'waterfall');
  assert.ok(sights[0].popularity > sights[1].popularity && sights[0].popularity <= 7.4);
  assert.deepEqual(sights[0].hours?.[6], [{ open: 480, close: 1020 }]);
  assert.equal(sights[0].imageFile, 'Ein Avdat.jpg');
});

const base = (id: string, name: string, lat: number, lon: number, extra: Partial<AttractionOut>): AttractionOut => ({
  id, name, types: [], location: { locLat: lat, locLon: lon }, photo_urls: [], photoSources: [], provider: 'wikidata', ...extra,
});

test('merge across sources: one entry per place, best hours and fullest description kept, sources named', () => {
  const ta = [base('123', 'Yarkon Park', 32.099, 34.812, { provider: 'tripadvisor', rating: 4.5, numReviews: 900, description: 'Park.', weeklyHours: [[{ open: 480, close: 1200 }], [], [], [], [], [], []], hoursSource: 'tripadvisor' })];
  const google = [googleToAttraction(YARKON)!, base('g-2', 'Carmel Market', 32.068, 34.768, { provider: 'google', rating: 4.4, numReviews: 30_000 })];
  const wd = [base('wd-Q1', 'Yarkon Park', 32.0991, 34.8122, { wikidataId: 'Q1', description: 'park in Tel Aviv', popularity: 7.6, photo_urls: ['p.jpg'], photoSources: [{ url: 'p.jpg', sourcePage: 's', credit: 'c' }] })];
  const local = [base('osm-node-1', 'Yarkon Springs', 32.104, 34.93, { provider: 'openstreetmap', popularity: 6.5, wikidataId: undefined })];
  const out = mergeSources([ta, google, wd, local]);
  assert.equal(out.filter((a) => /Yarkon Park/.test(a.name)).length, 1, 'Yarkon Park appears once');
  const park = out.find((a) => a.id === '123')!;
  assert.equal(park.hoursSource, 'google', "Google's hours win over Tripadvisor's");
  assert.match(String(park.description), /rowing boats/, 'the fuller description');
  assert.equal(park.descriptionSource, 'google');
  assert.equal(park.wikidataId, 'Q1');
  assert.deepEqual(park.photo_urls, ['p.jpg']);
  assert.equal(park.rating, 4.5, 'Tripadvisor keeps its own rating');
  assert.ok(out.some((a) => a.id === 'g-2') && out.some((a) => a.id === 'osm-node-1'), 'places only one source knows are added');
  // A Wikidata place rated only on Google says whose rating it is.
  const rated = mergeSources([[base('wd-Q9', 'Masada', 31.3156, 35.3536, { wikidataId: 'Q9' })], [base('g-9', 'Masada National Park', 31.3157, 35.3535, { provider: 'google', rating: 4.8, numReviews: 20_000 })]]);
  assert.equal(rated.length, 1);
  assert.equal(rated[0].ratingSource, 'google');
  // Two different Wikidata items next to each other stay two places.
  assert.equal(mergeSources([[base('wd-Q5', 'Old Town Hall', 50.087, 14.4207, { wikidataId: 'Q5' })], [base('wd-Q6', 'Astronomical Clock', 50.087, 14.4206, { wikidataId: 'Q6' })]]).length, 2);
});

test('tour companies, agencies and guest houses are not attractions; activities and real sights are', async () => {
  const { isOrganization } = await import('../src/attractions/kinds');
  const out = (name: string, category = '', description = '') => isOrganization({ name, category, description });
  assert.ok(out('Abboud Tours', 'private tours, Private Tours', 'We are a well-known family business specializing in Israel Tours.'));
  assert.ok(out("L'altra Israele", 'private tours, attractions > tours > private tours, Private Tours'), 'a tour seller by its category');
  assert.ok(out('Galilee Guest House'));
  assert.ok(out('Jerusalem Day Trips'));
  assert.ok(out('Masada Tours'));
  assert.ok(out('Holy Land Travel Ltd'));
  assert.ok(out('Shalom Transfers'));
  assert.ok(out('David Cohen', 'Private Tours', 'Licensed tour guide with 20 years of experience.'));
  assert.ok(out('צימר בגליל'));
  assert.ok(out('Гостевой дом Хайфа'));
  assert.ok(!out('Golan Jeep Tours', '4WD, ATV & Off-Road Tours'), 'Jeep tours are an activity');
  assert.ok(!out('Kayak Jordan River', 'Kayaking & Canoeing'));
  assert.ok(!out('Haifa Balloon Rides', 'Balloon Rides'));
  assert.ok(!out('Cathédrale Saint-Gatien de Tours', 'Churches & Cathedrals'), 'the city of Tours');
  assert.ok(!out("Bahá'í Gardens", 'Gardens'));
  assert.ok(!out('Tower of David Museum', 'History Museums'));
  assert.ok(!out('Yad Vashem', 'Speciality Museums', 'We are the World Holocaust Remembrance Center.'), 'a museum describing itself is still a museum');
  // Google: an agency tagged "tourist attraction" never becomes a sight.
  const agency = googleToAttraction({ ...YARKON, id: 'x', displayName: { text: 'Best Israel Tours' }, primaryType: 'travel_agency', types: ['travel_agency', 'tourist_attraction'] });
  assert.equal(agency, null);
});

test('restaurants are places to eat: transfers, tours and agencies are left out', async () => {
  const { isNotARestaurant } = await import('../src/attractions/kinds');
  for (const n of ['Sofia-Plovdiv Transfer', 'Sofia Airport Transfers', 'Galilee Tours', 'Holy Land Travel', 'Tel Aviv Taxi Service', 'Трансфер Анталия'])
    assert.ok(isNotARestaurant({ name: n }), n);
  for (const n of ['Hotel Aria Restaurant', 'Cafe Tours', 'Abu Hassan', 'Pizza Tours', 'Мангал', 'מסעדת הדייגים', 'Coffee & Co.'])
    assert.ok(!isNotARestaurant({ name: n }), n);
  // Berlin: a bike tour planned as dinner, a museum as lunch.
  for (const n of ['Guided Bike Tour In Berlin', 'Berlin Food Tour', 'Pergamonmuseum', 'Neues Museum', 'Fat Tire Bike Rental'])
    assert.ok(isNotARestaurant({ name: n }), n);
  for (const n of ['Museum Café', 'Café im Literaturhaus', 'Restaurant am Dom', "La Tour d'Argent", 'Curry 36', 'Zur letzten Instanz'])
    assert.ok(!isNotARestaurant({ name: n }), n);
});

test('people are not attractions: a tomb on the map linked to the person, a Wikipedia article about a sultan', async () => {
  const { isPersonDescription } = await import('../src/attractions/kinds');
  for (const d of ['Sultan of Morocco six times from 1729 to 1757', 'Moroccan Sufi saint', 'French painter (1840–1926)', '1st-century Jewish sage', 'Nigerian politician']) {
    assert.ok(isPersonDescription(d), d);
  }
  for (const d of ['mausoleum in Rabat, Morocco', 'tomb of a Talmudic sage in Tiberias', 'royal residence of the King of Morocco', 'General Post Office building', 'park named after King George', '']) {
    assert.ok(!isPersonDescription(d), d);
  }
  const { isEventDescription } = await import('../src/attractions/kinds');
  assert.ok(isEventDescription('2010 wildfire in northern Israel', 'Mount Carmel forest fire'));
  assert.ok(isEventDescription('', 'Mount Carmel forest fire'));
  assert.ok(isEventDescription('Battle of the 1948 Arab–Israeli War'));
  assert.ok(!isEventDescription('War memorial in Haifa', 'Haifa War Memorial'));
  assert.ok(!isEventDescription('Archaeological site; scene of a 1967 battle', 'Ammunition Hill'));
  assert.ok(!isEventDescription('Ancient fortification in southern Israel', 'Masada'));
  const { peopleQuery, readQids } = await import('../src/attractions/osm');
  const q = peopleQuery(['Q123', 'bad', 'Q456']);
  assert.match(q, /VALUES \?item \{ wd:Q123 wd:Q456 \}/);
  assert.match(q, /wd:Q5\b/);
  assert.deepEqual([...readQids({ results: { bindings: [{ item: { value: 'http://www.wikidata.org/entity/Q123' } }] } })], ['Q123']);
});

test('Wikipedia as a source (West Africa, East Africa…): places to visit kept, people, companies and districts left out', async () => {
  const { geosearchUrl, readGeosearch, wikiAttractions } = await import('../src/attractions/wikipediaNearby');
  assert.match(geosearchUrl(6.454, 3.395, 12), /gsradius=10000/, 'Wikipedia allows 10 km at most');
  const hits = readGeosearch({
    query: {
      geosearch: [
        { pageid: 1, title: 'National Museum, Lagos', lat: 6.446, lon: 3.402 },
        { pageid: 2, title: 'Abdallah of Morocco', lat: 6.45, lon: 3.4 },
        { pageid: 3, title: 'Lekki Conservation Centre', lat: 6.44, lon: 3.53 },
        { pageid: 4, title: 'Ikoyi', lat: 6.45, lon: 3.43 },
        { pageid: 5, title: 'Lagos', lat: 6.45, lon: 3.39, type: 'city' },
        { pageid: 6, title: 'Kwame Nkrumah Mausoleum', lat: 5.545, lon: -0.2 },
        { pageid: 7, title: 'Dangote Group', lat: 6.45, lon: 3.4 },
      ],
    },
  });
  assert.equal(hits.length, 6, 'cities are left out at once');
  const list = wikiAttractions(
    hits,
    [
      { pageid: 1, title: 'National Museum, Lagos', description: 'Museum in Lagos, Nigeria', pageprops: { wikibase_item: 'Q6974099' }, pageviews: { a: 900 } },
      { pageid: 2, title: 'Abdallah of Morocco', description: 'Sultan of Morocco six times from 1729 to 1757', pageprops: { wikibase_item: 'Q1' }, pageviews: { a: 5000 } },
      { pageid: 3, title: 'Lekki Conservation Centre', description: 'Nature reserve in Lagos State, Nigeria', pageprops: { wikibase_item: 'Q2' }, pageviews: { a: 1500 } },
      { pageid: 4, title: 'Ikoyi', description: 'Neighbourhood of Lagos', pageviews: { a: 3000 } },
      { pageid: 6, title: 'Kwame Nkrumah Mausoleum', description: 'Mausoleum in Accra, Ghana', pageprops: { wikibase_item: 'Q3' }, pageviews: { a: 2000 } },
      { pageid: 7, title: 'Dangote Group', description: 'Nigerian multinational industrial conglomerate company', pageviews: { a: 9000 } },
    ],
    'en',
  );
  assert.deepEqual(list.map((a) => a.name).sort(), ['Kwame Nkrumah Mausoleum', 'Lekki Conservation Centre', 'National Museum, Lagos']);
  const museum = list.find((a) => a.name === 'National Museum, Lagos')!;
  assert.equal(museum.id, 'wd-Q6974099', 'same id as the Wikidata source, so the merge sees one place');
  assert.equal(museum.kind, 'museum');
  assert.equal(museum.descriptionSource, 'wikipedia');
});

test('Kraków: a hotel and a private guide that Tripadvisor listed as attractions and lunch are left out', async () => {
  const { isOrganization, isNotARestaurant } = await import('../src/attractions/kinds');
  const { isLodging, onlyFood, servesFood } = await import('../src/tripadvisorMap');
  assert.ok(isOrganization({ name: 'Hotel Wentzl', description: 'Welcome to Hotel Wentzl, your Krakow "home away from home".' }));
  assert.ok(isNotARestaurant({ name: 'Hotel Wentzl' }));
  assert.ok(isOrganization({ name: 'Dr Seweryn Osowski - Krakow Tour Guide', description: 'Guide and historian with a Ph.D.' }));
  assert.ok(isOrganization({ name: 'Radisson Blu Krakow' }), 'hotel brands without the word "hotel"');
  assert.ok(!isOrganization({ name: 'Wawel Royal Castle', category: 'Castles' }));
  assert.ok(!isOrganization({ name: 'Krakow Jeep Tours', category: 'Tours' }), 'an activity stays');
  // A tour company describing itself in Italian (or Spanish, French, German…), or filed as a tour.
  assert.ok(isOrganization({ name: "L'altra Israele", description: "Siamo un'agenzia che organizza viaggi in Israele con guide in italiano." }));
  assert.ok(isOrganization({ name: "L'altra Israele", description: 'Tour guidati in italiano alla scoperta di Israele, con guida autorizzata.' }));
  assert.ok(isOrganization({ name: "L'altra Israele", category: 'Tours, Private Tours' }));
  assert.ok(isOrganization({ name: 'Viajes Sol', description: 'Somos una agencia de viajes con guías en español.' }));
  assert.ok(isOrganization({ name: 'Tourist Information Haifa', category: 'Visitor Centers, Traveler Resources' }));
  // Lodging in China: Tripadvisor's own hotel wording, and "Inn" names (a museum called "Old Inn" stays).
  assert.ok(isOrganization({ name: 'Thank You Inn Jieyang Government', description: 'Finding an ideal motel in Jieyang does not have to be difficult. Welcome to Thank You Inn, a nice option for travelers like you.' }));
  assert.ok(isOrganization({ name: 'Jinjiang Inn Jieyang' }));
  assert.ok(!isOrganization({ name: 'Old Inn Museum', category: 'Museums' }));
  assert.ok(!isOrganization({ name: 'Yad Vashem', description: 'The World Holocaust Remembrance Center. Guided tours in English daily.' }), 'a sight offering tours stays');
  // Tripadvisor's own categories, when the answer has them.
  assert.ok(isLodging({ id: 1, categories: [{ id: 'hotel', display_name: 'Hotel', top_level_category: 'HOTEL' }] }));
  assert.ok(isLodging({ id: 1, categories: [{ id: 'x', display_name: 'B&B' }] }));
  assert.ok(!isLodging({ id: 1, categories: [{ id: 'museum', display_name: 'History Museums', top_level_category: 'ATTRACTION' }] }));
  assert.ok(!isLodging({ id: 1 }), 'the catalog has no categories: the name filters decide');
  assert.ok(onlyFood({ id: 1, categories: [{ id: 'r', top_level_category: 'RESTAURANT' }] }));
  assert.ok(!onlyFood({ id: 1, categories: [{ id: 'r', top_level_category: 'RESTAURANT' }, { id: 'a', top_level_category: 'ATTRACTION' }] }));
  assert.ok(servesFood({ id: 1, categories: [{ id: 'h', top_level_category: 'HOTEL' }, { id: 'r', top_level_category: 'RESTAURANT' }] }));
});

test('the four new trip types ask Google for their places; shops and clubs only when chosen; cafés are sweets, lunchrooms meals', () => {
  assert.deepEqual(extraTypesFor(['History', 'Nature']), [], 'nothing extra for the usual types');
  assert.ok(extraTypesFor(['Shopping']).includes('shopping_mall'));
  assert.deepEqual(extraTypesFor(['Beaches']), ['beach']);
  assert.ok(extraTypesFor(['Extreme Sport']).includes('adventure_sports_center'));
  assert.deepEqual(extraTypesFor(['Night Clubs']), ['night_club']);
  assert.ok(extraTypesFor(['Food']).includes('coffee_shop') && extraTypesFor(['Food']).includes('ice_cream_shop'));
  const club: GPlace = { ...YARKON, id: 'club', displayName: { text: 'Kuli Alma' }, primaryType: 'night_club', types: ['night_club', 'bar'] };
  assert.equal(googleToAttraction(club), null, 'a club is not a sight…');
  assert.equal(googleToAttraction(club, new Set(['nightlife']))?.kind, 'nightlife', '…unless the traveller chose Night Clubs');
  const mall: GPlace = { ...YARKON, id: 'mall', displayName: { text: 'Dizengoff Center' }, primaryType: 'shopping_mall', types: ['shopping_mall'] };
  assert.equal(googleToAttraction(mall), null);
  assert.equal(googleToAttraction(mall, new Set(['shopping']))?.kind, 'shopping');
  const park: GPlace = { ...YARKON, id: 'kart', displayName: { text: 'Speed Karting' }, primaryType: 'go_karting_venue', types: ['go_karting_venue'] };
  assert.equal(googleToAttraction(park)?.kind, 'adventure');
  // Cafés: Google's "coffee shop" / "ice cream shop" are sweets (a sight with Food); a lunchroom is a meal.
  const cafe = googleToAttraction({ ...YARKON, id: 'c', displayName: { text: 'Starbucks' }, primaryType: 'coffee_shop', types: ['coffee_shop', 'cafe'] }, new Set())!;
  assert.equal(eateryKind(cafe), 'sweets');
  const ice = googleToAttraction({ ...YARKON, id: 'i', displayName: { text: 'Anita' }, primaryType: 'ice_cream_shop', types: ['ice_cream_shop'] })!;
  assert.equal(eateryKind(ice), 'sweets');
  assert.equal(eateryKind({ name: 'De Branderie', description: 'De Branderie is an atmospheric and cozy lunchroom in the middle of Enschede.' }), 'meal');
  assert.equal(eateryKind({ name: 'Carmel Market', category: 'Flea & Street Markets' }), null, 'a market is a sight');
});

test('restaurants come from Google Maps: only its restaurants, never tour operators, chauffeurs or hotels', async () => {
  const { isGoogleRestaurant } = await import('../src/attractions/googlePlaces');
  const g = (id: string, name: string, primaryType: string, lat = 45.4685, lon = 9.1955, types: string[] = [primaryType]): GPlace => ({
    id,
    displayName: { text: name },
    primaryType,
    types,
    location: { latitude: lat, longitude: lon },
  });
  assert.ok(isGoogleRestaurant(g('1', 'Trattoria Milanese', 'italian_restaurant', 45.4, 9.1, ['italian_restaurant', 'restaurant'])));
  assert.ok(isGoogleRestaurant(g('2', 'Bistrot', 'bistro')));
  assert.ok(!isGoogleRestaurant(g('3', 'Hotel Milano Scala', 'hotel', 45.4, 9.1, ['hotel', 'lodging', 'restaurant'])), 'a hotel with a restaurant is a hotel');
  assert.ok(!isGoogleRestaurant(g('4', 'DanaTrips', 'tour_agency')));
  assert.ok(!isGoogleRestaurant(g('5', 'VISITALY Valentini Pietro N.C.C.', 'car_rental')));
  assert.ok(!isGoogleRestaurant({ ...g('6', 'Closed', 'restaurant'), businessStatus: 'CLOSED_PERMANENTLY' }));
  assert.ok(isGoogleRestaurant(g('7', 'Untyped', '', 45.4, 9.1, ['restaurant', 'food'])));
  assert.ok(!isGoogleRestaurant(g('8', 'Untyped hotel', '', 45.4, 9.1, ['restaurant', 'lodging'])));
});

test('one building, two things: a karaoke bar or a restaurant never takes the text of the article next door', () => {
  const near = (name: string, extra: Partial<AttractionOut> = {}): AttractionOut => ({
    id: name, name, description: '', types: [], country: 'AT', price: null, link: '', photo_urls: [], photoSources: [], location: { locLat: 48.2083, locLon: 16.3718 }, provider: 'tripadvisor', ...extra,
  });
  const merged = mergeSources([
    [near("Carmen's Corner", { kind: 'other' })],
    [near('Stock-im-Eisen', { provider: 'wikidata', kind: 'monument', description: 'Der Stock-im-Eisen ist der mittlere Teil eines Fichtenstamms…', location: { locLat: 48.20835, locLon: 16.37185 } })],
  ]);
  assert.equal(merged.length, 2, 'two places');
  assert.equal(merged.find((a) => a.name === "Carmen's Corner")!.description, '');
  // The same sight under two names is still one: another alphabet, a word in common, or the same kind.
  assert.equal(mergeSources([[near('Western Wall', { kind: 'monument' })], [near('הכותל המערבי', { provider: 'wikidata', kind: 'other' })]]).length, 1);
  assert.equal(mergeSources([[near("St. Stephen's Cathedral", { kind: 'church' })], [near('Stephansdom', { provider: 'wikidata', kind: 'church' })]]).length, 1);
});

test('transfers are never attractions, whatever the spelling ("TransferAirport24")', async () => {
  const { isOrganization } = await import('../src/attractions/kinds');
  for (const n of ['TransferAirport24', 'Milan Airport Taxi', 'Rome Shuttle Service', 'Malpensa Transfers', 'Трансфер Милан']) assert.ok(isOrganization({ name: n }), n);
  for (const n of ['Duomo di Milano', 'Galleria Vittorio Emanuele II', 'Bagatti Valsecchi Museum']) assert.ok(!isOrganization({ name: n }), n);
});

test('Tripadvisor restaurants (only when Google Maps can\'t be asked): restaurant pages only, never "things to do"', async () => {
  const { isTaRestaurant } = await import('../src/tripadvisorMap');
  const { uniqueRestaurants } = await import('../src/attractions/merge');
  const page = (kind: string) => ({ tripadvisor: { main: `https://www.tripadvisor.com/${kind}-g187791-d123-Reviews-X.html` } });
  assert.ok(isTaRestaurant({ id: 1, urls: page('Restaurant_Review'), categories: [{ id: 'r', top_level_category: 'RESTAURANT', display_name: 'Italian' }] }));
  assert.ok(!isTaRestaurant({ id: 2, urls: page('Attraction_Review') }), 'a "#3 of 250 things to do" page');
  assert.ok(!isTaRestaurant({ id: 3, urls: page('AttractionProductReview') }), 'a tour on sale');
  assert.ok(!isTaRestaurant({ id: 4, urls: page('Hotel_Review') }));
  assert.ok(!isTaRestaurant({ id: 5, urls: page('Restaurant_Review'), categories: [{ id: 'r', top_level_category: 'RESTAURANT' }, { id: 'a', top_level_category: 'ATTRACTION', display_name: 'Things to Do' }] }), 'also filed under things to do');
  assert.ok(!isTaRestaurant({ id: 6, categories: [{ id: 't', top_level_category: 'ATTRACTION', display_name: 'Private Tours' }] }));
  // The same restaurant once (two searches, two sources).
  const r = (name: string, lat: number) => ({ name, location: { locLat: lat, locLon: 16.37 } });
  assert.equal(uniqueRestaurants([r('Figlmüller', 48.209), r('Figlmüller', 48.2091), r('Plachutta', 48.209)]).length, 2);
});
