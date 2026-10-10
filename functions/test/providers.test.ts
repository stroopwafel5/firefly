import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isNotAnEvent, mapTicketmaster, ticketmasterUrl, TmResponse } from '../src/events/ticketmasterMap';
import { mapSerpEvents, serpEventsUrl } from '../src/events/googleEventsMap';
import { SearchArgs, validateEvent } from '../src/events/types';
import { planGoogleSearches, weeklyRotation, isoWeek, TM_WEAK_CITIES, ISRAEL_CITIES, THEMED_SEARCHES } from '../src/events/plan';
import { mondaysUntil, serpAllowance } from '../src/serpBudgetCore';
import { googleHotelsUrl, mapGoogleHotels } from '../src/hotels/googleHotelsMap';
import { agodaCityKey, agodaCityRequest, agodaHeaders, mapAgoda } from '../src/hotels/agodaMap';
import { parseNominatimReverse, parseNominatimSearch, nominatimSearchUrl } from '../src/geo/nominatim';
import { kidifyRequest, kidifyText, numbersNotInSource } from '../src/kidifyCore';
import { approveLink, paypalBase, paypalOrderBody, paypalTokenRequest } from '../src/paypalCore';
import { localesFor, pagePlan, pickText, terraHeaders, terraUrl, toAttraction, toHotel, toRestaurant, toReview, weeklyFromTerra } from '../src/tripadvisorMap';

/* ---------------- Ticketmaster: real responses recorded 9 Oct 2026 ---------------- */

const tm = JSON.parse(readFileSync(join(__dirname, 'fixtures/ticketmaster-2026-10-09.json'), 'utf8'));
const args = (q: { lat: number; lon: number; radiusKm: number; from: string; to: string }): SearchArgs => ({ ...q, placeName: '', country: '', lang: 'en' });

test('Ticketmaster URL carries exactly the parameters the server sends', () => {
  const u = new URL(ticketmasterUrl(args(tm.prague.query), 'KEY'));
  assert.equal(u.searchParams.get('latlong'), '50.0875,14.4213');
  assert.equal(u.searchParams.get('radius'), '40');
  assert.equal(u.searchParams.get('unit'), 'km');
  assert.equal(u.searchParams.get('startDateTime'), '2026-10-16T00:00:00Z');
  assert.equal(u.searchParams.get('endDateTime'), '2026-10-25T23:59:59Z');
  assert.equal(u.searchParams.get('locale'), '*');
});

test('Ticketmaster (live Prague data): cancelled and add-on listings dropped, the rest valid', () => {
  const out = mapTicketmaster(tm.prague as TmResponse, args(tm.prague.query));
  assert.deepEqual(out.map((e) => e.name), [
    'SPINESHANK, HED PE, MÜ',
    'ČESKÝ MEJDAN S IMPULSEM 2026',
    'MISTHYRMING, OWLS WOODS GRAVES, PROFANATION, GORRCH',
    'HC Sparta Praha x HC Oceláři Třinec',
  ]);
  for (const e of out) assert.deepEqual(validateEvent(e), [], e.name);
  const hockey = out[3];
  assert.equal(hockey.startTime, '16:00');
  assert.equal(hockey.address, 'Českomoravská 2345/17a, Praha 9');
  assert.equal(hockey.photoSources[0].sourcePage, hockey.link);
  // "Jan Bendig | Fast Track" is an add-on even if it weren't cancelled.
  const fastTrack = tm.prague._embedded.events.find((e: { name: string }) => e.name.includes('Fast Track'));
  assert.equal(isNotAnEvent({ ...fastTrack, dates: { status: { code: 'onsale' } } }), true);
});

test('Ticketmaster (live London data): attraction tickets are not events', () => {
  const evs = tm.london._embedded.events;
  assert.deepEqual(evs.map(isNotAnEvent), [false, true, true]); // Hine After Hours | London Eye | Madame Tussauds
  const out = mapTicketmaster(tm.london as TmResponse, args(tm.london.query));
  assert.deepEqual(out.map((e) => e.name), ['Hine After Hours']);
  // It started on 15 Oct, before the window: the search step drops it (endDate < from).
  assert.ok(out[0].endDate < tm.london.query.from);
});

test('Ticketmaster (live Tel Aviv data): listings with only generic artwork are rejected', () => {
  const out = mapTicketmaster(tm.telaviv as TmResponse, args(tm.telaviv.query));
  assert.deepEqual(out.map((e) => e.name), ['Boy George']);
  assert.match(out[0].photo_urls[0], /_SOURCE$/); // the widest real 16:9 image
  assert.equal(out[0].address, 'Tel Aviv - Jaffa');
  assert.deepEqual(validateEvent(out[0]), []);
});

/* ---------------- SerpApi (formats from serpapi.com docs) ---------------- */

test('Google events: request and mapping', () => {
  const a: SearchArgs = { lat: 5.6, lon: -0.19, placeName: 'Accra', country: 'GH', radiusKm: 50, from: '2026-10-16', to: '2026-10-25', lang: 'he' };
  const u = new URL(serpEventsUrl(a, 'אירועים בAccra', 'K'));
  assert.equal(u.searchParams.get('engine'), 'google');
  assert.equal(u.searchParams.get('hl'), 'iw');
  assert.equal(u.searchParams.get('gl'), 'gh');
  const raw = mapSerpEvents(
    {
      events_results: [
        {
          title: 'Chale Wote Street Art Festival',
          date: { start_date: 'Oct 17', when: 'Sat, Oct 17, 10 AM – 6 PM' },
          address: ['Jamestown', 'High St, Accra, Ghana'],
          link: 'https://example.org/chale-wote',
          venue: { name: 'Jamestown' },
          thumbnail: 'https://example.org/t.jpg',
          ticket_info: [{ source: 'Organiser', link: 'https://example.org/tickets', link_type: 'tickets' }],
        },
        { title: 'No link', date: { start_date: 'Oct 18' } },
      ],
    },
    a,
    'events in Accra',
    new Date(Date.UTC(2026, 9, 9)),
  );
  assert.equal(raw.length, 1);
  assert.equal(raw[0].startDate, '2026-10-17');
  assert.equal(raw[0].startTime, '10:00');
  assert.equal(raw[0].endTime, '18:00');
  assert.equal(raw[0].bookingLink, 'https://example.org/tickets');
  assert.equal(raw[0]._address, 'Jamestown, High St, Accra, Ghana');
});

test('SerpApi budget: the weekly job is never starved on the free plan (250/month)', () => {
  const now = new Date(Date.UTC(2026, 9, 10)); // Sat 10 Oct, plan renews 9 Nov
  const renewal = new Date(Date.UTC(2026, 10, 9));
  assert.equal(mondaysUntil(now, renewal), 4); // 12, 19, 26 Oct, 2 Nov
  const o = { fallbackMax: 30, minReserve: 10, now, renewal };
  assert.equal(serpAllowance(250, 'live', 2, o), 2);
  assert.equal(serpAllowance(121, 'live', 2, o), 1); // 120 kept for the 4 Monday runs
  assert.equal(serpAllowance(120, 'hotels', 1, o), 0);
  assert.equal(serpAllowance(120, 'fallback', 39, o), 30);
  assert.equal(serpAllowance(20, 'fallback', 39, o), 15); // always leaves 5
  assert.equal(serpAllowance(NaN, 'live', 2, o), 2); // account check failed: let the search decide
});

test('Weekly plan: Israel first, then the family/countryside searches, then a rotating slice of cities Ticketmaster misses', () => {
  const p = planGoogleSearches(30, new Date(Date.UTC(2026, 9, 12)));
  assert.equal(p.israel.length, ISRAEL_CITIES.length);
  assert.deepEqual(p.themed.map((s) => s.id), THEMED_SEARCHES.map((s) => s.id), 'Parks Authority, National Trust, English Heritage');
  assert.equal(p.world.length, 30 - ISRAEL_CITIES.length - THEMED_SEARCHES.length);
  assert.deepEqual(planGoogleSearches(18).themed.length, 2, 'the budget is shared in that order');
  assert.ok(p.world.every((c) => TM_WEAK_CITIES.includes(c)));
  const next = planGoogleSearches(30, new Date(Date.UTC(2026, 9, 19)));
  assert.notDeepEqual(next.world, p.world, 'a different slice next week');
  assert.deepEqual(planGoogleSearches(10).israel, ISRAEL_CITIES.slice(0, 10));
  assert.deepEqual(planGoogleSearches(10).world, []);
  assert.equal(isoWeek(new Date(Date.UTC(2026, 9, 12))), 42);
  // Over 23 weeks every weak city gets covered at least once.
  const seen = new Set<string>();
  for (let w = 0; w < 23; w++) weeklyRotation(TM_WEAK_CITIES, 14, new Date(Date.UTC(2026, 0, 5 + 7 * w))).forEach((c) => seen.add(c));
  assert.equal(seen.size, TM_WEAK_CITIES.length);
});

/* ---------------- Hotels ---------------- */

const stay = { checkIn: '2026-10-16', checkOut: '2026-10-18', adults: 2, kids: 2 };

test('Google Hotels: request has the party and dates; priced hotels map with booking links', () => {
  const u = new URL(googleHotelsUrl('Prague', stay, 'ru', 'K', { gl: 'CZ' }));
  assert.equal(u.searchParams.get('engine'), 'google_hotels');
  assert.equal(u.searchParams.get('children'), '2');
  assert.equal(u.searchParams.get('children_ages'), '10,10');
  assert.equal(u.searchParams.get('currency'), 'EUR');
  assert.equal(u.searchParams.get('gl'), 'cz');
  const hotels = mapGoogleHotels(
    {
      properties: [
        {
          type: 'hotel',
          name: 'Hotel A',
          link: 'https://hotel-a.example',
          property_token: 'tok1',
          gps_coordinates: { latitude: 50.08, longitude: 14.42 },
          rate_per_night: { lowest: '€120', extracted_lowest: 120 },
          images: [{ thumbnail: 'https://img/t.jpg', original_image: 'https://img/o.jpg' }],
          overall_rating: 4.6,
        },
        { type: 'hotel', name: 'No coordinates', rate_per_night: { extracted_lowest: 80 } },
        { type: 'vacation rental', name: 'Flat', gps_coordinates: { latitude: 50.1, longitude: 14.4 } },
      ],
    },
    stay,
    'en',
    'Prague',
  );
  assert.equal(hotels.length, 1);
  assert.equal(hotels[0].price, 120);
  assert.equal(hotels[0].currency, 'EUR');
  assert.equal(hotels[0].bookingVia, 'website');
  assert.match(hotels[0].linkToBookingCom, /booking\.com\/searchresults\.html\?.*checkin=2026-10-16.*checkout=2026-10-18/);
  assert.equal(hotels[0].photos[0], 'https://img/o.jpg');
});

test('Agoda Lite API: request matches Agoda docs; results become hotels with Agoda links', () => {
  assert.deepEqual(agodaHeaders('123456', 'abc'), { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip,deflate', Authorization: '123456:abc' });
  const body = agodaCityRequest(9395, stay, 'he', { family: true });
  assert.equal(body.criteria.cityId, 9395);
  assert.equal(body.criteria.additional.language, 'he-il');
  assert.deepEqual(body.criteria.additional.occupancy, { numberOfAdult: 2, numberOfChildren: 2, childrenAges: [10, 10] });
  assert.equal(body.criteria.additional.sortBy, 'FamiliesWithYoungReviewScore');
  const hotels = mapAgoda(
    {
      results: [
        { hotelId: 1, hotelName: 'Riverside', reviewScore: 9.1, currency: 'EUR', dailyRate: 99.4, imageURL: 'https://pix/1.jpg', landingURL: 'https://www.agoda.com/partners/x', includeBreakfast: true, latitude: 50.08, longitude: 14.41 },
        { hotelId: 2, hotelName: 'Unplaceable', landingURL: 'https://www.agoda.com/partners/y' },
        { hotelId: 3, hotelName: 'Geocoded', landingURL: 'https://www.agoda.com/partners/z', dailyRate: 70 },
      ],
    },
    stay,
    'en',
    'Prague',
    (r) => (r.hotelId === 3 ? { lat: 50.09, lon: 14.43 } : null),
  );
  assert.deepEqual(hotels.map((h) => h.name), ['Riverside', 'Geocoded']);
  assert.equal(hotels[0].rating, 4.6); // 9.1 / 10 → 4.6 / 5
  assert.equal(hotels[0].price, 99);
  assert.equal(hotels[0].bookingVia, 'agoda');
  assert.equal(hotels[0].linkToBooking, 'https://www.agoda.com/partners/x');
  assert.match(hotels[0].description, /breakfast included/);
  assert.equal(agodaCityKey('CZ', 'Praha'), 'cz_praha');
  assert.equal(agodaCityKey('IL', "Be'er Sheva"), 'il_be-er-sheva');
  assert.equal(agodaCityKey('MD', 'Chișinău'), 'md_chisinau');
});

test('Tripadvisor Terra: request building (header key, repeated locale, version, pages)', () => {
  assert.deepEqual(terraHeaders('K'), { 'X-API-Key': 'K', accept: 'application/json' });
  const u = new URL(terraUrl('/locations/nearby', { lat: 50.08, lon: 14.42, radius: 8, unit: 'KM', category: 'ATTRACTION', locale: localesFor('he') }));
  assert.equal(u.origin + u.pathname, 'https://terra.tripadvisor.com/api/locations/nearby');
  assert.equal(u.searchParams.get('version'), '1');
  assert.deepEqual(u.searchParams.getAll('locale'), ['he-IL', 'en-US']);
  assert.equal(u.searchParams.has('key'), false, 'the key never goes in the URL');
  assert.deepEqual(pagePlan(24), { size: 12, pages: 2 }); // bill 24 places, not 40
  assert.deepEqual(pagePlan(10), { size: 10, pages: 1 });
  assert.deepEqual(pagePlan(200), { size: 20, pages: 3 }); // nearby stops at 60
});

// A Location shaped like the Terra API reference (docs.terra.tripadvisor.com/reference/locationget).
const zoo = {
  id: 275161,
  names: [
    { language: 'en', value: 'Prague Zoo', primary: true },
    { language: 'ru', value: 'Пражский зоопарк', primary: true },
  ],
  descriptions: [{ language: 'en', value: 'One of the best zoos in the world.' }],
  geo: 'Prague',
  coordinates: { latitude: 50.117, longitude: 14.406 },
  addresses: [{ formatted: 'U Trojského zámku 120/3, Prague 171 00, Czech Republic', city: 'Prague', country_code: 'CZ', language: 'en' }],
  categories: [{ id: 'zoos', display_name: 'Zoos', hierarchy: 'attractions > nature_parks > zoos_aquariums', top_level_category: 'Attraction' }],
  traveler_ratings: { overall: { rating: 4.6, count: 21000 } },
  status: { value: 'OPEN' as const },
  urls: { tripadvisor: { main: 'https://www.tripadvisor.com/Attraction_Review-g274707-d275161', photos: 'https://www.tripadvisor.com/LocationPhotos-g274707-d275161' } },
  opening_hours: {
    timezone: 'Europe/Prague',
    periods: [
      { day_of_week: 'Monday', opens: '09:00:00', closes: '19:00:00' },
      { day_of_week: 'Saturday', opens: '22:00:00', closes: '02:00:00' },
      { day_of_week: 'Sunday', opens: '00:00:00', closes: '23:59:00' },
    ],
  },
  recommended_visit_length: 4,
};
const photo = { id: 1, location_id: 275161, source: { name: 'Traveler' }, photo: { original_size_url: 'https://media-cdn.tripadvisor.com/media/photo-o/zoo.jpg' }, user: { username: 'anna_k' } };

test('Tripadvisor Terra: a Location becomes a Firefly attraction / restaurant / hotel / review', () => {
  const a = toAttraction(zoo, [photo], 'ru');
  assert.equal(a.name, 'Пражский зоопарк');
  assert.equal(a.description, 'One of the best zoos in the world.'); // no Russian text → English
  assert.ok(a.types.includes('Kid Friendly') && a.types.includes('Nature'));
  assert.equal(a.suggestedMinutes, 240); // Tripadvisor's "over 3 hours"
  assert.equal(a.rating, 4.6);
  assert.equal(a.numReviews, 21000);
  assert.equal(a.country, 'CZ');
  assert.deepEqual(a.weeklyHours?.[1], [{ open: 540, close: 1140 }]);
  assert.deepEqual(a.weeklyHours?.[6], [{ open: 1320, close: 1560 }]); // closes 02:00 → after midnight
  assert.deepEqual(a.weeklyHours?.[0], [{ open: 0, close: 1440 }]); // 00:00–23:59 = all day
  assert.equal(a.photoSources[0].sourcePage, zoo.urls.tripadvisor.photos); // photos link back to Tripadvisor
  assert.equal(a.photoSources[0].credit, 'Tripadvisor — anna_k');
  assert.equal(weeklyFromTerra(undefined), undefined);

  const r = toRestaurant({ ...zoo, categories: [{ id: 'restaurants', display_name: 'Restaurants' }, { id: 'czech', display_name: 'Czech' }], price_level: 'Mid Range' }, [], 'en');
  assert.deepEqual(r.cuisine, ['Czech']);
  assert.equal(r.priceLevel, 'Mid Range');

  const h = toHotel({ ...zoo, names: [{ language: 'en', value: 'Hotel Josef', primary: true }], accommodation: { star_rating: 4 } }, [], { checkIn: '2026-10-16', checkOut: '2026-10-18', adults: 2, kids: 2 }, 'en', 'AFF');
  assert.equal(h.bookingVia, 'booking.com');
  assert.equal(h.price, null);
  assert.match(h.linkToBooking, /ss=Hotel\+Josef%2C\+Prague.*group_adults=2&group_children=2&no_rooms=1&lang=en-gb&age=10&age=10&aid=AFF$/);
  assert.equal(h.linkToListing, zoo.urls.tripadvisor.main);

  const rev = toReview(
    { id: 9, rating: 5, publish_ts: '2026-09-30T10:00:00Z', title: [{ language: 'en', value: 'Great day' }], text: [{ language: 'en', value: 'Kids loved it.' }], trip_type: 'FAMILY', url: 'https://www.tripadvisor.com/ShowUserReviews-d275161-r9', user: { username: 'dan' } },
    'he',
  );
  assert.deepEqual(rev, { id: '9', title: 'Great day', text: 'Kids loved it.', rating: 5, publishedDate: '2026-09-30', url: 'https://www.tripadvisor.com/ShowUserReviews-d275161-r9', user: 'dan', tripType: 'FAMILY' });
  assert.equal(pickText([{ language: 'iw', value: 'גן החיות' }, { language: 'en', value: 'Zoo', primary: true }], 'he'), 'גן החיות');
});

/* ---------------- Geocoding fallback, kids' text, PayPal ---------------- */

test('OpenStreetMap fallback: URL and parsing', () => {
  assert.match(nominatimSearchUrl('Granada, Nicaragua', 'ru'), /format=jsonv2.*accept-language=ru/);
  assert.deepEqual(
    parseNominatimSearch([{ lat: '11.9299', lon: '-85.9560', name: 'Granada', display_name: 'Granada, Nicaragua', address: { city: 'Granada', country_code: 'ni' } }]),
    { lat: 11.9299, lon: -85.956, name: 'Granada', country: 'NI', formatted: 'Granada, Nicaragua' },
  );
  assert.equal(parseNominatimSearch([]), null);
  assert.deepEqual(parseNominatimReverse({ address: { town: 'Zikhron Ya\'akov', country_code: 'il' } }), { name: 'Zikhron Ya\'akov', country: 'IL' });
});

test("Kids' rewording: prompt forbids new facts; numbers check catches invented ones", () => {
  const r = kidifyRequest('Built in 1344.', 'ru', 'St Vitus', 'claude-haiku-5-5');
  assert.match(r.system, /Russian/);
  assert.match(r.system, /ONLY facts stated/);
  assert.equal(kidifyText({ content: [{ type: 'text', text: ' Hi! ' }] }), 'Hi!');
  assert.deepEqual(numbersNotInSource('built in 1344, 124 m tall', 'It was built in 1344 and is 124 m tall.'), []);
  assert.deepEqual(numbersNotInSource('built in 1344', 'It is 600 years old.'), ['600']);
});

test('PayPal: environment URLs, token request and order body', () => {
  assert.equal(paypalBase('sandbox'), 'https://api-m.sandbox.paypal.com');
  assert.equal(paypalBase('live'), 'https://api-m.paypal.com');
  const [url, init] = paypalTokenRequest('sandbox', 'id', 'secret');
  assert.equal(url, 'https://api-m.sandbox.paypal.com/v1/oauth2/token');
  assert.equal((init.headers as Record<string, string>).Authorization, `Basic ${Buffer.from('id:secret').toString('base64')}`);
  const body = paypalOrderBody('b1', 'Prague camp', 1290);
  assert.equal(body.purchase_units[0].amount.value, '1290.00');
  assert.equal(body.payment_source.paypal.experience_context.return_url, 'https://www.differentroute.net/?firefly=paypal-return');
  assert.equal(approveLink({ links: [{ rel: 'self', href: 'x' }, { rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=1' }] }), 'https://www.sandbox.paypal.com/checkoutnow?token=1');
});
