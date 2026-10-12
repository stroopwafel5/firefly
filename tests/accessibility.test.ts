import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Attraction, Camp, Hotel, Location, MODE_CAR, Restaurant, pacingFor, supportsAll } from '../src/models';
import { classify } from '../src/planner/classify';
import { PlannerError, PlannerProviders, TripRequest, generateTrip } from '../src/planner/generator';
import { filterCamps, providersOf } from '../src/services/campFilters';

const PRAGUE = new Location(50.0875, 14.4213);
const H = (h: number, m = 0) => h * 60 + m;

/** Eight places; the museum is confirmed for blind visitors, the castle for autism only. */
function places(): Attraction[] {
  const mk = (id: string, d: number, rating: number, cat: string, needs: string[] = []) => {
    const c = classify(cat);
    const a = new Attraction(id, `Place ${id}`, '', c.types, 'CZ', null, `https://ta/${id}`, [], new Location(PRAGUE.locLat + d, PRAGUE.locLon), [], [], undefined, rating, 100, cat, c.duration);
    a.disabilityCompatible = needs;
    a.accessibilitySources = needs.map((n) => ({ need: n as 'blind', url: `https://venue/${id}/access`, by: 'venue' as const, phrase: 'x' }));
    return a;
  };
  return [
    mk('museum', 0.004, 4.4, 'Museums', ['blind', 'physical']),
    mk('castle', 0.01, 4.8, 'Castles', ['autism']),
    mk('gallery', 0.006, 4.5, 'Art Galleries', ['blind']),
    mk('bridge', 0.002, 4.7, 'Bridges'),
    mk('garden', -0.01, 4.3, 'Gardens'),
    mk('church', 0.003, 4.5, 'Churches & Cathedrals'),
    mk('square', 0.0, 4.6, 'Points of Interest & Landmarks, Squares'),
    mk('tower', 0.007, 4.6, 'Observation Decks & Towers'),
  ];
}

function setup() {
  const asked: Array<string[] | undefined> = [];
  const p: PlannerProviders = {
    geocode: async () => ({ location: PRAGUE, name: 'Prague', country: 'CZ' }),
    route: async () => null,
    placeName: async () => 'Prague',
    attractionsNear: async (_l, _lang, _r, _w, needs) => {
      asked.push(needs);
      return places();
    },
    restaurantsNear: async () =>
      ['r1', 'r2', 'r3', 'r4'].map((id, i) => new Restaurant(id, id, '', [], `https://ta/${id}`, new Location(PRAGUE.locLat + i * 0.002, PRAGUE.locLon), [])),
    hotelsNear: async () => [new Hotel('h1', 'Hotel', '', [], null, 'https://www.booking.com/x', PRAGUE.locLat, PRAGUE.locLon, '', [], 4.5)],
    eventsNear: async () => [],
    travelMatrix: async () => [],
  };
  return { p, asked };
}

const req = (extra: Partial<TripRequest> = {}): TripRequest => ({
  startingPoint: 'Prague',
  endingPoint: 'Prague',
  numAdults: 2,
  numKids: 0,
  types: ['History', 'Art'],
  startDate: new Date(2026, 9, 13),
  endDate: new Date(2026, 9, 13),
  withEvents: false,
  kidFriendly: false,
  mode: MODE_CAR,
  dayStart: H(9),
  dayEnd: H(21),
  mustSee: [],
  mustDo: [],
  lang: 'en',
  ownerId: 'u1',
  people: ['u1'],
  ...extra,
});

test('accessibility: with no needs chosen, nothing is checked and the pace is the usual one', async () => {
  const { p, asked } = setup();
  const trip = await generateTrip(req(), p);
  assert.deepEqual(asked, [undefined], 'the server is not asked to check accessibility');
  assert.deepEqual(trip.accessNeeds, []);
  assert.equal(trip.itinerary[0].breakMinutes, 0);
  assert.ok(trip.itinerary[0].attractions.length > 3, 'a normal day has more than three places');
});

test('accessibility: each need on its own — blind + strict keeps only places confirmed for blind visitors', async () => {
  const { p, asked } = setup();
  const trip = await generateTrip(req({ accessNeeds: ['blind'], accessStrict: true }), p);
  assert.deepEqual(asked, [['blind']], 'only the chosen, checkable need is sent');
  const ids = trip.itinerary.flatMap((d) => d.attractions.map((a) => a.id)).sort();
  assert.deepEqual(ids, ['gallery', 'museum'], 'the castle is confirmed for autism, which says nothing about blind visitors');
  assert.ok(trip.accessStrict);
});

test('accessibility: autism + strict picks the autism-confirmed castle, not the places confirmed for blind visitors', async () => {
  const { p } = setup();
  const trip = await generateTrip(req({ accessNeeds: ['autism'], accessStrict: true }), p);
  assert.deepEqual(trip.itinerary.flatMap((d) => d.attractions.map((a) => a.id)), ['castle']);
});

test('accessibility: not strict — between equally popular places the confirmed ones come first; others still allowed; pace slows down', async () => {
  const { p } = setup();
  const offered: string[] = [];
  const trip = await generateTrip(req({ accessNeeds: ['blind'], accessStrict: false }), p, undefined, {
    onDay: (d) => d.day === 1 && offered.push(...d.offered.map((o) => o.attraction.id)),
  });
  const day = trip.itinerary[0];
  const ids = day.attractions.map((a) => a.id);
  // Priority 1 is popularity; priority 2 (accessibility) decides within the same popularity:
  // museum and gallery (confirmed for blind visitors) come before church and garden (all 8.0).
  assert.ok(offered.indexOf('museum') < offered.indexOf('church') && offered.indexOf('gallery') < offered.indexOf('church'), offered.join(','));
  assert.ok(offered.indexOf('museum') < offered.indexOf('garden'), offered.join(','));
  assert.ok(ids.some((id) => !['museum', 'gallery'].includes(id)), 'places without a confirmation are still allowed');
  assert.ok(ids.length <= pacingFor(['blind']).maxPerDay!, `at most ${pacingFor(['blind']).maxPerDay} places`);
  // A quiet break after each visit: the next item starts at least break + travel later.
  const visits = day.slots.filter((s) => s.kind !== 'restaurant').sort((a, b) => a.start - b.start);
  for (let i = 1; i < visits.length; i++) {
    const gap = visits[i].start - visits[i - 1].end;
    assert.ok(gap >= pacingFor(['blind']).breakMinutes, `gap ${gap} min between visits`);
  }
  assert.equal(day.breakMinutes, 15);
});

test('accessibility: autism + ADHD → the gentlest pace wins (3 a day, 30-minute breaks, visits ≤ 90 min)', () => {
  assert.deepEqual(pacingFor(['autism', 'adhd']), { maxPerDay: 3, breakMinutes: 30, maxVisitMinutes: 90 });
  assert.deepEqual(pacingFor([]), { breakMinutes: 0 });
  assert.deepEqual(pacingFor(['unknown']), { breakMinutes: 0 });
});

test('accessibility: strict with nothing confirmed explains itself instead of an empty trip', async () => {
  const { p } = setup();
  await assert.rejects(generateTrip(req({ accessNeeds: ['hearing'], accessStrict: true }), p), (e: unknown) => e instanceof PlannerError && e.code === 'noAccessible');
});

test('accessibility: strict with nothing confirmed asks first — "plan anyway" plans with every place marked, without asking the server again', async () => {
  const { p, asked } = setup();
  const questions: string[][] = [];
  const trip = await generateTrip(req({ accessNeeds: ['hearing'], accessStrict: true }), p, undefined, undefined, {
    planWithoutConfirmation: async (needs) => {
      questions.push(needs);
      return true;
    },
  });
  assert.deepEqual(questions, [['hearing']]);
  assert.equal(trip.accessStrict, false, 'the plan says it is not limited to confirmed places');
  assert.ok(trip.itinerary[0].attractions.length > 0, 'the best places are planned');
  assert.deepEqual(trip.accessNeeds, ['hearing'], 'each place still says what is and is not confirmed');
  assert.equal(asked.length, 1, 'the places already found are reused');
  // Saying no keeps the old answer.
  await assert.rejects(
    generateTrip(req({ accessNeeds: ['hearing'], accessStrict: true }), setup().p, undefined, undefined, { planWithoutConfirmation: async () => false }),
    (e: unknown) => e instanceof PlannerError && e.code === 'noAccessible',
  );
});

test('accessibility: ADHD alone (not checkable at venues) only changes the pace, never filters places', async () => {
  const { p, asked } = setup();
  const trip = await generateTrip(req({ accessNeeds: ['adhd'], accessStrict: true }), p);
  assert.deepEqual(asked, [undefined]);
  assert.ok(trip.itinerary[0].attractions.length >= 3);
  for (const s of trip.itinerary[0].slots.filter((x) => x.kind === 'attraction')) assert.ok(s.end - s.start <= 90, 'visits capped at 90 min');
});

test('camps: disability defaults to empty, provider to Differentroute; filters by needs and organiser', () => {
  const base = { id: 1, name: 'A', description: '', startDate: '2027-07-01', endDate: '2027-07-10', minAge: 10, maxAge: 15, country: 'CZ', price: 1000, link: '', photos: [] };
  const a = Camp.fromJSON(base);
  assert.deepEqual(a.disability, []);
  assert.equal(a.provider, 'Differentroute');
  assert.ok(a.bookableInApp);
  const b = Camp.fromJSON({ ...base, id: 2, provider: 'Other Camps Ltd', disability: ['autism', 'adhd'] });
  assert.equal(b.bookableInApp, false);
  assert.deepEqual(filterCamps([a, b], { name: '', needs: ['autism'] }).map((c) => c.id), [2]);
  assert.deepEqual(filterCamps([a, b], { name: '', needs: ['autism', 'blind'] }).map((c) => c.id), [], 'every chosen need must be supported');
  assert.deepEqual(filterCamps([a, b], { name: '', provider: 'Differentroute' }).map((c) => c.id), [1]);
  assert.deepEqual(providersOf([b, a]), ['Differentroute', 'Other Camps Ltd']);
  assert.ok(supportsAll(['autism', 'adhd'], ['adhd']));
  assert.equal(JSON.parse(JSON.stringify(b.toJSON())).provider, 'Other Camps Ltd');
});
