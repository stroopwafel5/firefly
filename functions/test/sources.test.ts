import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entitiesUrl, osmKind, osmSights, pageImagesUrl, readEntities, readPageImages, sightsQuery } from '../src/attractions/osm';
import { NOT_A_MEAL } from '../src/attractions/kinds';
import { mergeSuggestions, nominatimSuggestUrl, parseNominatimSuggestions } from '../src/geo/nominatim';
import { citySearchKey, plannedSearches } from '../src/attractions/build';

test('OpenStreetMap sights: notable places only (with a Wikidata link), one per item, kinds from tags', () => {
  const q = sightsQuery(50.0875, 14.4213, 12);
  assert.match(q, /around:12000,50\.08750,14\.42130/);
  assert.ok(q.split('\n').filter((l) => l.includes('nwr') || l.includes('way[')).every((l) => l.includes('["wikidata"]')), 'every line needs a Wikidata link');
  const sights = osmSights({
    elements: [
      { type: 'way', id: 1, center: { lat: 50.09, lon: 14.4 }, tags: { historic: 'castle', name: 'Pražský hrad', 'name:en': 'Prague Castle', wikidata: 'Q130206', wikimedia_commons: 'File:Prague Castle.jpg' } },
      { type: 'node', id: 2, lat: 50.09, lon: 14.4, tags: { tourism: 'attraction', name: 'Pražský hrad', wikidata: 'Q130206' } },
      { type: 'node', id: 3, lat: 50.08, lon: 14.41, tags: { amenity: 'place_of_worship', religion: 'jewish', heritage: '2', name: 'Staronová synagoga', wikidata: 'Q12345' } },
      { type: 'node', id: 4, lat: 50.08, lon: 14.41, tags: { tourism: 'museum', name: 'Closed', wikidata: 'Q9', disused: 'yes' } },
      { type: 'node', id: 5, lat: 50.08, lon: 14.41, tags: { tourism: 'museum', name: 'No link' } },
    ],
  });
  assert.deepEqual(sights.map((s) => [s.qid, s.kind]), [['Q130206', 'castle'], ['Q12345', 'synagogue']]);
  assert.equal(sights[0].imageFile, 'Prague Castle.jpg');
  assert.equal(sights[0].names.en, 'Prague Castle');
  assert.equal(osmKind({ leisure: 'nature_reserve' }), 'reserve');
  assert.equal(osmKind({ historic: 'castle', castle_type: 'stately' }), 'palace');
  assert.equal(osmKind({ natural: 'waterfall' }), 'waterfall');
  assert.equal(osmKind({ way: 'x' } as Record<string, string>), 'other');
});

test('Wikidata API: how known a place is counts Wikipedias only; names and articles in three languages', () => {
  assert.match(entitiesUrl(['Q1', 'Q2']), /action=wbgetentities&ids=Q1%7CQ2&props=sitelinks%7Clabels%7Cdescriptions/);
  const m = readEntities({
    entities: {
      Q130206: {
        labels: { en: { value: 'Prague Castle' }, he: { value: 'מצודת פראג' }, ru: { value: 'Пражский Град' } },
        descriptions: { en: { value: 'castle complex in Prague' } },
        sitelinks: { enwiki: { title: 'Prague Castle' }, hewiki: { title: 'מצודת פראג' }, cswiki: { title: 'Pražský hrad' }, commonswiki: { title: 'Category:Prague Castle' }, enwikivoyage: { title: 'x' } },
      },
      Q404: { missing: '' },
    },
  });
  const pc = m.get('Q130206')!;
  assert.equal(pc.sitelinks, 3, 'en, he, cs — not Commons or Wikivoyage');
  assert.equal(pc.labels.he, 'מצודת פראג');
  assert.equal(pc.articles.ru, undefined);
  assert.equal(m.has('Q404'), false);
  assert.match(pageImagesUrl(['Prague Castle']), /prop=pageimages/);
  const img = readPageImages({
    query: {
      normalized: [{ from: 'prague Castle', to: 'Prague Castle' }],
      pages: [
        { title: 'Prague Castle', pageimage: 'Prague_Castle_(2).jpg' },
        { title: 'Charles Bridge', pageimage: 'Map_of_Prague.svg' },
      ],
    },
  });
  assert.equal(img.get('Prague Castle'), 'Prague Castle (2).jpg');
  assert.equal(img.get('prague Castle'), 'Prague Castle (2).jpg', 'found under the title we asked for');
  assert.equal(img.has('Charles Bridge'), false, 'maps and logos are not photos');
});

test('place suggestions: towns first, names in the app language, no duplicates', () => {
  assert.match(nominatimSuggestUrl('פראג', 'he'), /accept-language=he/);
  const list = parseNominatimSuggestions([
    { lat: '50.08', lon: '14.42', name: 'Prague Castle', addresstype: 'castle', importance: 0.7, address: { country: 'צ׳כיה', country_code: 'cz' } },
    { lat: '50.0875', lon: '14.4213', name: 'פראג', addresstype: 'city', importance: 0.8, address: { state: 'פראג', country: 'צ׳כיה', country_code: 'cz' } },
  ]);
  assert.deepEqual(list.map((s) => s.name), ['פראג', 'Prague Castle']);
  assert.equal(list[0].detail, 'צ׳כיה', 'the region is left out when it repeats the name');
  assert.equal(list[0].country, 'CZ');
  const merged = mergeSuggestions([[{ ...list[0], name: 'פראג' }], [{ ...list[0], name: 'Praha' }, list[1]]]);
  assert.equal(merged.length, 2);
});

test('meals: beer spas and brewing schools are not restaurants', () => {
  for (const n of ['Beer Baths Letna', 'Czech Brewing School', 'Beer Spa Bernard', 'Prague Pub Crawl', 'Hookah lounge']) assert.ok(NOT_A_MEAL.test(n), n);
  for (const n of ['Lokál Dlouhááá', 'Spaghetteria', 'Strip House steak', 'U Fleků brewery & restaurant', 'Gerstner K. u. K. Hofzuckerbäcker']) assert.ok(!NOT_A_MEAL.test(n), n);
});

test('saved build answers are found by city (the server reads them for trips before the list is finished)', () => {
  const prague = plannedSearches([['Prague', 'CZ', 50.088, 14.421]])[0];
  assert.equal(prague.key, citySearchKey('CZ', 50.088, 14.421));
});
