import { test } from 'node:test';
import assert from 'node:assert/strict';
import { natureClassGroups, cacheDocs, buildEuropeCache, COUNTRIES, SavedSearch, SearchStore, firestoreSearchStore, plannedSearches } from '../src/attractions/build';
import { EUROPE_CITIES } from '../src/attractions/europeCities';
import { KIND_TYPES, NOT_A_SIGHT, WIKIDATA_CLASSES, kindFromText } from '../src/attractions/kinds';
import { AttractionOut, CACHE_TARGET, isLandmark, mergeAttractions, nameSimilarity, selectForCache, taPopularity } from '../src/attractions/merge';
import { osmRestaurants, restaurantsQuery } from '../src/attractions/osm';
import {
  aroundQuery,
  commonsCreditsUrl,
  commonsFile,
  countryQuery,
  parseCommonsCredits,
  parsePlaces,
  popularityFromSitelinks,
  wdToAttraction,
  WdPlace,
} from '../src/attractions/wikidata';
import { RateGate } from '../src/rateGate';
import { toAttraction } from '../src/tripadvisorMap';

const WD = 'http://www.wikidata.org/entity/';
const row = (qid: string, label: string, cls: string, sitelinks: number, lat = 44.88, lon = 15.62, extra: Record<string, string> = {}) => ({
  item: { type: 'uri', value: `${WD}${qid}` },
  itemLabel: { type: 'literal', value: label, 'xml:lang': 'en' },
  itemDescription: { type: 'literal', value: 'national park in Croatia' },
  lat: { type: 'literal', value: String(lat) },
  lon: { type: 'literal', value: String(lon) },
  sitelinks: { type: 'literal', value: String(sitelinks) },
  class: { type: 'uri', value: `${WD}${cls}` },
  ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { type: 'uri', value: v }])),
});

test('Wikidata: the around-a-point query asks for the right area, kinds and language', () => {
  const q = aroundQuery(45.8, 15.97, 15, 'he');
  assert.match(q, /Point\(15\.97000 45\.80000\)/);
  assert.match(q, /wikibase:radius "15"/);
  assert.match(q, /wikibase:language "he,en"/);
  assert.match(q, /<https:\/\/he\.wikipedia\.org\/>/);
  assert.match(q, /wd:Q46169/, 'national parks are included');
  assert.match(q, /FILTER NOT EXISTS \{ \?item wdt:P576/, 'demolished / closed places are left out');
  assert.match(aroundQuery(0, 0, 500, 'en'), /radius "60"/, 'radius is capped');
  assert.match(countryQuery('Q224', ['Q46169', 'Q23413'], 6, 200), /wdt:P17 wd:Q224/);
});

test('Wikidata: queries stay fast in packed city centres — map search first, names only for the best few', () => {
  for (const q of [aroundQuery(51.509, -0.126, 8, 'en', 80, 5), countryQuery('Q145', ['Q46169'], 6, 120)]) {
    assert.match(q, /hint:Query hint:optimizer "None"/, 'steps run in the written order');
    const inner = q.indexOf('LIMIT');
    assert.ok(inner > 0 && inner < q.indexOf('wikibase:label'), 'names are looked up after the best places are picked');
    assert.ok(inner < q.indexOf('wdt:P18'), 'photos too');
    assert.ok(q.indexOf('FILTER(?sitelinks') < inner, 'the cheap filter is inside');
  }
  const q = aroundQuery(51.509, -0.126, 8, 'en', 80, 5);
  assert.ok(q.indexOf('wikibase:around') < q.indexOf('wdt:P31'), 'the map search runs before the kind check');
  assert.ok(!/VALUES \?class/.test(q), 'no list of kinds to join first (that ran the map search once per kind)');
  assert.match(q, /FILTER\(\?class IN \(wd:Q46169, /);
  assert.match(q, /LIMIT 80\n/);
});

test('Wikidata: rows become places — one per item, its most specific class, unnamed items dropped', () => {
  const places = parsePlaces({
    results: {
      bindings: [
        row('Q190165', 'Plitvice Lakes National Park', 'Q570116', 70, 44.88, 15.62, {
          image: 'http://commons.wikimedia.org/wiki/Special:FilePath/Plitvice%20lakes%20%28Croatia%29.jpg',
          article: 'https://en.wikipedia.org/wiki/Plitvice_Lakes_National_Park',
        }),
        row('Q190165', 'Plitvice Lakes National Park', 'Q46169', 70),
        row('Q999999', 'Q999999', 'Q23413', 12), // no label → dropped
        row('Q123', 'Little chapel', 'Q16970', 3, 44.9, 15.6),
      ],
    },
  });
  assert.equal(places.length, 2);
  const p = places[0];
  assert.equal(p.kind, 'nationalpark', 'national park wins over "tourist attraction"');
  assert.equal(p.imageFile, 'Plitvice lakes (Croatia).jpg');
  assert.equal(p.article, 'https://en.wikipedia.org/wiki/Plitvice_Lakes_National_Park');
  assert.equal(commonsFile('http://commons.wikimedia.org/wiki/Special:FilePath/Karl%C5%AFv_most.jpg'), 'Karlův most.jpg');
});

test('popularity: Wikipedia coverage and Tripadvisor ratings land on the same 0–10 scale', () => {
  assert.ok(popularityFromSitelinks(170) >= 9.8, 'Colosseum-level');
  assert.ok(popularityFromSitelinks(70) >= 9.0, 'Plitvice-level counts as 9+');
  assert.ok(popularityFromSitelinks(7) >= 7.0 && popularityFromSitelinks(7) < 7.5, 'national fame ≈ 7');
  assert.ok(popularityFromSitelinks(3) < 7.0);
  assert.equal(taPopularity(4.7, 400_000), 9.4, 'the Colosseum');
  assert.equal(taPopularity(5.0, 10), 7.5, 'a café with ten 5-star reviews does not beat a landmark');
  assert.equal(taPopularity(undefined, 100), undefined);
});

test('Wikidata place → attraction: sourced link, photo with credit, kind, types and popularity', () => {
  const p: WdPlace = {
    qid: 'Q190165', name: 'Plitvice Lakes National Park', description: 'national park in Croatia', lat: 44.88, lon: 15.62, sitelinks: 70,
    kind: 'nationalpark', imageFile: 'Plitvice.jpg', article: 'https://en.wikipedia.org/wiki/Plitvice_Lakes_National_Park', country: 'HR',
    names: { he: 'הפארק הלאומי אגמי פליטביצה' }, articles: { he: 'https://he.wikipedia.org/wiki/x' },
  };
  const a = wdToAttraction(p, 'he', { artist: 'Jane Doe', license: 'CC BY-SA 4.0' });
  assert.equal(a.id, 'wd-Q190165');
  assert.equal(a.name, 'הפארק הלאומי אגמי פליטביצה');
  assert.equal(a.link, 'https://he.wikipedia.org/wiki/x');
  assert.equal(a.provider, 'wikidata');
  assert.deepEqual(a.types, KIND_TYPES.nationalpark);
  assert.ok(a.popularity >= 9.0);
  assert.equal(a.photoSources[0].sourcePage, 'https://commons.wikimedia.org/wiki/File:Plitvice.jpg');
  assert.equal(a.photoSources[0].credit, 'Jane Doe · CC BY-SA 4.0 · Wikimedia Commons');
  assert.equal(a.description, 'National park in Croatia');
  const noArticle = wdToAttraction({ ...p, article: undefined, articles: undefined }, 'en');
  assert.equal(noArticle.link, 'https://www.wikidata.org/wiki/Q190165', 'falls back to the Wikidata page');
});

test('kinds: bike rentals, beer spas and bars are never sights; landmarks are recognised', () => {
  assert.equal(kindFromText('Bike Rentals, Outdoor Activities'), 'rental');
  assert.equal(kindFromText('Spas & Wellness, Beer Spa'), 'spa');
  assert.equal(kindFromText('Bars & Clubs, Nightlife'), 'nightlife');
  assert.equal(kindFromText('National Parks, Nature & Parks'), 'nationalpark');
  assert.equal(kindFromText('Ancient Ruins, Sights & Landmarks'), 'ruins');
  assert.equal(kindFromText('Castles, Sights & Landmarks'), 'castle');
  for (const k of ['rental', 'spa', 'nightlife', 'shopping'] as const) assert.ok(NOT_A_SIGHT.has(k));
  assert.ok(WIKIDATA_CLASSES.every(([q]) => /^Q\d+$/.test(q)));
  const ta = toAttraction({ id: 1, names: [{ language: 'en', value: 'BezProblem Bike', primary: true }], coordinates: { latitude: 50, longitude: 14 }, categories: [{ id: 'x', display_name: 'Bike Rentals' }], traveler_ratings: { overall: { rating: 5, count: 12 } } }, []);
  assert.equal(ta.kind, 'rental');
  assert.equal(ta.popularity, taPopularity(5, 12));
});

const att = (id: string, name: string, lat: number, lon: number, extra: Partial<AttractionOut> = {}): AttractionOut => ({
  id, name, types: [], location: { locLat: lat, locLon: lon }, photo_urls: [], photoSources: [], provider: 'tripadvisor', ...extra,
});

test('merge: the same place from both sources becomes one, with the best of each', () => {
  const ta = [att('186145', 'Charles Bridge', 50.0865, 14.4114, { rating: 4.7, numReviews: 80_000, kind: 'bridge' }), att('2', 'Old Town Square', 50.0875, 14.4213, { rating: 4.7, numReviews: 60_000 })];
  const wd = [
    att('wd-Q4', 'Karlův most (Charles Bridge)', 50.0866, 14.4115, { provider: 'wikidata', kind: 'bridge', popularity: 9.8, wikidataId: 'Q4', photo_urls: ['p.jpg'], photoSources: [{ url: 'p.jpg', sourcePage: 's', credit: 'c' }] }),
    att('wd-Q5', 'Vyšehrad', 50.0644, 14.4183, { provider: 'wikidata', kind: 'fortress', popularity: 8.6, wikidataId: 'Q5' }),
  ];
  const merged = mergeAttractions(ta, wd);
  assert.equal(merged.length, 3, 'Charles Bridge appears once');
  const bridge = merged.find((a) => a.id === '186145')!;
  assert.equal(bridge.popularity, 9.8, 'higher popularity of the two');
  assert.equal(bridge.wikidataId, 'Q4');
  assert.deepEqual(bridge.photo_urls, ['p.jpg'], 'Wikidata photo fills the gap');
  assert.ok(merged.some((a) => a.id === 'wd-Q5'), 'places only Wikidata knows are added');
  assert.deepEqual(merged.map((a) => a.popularity), [...merged.map((a) => a.popularity)].sort((x, y) => (y ?? 0) - (x ?? 0)));
  assert.ok(nameSimilarity('Prague Castle', 'Pražský hrad (Prague Castle)') >= 0.5);
});

test('backup list: 10,000 places by default; spread out, at least a quarter nature', () => {
  assert.equal(CACHE_TARGET, 10_000);
  const places: WdPlace[] = [];
  // 400 famous city sights all in one spot, 300 nature sites spread around.
  for (let i = 0; i < 400; i++) places.push({ qid: `Q${i}`, name: `City ${i}`, description: '', lat: 41.89, lon: 12.49, sitelinks: 200 - i / 4, kind: 'church' });
  for (let i = 0; i < 300; i++) places.push({ qid: `N${i}`, name: `Nature ${i}`, description: '', lat: 40 + i * 0.3, lon: 10 + (i % 7), sitelinks: 10, kind: 'lake' });
  const chosen = selectForCache(places, 200, 60, 0.25);
  assert.equal(chosen.length, 200);
  assert.ok(chosen.filter((p) => p.kind === 'church').length <= 60, 'one area holds at most 60');
  assert.ok(chosen.filter((p) => p.kind === 'lake').length >= 50, 'a quarter is nature');
  assert.equal(new Set(chosen.map((p) => p.qid)).size, chosen.length, 'no duplicates');
  const docs = cacheDocs(chosen.map((p) => ({ ...p, credit: undefined })), 1);
  assert.equal(docs.at(-1)!.id, 'meta');
  assert.equal((docs.at(-1)!.data as { count: number }).count, 200);
  assert.ok(!JSON.stringify(docs).includes('undefined'));
  const nature = natureClassGroups().flat();
  assert.ok(nature.includes('Q46169') && !nature.includes('Q23397') && !nature.includes('Q22698'), 'national parks yes; every lake or park in a country no (too slow)');
  assert.ok(COUNTRIES.some(([cc]) => cc === 'IL'));
  assert.ok(EUROPE_CITIES.length > 400 && EUROPE_CITIES.some(([n]) => n === 'Prague') && EUROPE_CITIES.some(([n]) => n === 'Dubrovnik'));
});

test('backup list build: every city and the nature of every country are asked, names and photo credits are added', async () => {
  const asked: string[] = [];
  let n = 0;
  const { places } = await buildEuropeCache(
    {
      sparql: async (q) => {
        asked.push(q);
        if (q.includes('rdfs:label')) {
          return { results: { bindings: [{ item: { type: 'uri', value: `${WD}Q1` }, he: { type: 'literal', value: 'מקום' }, ru: { type: 'literal', value: 'Место' } }] } };
        }
        n++;
        return { results: { bindings: [row(`Q${n}`, `Place ${n}`, 'Q23413', 30, 45 + (n % 40) * 0.5, 10 + (n % 30) * 0.5, { image: `http://x/Special:FilePath/F${n}.jpg` })] } };
      },
      commons: async () => ({ query: { pages: [{ title: 'File:F1.jpg', imageinfo: [{ extmetadata: { Artist: { value: '<a href="x">Ann</a>' }, LicenseShortName: { value: 'CC BY 4.0' } } }] }] } }),
      log: () => undefined,
      pause: async () => undefined,
    },
    { target: 100, cities: EUROPE_CITIES.slice(0, 30) },
  );
  assert.equal(asked.filter((q) => q.includes('wikibase:around')).length, 30, 'one map search per city');
  assert.equal(asked.filter((q) => q.includes('wdt:P17 wd:')).length, COUNTRIES.length * 3, 'two nature searches and one heritage search per country');
  const prague = asked.find((q) => q.includes('Point(14.42100 50.08800)'))!;
  assert.match(prague, /LIMIT 150\n/, 'a big city like Prague: its 150 best-known places');
  assert.match(prague, /radius "8"/);
  const heritage = asked.find((q) => q.includes('wdt:P17 wd:Q213') && q.includes('wd:Q23413'))!;
  assert.ok(heritage, 'castles of the Czech Republic (Karlštejn, Český Krumlov…) are asked country-wide');
  assert.match(heritage, /FILTER\(\?sitelinks >= 12\)/);
  assert.equal(places.length, 100);
  const first = places.find((p) => p.qid === 'Q1')!;
  assert.equal(first.names?.he, 'מקום');
  assert.deepEqual(first.credit, { artist: 'Ann', license: 'CC BY 4.0' });
});

/** A store that remembers between runs, like Firestore does. */
function testStore(): SearchStore & { m: Map<string, SavedSearch> } {
  const m = new Map<string, SavedSearch>();
  return { m, loadAll: async () => new Map(m), save: async (k, v) => void m.set(k, v) };
}
const placeRow = (n: number) => ({ results: { bindings: [row(`Q${n}`, `Place ${n}`, 'Q23413', 30, 45 + (n % 40) * 0.5, 10 + (n % 30) * 0.5)] } });
const quietDeps = (sparql: (q: string) => Promise<ReturnType<typeof placeRow>>, store: SearchStore, now = () => 0) => ({
  sparql,
  commons: async () => ({}),
  log: () => undefined,
  pause: async () => undefined,
  store,
  now,
});

test('backup list build: stopped half way, the next run only does what is missing', async () => {
  const cities = EUROPE_CITIES.slice(0, 20);
  const total = plannedSearches(cities).length;
  const store = testStore();
  // Run 1: Wikidata stops answering after 12 searches (like closing the window half way).
  let calls = 0;
  const r1 = await buildEuropeCache(
    quietDeps(async (q) => {
      if (q.includes('rdfs:label')) return { results: { bindings: [] } };
      if (++calls > 12) throw new Error('The operation was aborted due to timeout');
      return placeRow(calls);
    }, store),
    { target: 50, cities },
  );
  assert.equal(r1.ran, 12);
  assert.equal(store.m.size, 12, 'each answer saved as it arrived');
  assert.equal(r1.failed, 6, 'gives up after 6 searches in a row fail, instead of waiting on every city');
  assert.equal(r1.missing, total - 12);
  // Run 2: only the missing searches are asked.
  const asked: string[] = [];
  const r2 = await buildEuropeCache(
    quietDeps(async (q) => {
      if (q.includes('rdfs:label')) return { results: { bindings: [] } };
      asked.push(q);
      return placeRow(1000 + asked.length);
    }, store),
    { target: 50, cities },
  );
  assert.equal(asked.length, total - 12, 'nothing asked twice');
  assert.equal(r2.missing, 0);
  assert.equal(new Set(r2.places.map((p) => p.qid)).size, r2.places.length);
  assert.ok(r2.places.some((p) => Number(p.qid.slice(1)) <= 12), 'answers from the first run are used');
});

test('backup list build: a city that times out gets a smaller circle, then is skipped for now', async () => {
  const asked: string[] = [];
  const r = await buildEuropeCache(
    quietDeps(async (q) => {
      asked.push(q);
      if (q.includes('rdfs:label')) return { results: { bindings: [] } };
      if (q.includes('wikibase:around') && !q.includes('radius "2"')) throw new Error('Wikidata HTTP 502');
      return placeRow(asked.length);
    }, testStore()),
    { target: 50, cities: [['London', 'GB', 51.509, -0.126]] },
  );
  const around = asked.filter((q) => q.includes('wikibase:around'));
  assert.deepEqual(
    around.map((q) => q.match(/radius "([\d.]+)"/)![1]),
    ['8', '4', '2'],
    'one of the 100 biggest cities: 8 km, then 4, then 2',
  );
  assert.equal(r.failed, 0);
});

test('backup list build: old answers are refreshed oldest first, within the time limit', async () => {
  const cities = EUROPE_CITIES.slice(0, 5);
  const searches = plannedSearches(cities);
  const store = testStore();
  const DAY = 24 * 3600_000;
  let now = 100 * DAY;
  // Everything saved 40 days ago, except one saved 50 days ago and one yesterday.
  searches.forEach((s, i) => store.m.set(s.key, { at: now - (i === 3 ? 50 : i === 4 ? 1 : 40) * DAY, places: [] }));
  const asked: string[] = [];
  const r = await buildEuropeCache(
    quietDeps(
      async (q) => {
        if (q.includes('rdfs:label')) return { results: { bindings: [] } };
        asked.push(q);
        now += 60_000; // each search takes a minute
        return placeRow(asked.length);
      },
      store,
      () => now,
    ),
    { target: 50, cities, budgetMs: 2.5 * 60_000 },
  );
  assert.equal(r.ran, 3, 'stops starting new searches when the time is up');
  assert.ok(asked[0].includes(`Point(${cities[3][3].toFixed(5)} ${cities[3][2].toFixed(5)})`), 'the oldest first');
  assert.ok(!asked.some((q) => q.includes(`Point(${cities[4][3].toFixed(5)} `)), 'yesterday’s answer is kept');
  assert.equal(r.missing, 0);
  // All answers recent: nothing is asked, and with onlyIfChanged nothing is rebuilt.
  const fresh = testStore();
  for (const s of searches) fresh.m.set(s.key, { at: now, places: [] });
  const none = await buildEuropeCache(
    quietDeps(async () => assert.fail('no search expected'), fresh, () => now),
    { target: 50, cities, onlyIfChanged: true },
  );
  assert.deepEqual([none.ran, none.changed, none.places.length, none.missing], [0, false, 0, 0]);
});

test('backup list: saved answers go to Firestore without undefined fields; the meta says what is missing', async () => {
  const written = new Map<string, Record<string, unknown>>();
  const db = {
    collection: (_name: string) => ({
      get: async () => ({ docs: [...written].map(([id, v]) => ({ id, data: () => v })) }),
      doc: (id: string) => ({ set: async (d: Record<string, unknown>) => void written.set(id, d) }),
    }),
  };
  const store = firestoreSearchStore(db);
  await store.save('v2-city-CZ-50.09_14.42', { at: 5, places: [{ qid: 'Q1', name: 'A', description: '', lat: 1, lon: 2, sitelinks: 3, kind: 'castle', imageFile: undefined }] });
  assert.ok(!JSON.stringify([...written.values()]).includes('imageFile'));
  const back = await store.loadAll();
  assert.equal(back.get('v2-city-CZ-50.09_14.42')!.places[0].qid, 'Q1');
  const meta = cacheDocs([], 1, { missing: 3, oldestSearchAt: 7 }).at(-1)!;
  assert.deepEqual([meta.data.missing, meta.data.oldestSearchAt], [3, 7]);
});

test('Commons credits: authors without HTML, licence, normalised file names', () => {
  assert.match(commonsCreditsUrl(['A b.jpg']), /titles=File%3AA\+b\.jpg/);
  const m = parseCommonsCredits({
    query: {
      normalized: [{ from: 'File:A_b.jpg', to: 'File:A b.jpg' }],
      pages: [{ title: 'File:A b.jpg', imageinfo: [{ extmetadata: { Artist: { value: '<span>Jan &amp; Eva</span>' }, LicenseShortName: { value: 'CC BY-SA 3.0' } } }] }],
    },
  });
  assert.deepEqual(m.get('A b.jpg'), { artist: 'Jan & Eva', license: 'CC BY-SA 3.0' });
});

test('OpenStreetMap restaurants: named places only, own website first, link to the source', () => {
  assert.match(restaurantsQuery(50.08, 14.42, 3), /around:3000,50\.08000,14\.42000/);
  const list = osmRestaurants(
    {
      elements: [
        { type: 'node', id: 1, lat: 50.08, lon: 14.42, tags: { amenity: 'cafe', name: 'Kavárna' } },
        { type: 'way', id: 2, center: { lat: 50.081, lon: 14.421 }, tags: { amenity: 'restaurant', name: 'Lokál', 'name:ru': 'Локал', cuisine: 'czech;regional', website: 'https://lokal.cz', opening_hours: 'Mo-Su 11:00-23:00' } },
        { type: 'node', id: 3, lat: 50.08, lon: 14.42, tags: { amenity: 'restaurant' } },
      ],
    },
    'ru',
  );
  assert.equal(list.length, 2);
  assert.equal(list[0].name, 'Локал');
  assert.equal(list[0].linkToPage, 'https://lokal.cz');
  assert.deepEqual(list[0].cuisine, ['czech', 'regional']);
  assert.equal(list[1].linkToPage, 'https://www.openstreetmap.org/node/1');
});

test('Tripadvisor gate: spaces calls to the QPS limit and pauses after a 429', async () => {
  let now = 0;
  const slept: number[] = [];
  const gate = new RateGate(2, 90_000, () => now, async (ms) => {
    slept.push(ms);
    now += ms;
  });
  assert.equal(await gate.wait(), true);
  assert.equal(await gate.wait(), true);
  assert.equal(await gate.wait(), true);
  assert.deepEqual(slept, [500, 500], '2 per second');
  gate.coolDown();
  assert.equal(gate.cooling, true);
  assert.equal(await gate.wait(), false, 'refused while cooling down');
  now += 90_001;
  assert.equal(await gate.wait(), true, 'back after the pause');
});

test('landmarks: world-class nature and heritage only', () => {
  assert.ok(isLandmark(att('a', 'Plitvice', 0, 0, { kind: 'nationalpark', popularity: 9.1 })));
  assert.ok(!isLandmark(att('b', 'Town hall', 0, 0, { kind: 'monument', popularity: 9.5 })));
  assert.ok(!isLandmark(att('c', 'Small lake', 0, 0, { kind: 'lake', popularity: 7.2 })));
});
