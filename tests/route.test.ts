import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Attraction, Location, MODE_CAR } from '../src/models';
import { haversineKm } from '../src/planner/geo';
import {
  Place,
  chooseNextStop,
  cityExhausted,
  compareRank,
  fitsNiche,
  greedyOrder,
  isWorldCity,
  legsNeeded,
  maxLegKm,
  overStay,
  plannable,
  rankOf,
  routeCandidates,
  sizeTier,
} from '../src/planner/route';

const PRAGUE = new Location(50.088, 14.421);
const ATHENS = new Location(37.984, 23.728);
const place = (id: string, loc: Location, kind: Place['kind'] = 'start'): Place => ({ id, name: id, country: '', location: loc, population: 0, kind });

function att(id: string, popularity: number, dLat = 0, extra: Partial<Attraction> = {}): Attraction {
  const a = new Attraction(id, id, '', [], 'CZ', null, 'https://x', [], new Location(PRAGUE.locLat + dLat, PRAGUE.locLon), []);
  a.popularity = popularity;
  return Object.assign(a, extra);
}

test('greedy order: popularity first, then accessibility, then type/age, then the nearest', () => {
  const n = { types: ['History' as const], familyTrip: true, needs: ['physical'] };
  const far = att('far', 9.6, 0.05);
  const near = att('near', 9.5, 0.001); // same half-point bucket (9.5) as "far"
  const access = att('access', 9.5, 0.04, { disabilityCompatible: ['physical'] });
  const history = att('history', 9.5, 0.03, { types: ['History'] });
  const low = att('low', 8.2, 0.0);
  const order = greedyOrder([low, near, far, history, access], PRAGUE, n, 10).map((a) => a.id);
  // far/near/access/history are all in the 9.5 bucket: accessibility wins, then type, then the
  // distance from the previous place ("far" is nearer to "history" than "near" is).
  assert.deepEqual(order, ['access', 'history', 'far', 'near', 'low']);
  assert.deepEqual(rankOf(history, n), [9.5, 0, 1]);
  assert.ok(compareRank([9, 1, 0], [9, 0, 2]) < 0, 'priority 2 beats priority 3');
});

test('moving on: a city is done when no 9.0+ place and no 7.0+ niche place is left', () => {
  const history = { types: ['History' as const], familyTrip: false, needs: [] };
  assert.equal(cityExhausted([att('a', 9.1)], history), false, 'a 9+ place keeps us here');
  assert.equal(cityExhausted([att('b', 7.4, 0, { types: ['History'] })], history), false, 'a 7+ place in the niche keeps us');
  assert.equal(cityExhausted([att('c', 8.5, 0, { types: ['Nature'] })], history), true, '8.5 but not in the niche');
  assert.equal(cityExhausted([att('d', 6.9, 0, { types: ['History'] })], history), true, 'in the niche but under 7');
  assert.equal(fitsNiche(att('e', 8), { types: [], familyTrip: false, needs: [] }), true, 'nothing chosen: everything fits');
});

test('4-day limit, except in world cities', () => {
  const prague = place('prague', PRAGUE, 'city');
  const paris = place('paris', new Location(48.857, 2.352), 'city');
  assert.equal(overStay(prague, 3), false);
  assert.equal(overStay(prague, 4), true);
  assert.equal(overStay(paris, 9), false);
  assert.ok(isWorldCity(new Location(51.5, -0.12)), 'London');
  assert.ok(!isWorldCity(PRAGUE));
});

test('next stop Prague → Athens: a big city closer to Athens, within a day, no detour', () => {
  const cities = routeCandidates();
  assert.ok(cities.length > 2500, 'the GeoNames city list is bundled');
  const prague = place('start', PRAGUE);
  const athens = place('end', ATHENS, 'end');
  const leg = maxLegKm(MODE_CAR);
  const visited = new Set<string>(['start']);
  const stops: Place[] = [];
  let cur = prague;
  for (let guard = 0; guard < 12 && haversineKm(cur.location, ATHENS) > 60; guard++) {
    const next = chooseNextStop({ current: cur, target: athens, oneWay: true, daysAfter: 8, visited, maxLegKm: leg });
    assert.ok(haversineKm(cur.location, next.location) <= leg, `${next.name} is within a day`);
    assert.ok(haversineKm(next.location, ATHENS) < haversineKm(cur.location, ATHENS), `${next.name} gets closer to Athens`);
    stops.push(next);
    visited.add(next.id);
    cur = next;
  }
  assert.equal(stops[stops.length - 1].id, 'end', 'arrives in Athens');
  assert.ok(stops.slice(0, -1).every((s) => sizeTier(s) >= 1), `big cities only: ${stops.map((s) => s.name).join(' → ')}`);
  assert.ok(stops.some((s) => ['Budapest', 'Belgrade', 'Sofia', 'Bucharest', 'Skopje', 'Thessaloníki'].includes(s.name)), stops.map((s) => s.name).join(' → '));
});

test('next stop keeps the destination reachable in the days left, and the last day goes there', () => {
  const athens = place('end', ATHENS, 'end');
  const budapest = place('budapest', new Location(47.498, 19.04), 'city');
  const leg = maxLegKm(MODE_CAR);
  assert.equal(chooseNextStop({ current: budapest, target: athens, oneWay: true, daysAfter: 0, visited: new Set(), maxLegKm: leg }).id, 'end');
  const next = chooseNextStop({ current: budapest, target: athens, oneWay: true, daysAfter: 2, visited: new Set(), maxLegKm: leg });
  assert.ok(legsNeeded(next.location, ATHENS, leg) <= 2, `${next.name}: Athens reachable in 2 days`);
});

test('round trip: the next city is close enough to get home in time', () => {
  const prague = place('start', PRAGUE);
  const next = chooseNextStop({ current: prague, target: prague, oneWay: false, daysAfter: 1, visited: new Set(['start']), maxLegKm: maxLegKm(MODE_CAR) });
  assert.notEqual(next.id, 'start');
  assert.ok(haversineKm(PRAGUE, next.location) <= 450 && haversineKm(PRAGUE, next.location) >= 60, next.name);
});

test('sights by what the traveller chose: no rentals or spas; shops and night clubs only when chosen; meals never; cafés and sweets only with Food', () => {
  assert.equal(plannable(att('bike', 9, 0, { kind: 'rental' }), ['Extreme Sport']), false);
  assert.equal(plannable(att('spa', 9, 0, { kind: 'spa' }), ['Food']), false);
  assert.equal(plannable(att('bar', 9, 0, { kind: 'nightlife' }), ['Food']), false);
  assert.equal(plannable(att('club', 9, 0, { kind: 'nightlife' }), ['Night Clubs']), true);
  assert.equal(plannable(att('mall', 9, 0, { kind: 'shopping' }), []), false);
  assert.equal(plannable(att('mall', 9, 0, { kind: 'shopping' }), ['Shopping']), true);
  // Meals: never sights, Food or not.
  assert.equal(plannable(att('De Branderie', 9, 0, { description: 'De Branderie is an atmospheric and cozy lunchroom in the middle of Enschede.' }), ['Food']), false);
  assert.equal(plannable(att('Frank & Charlie', 9, 0, { description: 'A bustling spot for breakfast, lunch and everything in between. We serve locally roasted specialty coffee.' }), ['Food']), false);
  assert.equal(plannable(att('Ristorante Da Mario', 9, 0, { kind: 'food' }), ['Food']), false);
  // Coffee and sweets: only with Food.
  assert.equal(plannable(att('Meisje Koffiegeschenk', 9, 0), []), false);
  assert.equal(plannable(att('Meisje Koffiegeschenk', 9, 0), ['Food']), true);
  assert.equal(plannable(att('Gelateria La Romana', 9, 0, { kind: 'food' }), ['Food']), true);
  // Food you go to see, and other sights.
  assert.equal(plannable(att('Golan Heights Winery', 9, 0, { kind: 'food' }), []), true);
  assert.equal(plannable(att('Markthal', 9, 0, { kind: 'food', category: 'Farmers Markets' }), []), true);
  assert.equal(plannable(att('Euromast', 9, 0, { kind: 'tower', description: 'Euromast is an observation tower in Rotterdam, with a restaurant at 96 m.' }), []), true);
  assert.equal(plannable(att('castle', 9, 0, { kind: 'castle' }), []), true);
});
