import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Attraction, Hotel, Location, MODE_CAR, Restaurant, Trip, WeeklyHours, normalizeUser } from '../src/models';
import { generateTrip } from '../src/planner/generator';
import { fitDocument, fromFirestore, toFirestore } from '../src/services/firestoreSafe';

const H = (h: number) => h * 60;
const week = (open: number, close: number): WeeklyHours => Array.from({ length: 7 }, (_, d) => (d === 1 ? [] : [{ open, close }]));
const TLV = new Location(32.0853, 34.7818);

/** Is there an array directly inside an array anywhere (what Firestore refuses)? */
function nestedArray(v: unknown, inArray = false): boolean {
  if (Array.isArray(v)) return inArray || v.some((x) => nestedArray(x, true));
  if (v && typeof v === 'object') return Object.values(v).some((x) => nestedArray(x, false));
  return false;
}
function hasUndefined(v: unknown): boolean {
  if (v === undefined) return true;
  if (Array.isArray(v)) return v.some(hasUndefined);
  if (v && typeof v === 'object') return Object.values(v).some(hasUndefined);
  return false;
}

async function aTrip(): Promise<Trip> {
  const sights = Array.from({ length: 6 }, (_, i) => {
    const a = new Attraction(`s${i}`, `Museum ${i}`, 'A museum.', ['History'], 'IL', null, 'https://x', [], new Location(TLV.locLat + i * 0.003, TLV.locLon), [], [], week(H(9), H(18)), undefined, undefined, 'Museums', 60);
    a.popularity = 9 - i * 0.2;
    return a;
  });
  return generateTrip(
    {
      startingPoint: 'Tel Aviv', endingPoint: '', numAdults: 2, numKids: 0, types: ['History'], withEvents: false, kidFriendly: false, mode: MODE_CAR,
      dayStart: H(9), dayEnd: H(21), mustSee: [], mustDo: [], lang: 'en', ownerId: 'u', people: ['u'], startDate: new Date(2026, 9, 13), endDate: new Date(2026, 9, 14),
    },
    {
      geocode: async () => ({ location: TLV, name: 'Tel Aviv', country: 'IL' }),
      route: async () => null,
      placeName: async () => 'Tel Aviv',
      attractionsNear: async () => sights,
      restaurantsNear: async (loc) => ['a', 'b'].map((id, i) => new Restaurant(`r-${id}`, `Restaurant ${id}`, '', [], 'https://r', new Location(loc.locLat + 0.002 * (i + 1), loc.locLon), [])),
      hotelsNear: async (loc) => [new Hotel('h', 'Hotel', '', [], null, 'https://b', loc.locLat, loc.locLon, '', [], 4.5)],
      eventsNear: async () => [],
      travelMatrix: async () => [],
    },
  );
}

test('saving a trip: opening hours (lists inside lists) and empty fields are stored in a form Firestore accepts, and come back the same', async () => {
  const json = (await aTrip()).toJSON();
  assert.ok(nestedArray(json), 'a plan with opening hours has lists inside lists');
  const stored = toFirestore(json);
  assert.ok(!nestedArray(stored), 'none left for Firestore');
  assert.ok(!hasUndefined(stored), 'no undefined values');
  const back = fromFirestore(stored);
  assert.deepEqual(back, JSON.parse(JSON.stringify(json)), 'read back exactly as saved (undefined fields left out)');
  const trip = Trip.fromJSON(back);
  const first = trip.itinerary[0].attractions[0];
  assert.deepEqual(first.weeklyHours?.[1], [], 'closed on Mondays survives');
  assert.deepEqual(first.weeklyHours?.[2], [{ open: H(9), close: H(18) }]);
  // Already-saved trips (no wrapping) read back unchanged.
  assert.deepEqual(fromFirestore({ a: [1, 2], b: { c: 'x' } }), { a: [1, 2], b: { c: 'x' } });
});

test('saving a very long trip: long texts are shortened until it fits in one Firestore document', () => {
  const big = { days: Array.from({ length: 300 }, (_, i) => ({ description: 'x'.repeat(5000), link: `https://example.org/${'y'.repeat(1000)}/${i}` })) };
  const fit = fitDocument(big);
  assert.ok(JSON.stringify(fit).length <= 900_000, String(JSON.stringify(fit).length));
  assert.ok(fit.days[0].link.length > 1000, 'links are never cut');
  assert.ok(fit.days[0].description.length < 5000, 'descriptions are shortened');
  const small = { a: 'short' };
  assert.equal(fitDocument(small), small, 'a normal trip is left as it is');
});

test('a profile saved by an earlier version (missing lists) reads with every list present', () => {
  const p = normalizeUser({ uid: 'u1', userName: 'david', name: 'David', favouriteEvents: ['e1'] } as never, 'u1');
  assert.deepEqual(p.favouriteEvents, ['e1']);
  for (const k of ['bookedCamps', 'favouriteCamps', 'bookedEvents', 'myTrips', 'favouriteAttraction', 'friends', 'searchKeys'] as const) assert.deepEqual(p[k], [], k);
  assert.equal(p.photo, '');
  assert.equal(p.language, 'en');
  assert.equal(normalizeUser(undefined, 'u2').uid, 'u2');
});
