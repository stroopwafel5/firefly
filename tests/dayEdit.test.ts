import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Attraction, DayPlan, Location, MODE_CAR, WeeklyHours } from '../src/models';
import { moveToDay, orderFromDay, removeItem, reorder } from '../src/planner/dayEdit';

const P = new Location(50.0875, 14.4213);
const H = (h: number, m = 0) => h * 60 + m;
const week = (o: number, c: number): WeeklyHours => Array.from({ length: 7 }, () => [{ open: o, close: c }]);
const at = (id: string, d: number, hours?: WeeklyHours) =>
  new Attraction(id, id, '', ['History'], 'CZ', null, 'https://ta', [], new Location(P.locLat + d, P.locLon), [], [], hours, 4.5, 100, 'Museums', 90);

function day(id: number, date: Date, items: Attraction[]): DayPlan {
  let t = H(9);
  const slots = items.map((a) => {
    const s = { key: `k-${a.id}`, kind: 'attraction' as const, refId: a.id, start: t + 10, end: t + 100, fixed: false };
    t += 110;
    return s;
  });
  return new DayPlan(id, '09:00', '18:00', items, [], [], null, date, slots, P, 'Prague', [], [], {}, { id: 'base', name: 'Hotel', location: P });
}

const sat = new Date(2026, 9, 17);
const sun = new Date(2026, 9, 18);

test('reorder keeps a valid order and rejects one that breaks opening hours', () => {
  const d = day(1, sat, [at('early', 0.001, week(H(9), H(11))), at('b', 0.002), at('c', 0.003)]);
  const ok = reorder(d, 2, 1, MODE_CAR);
  assert.ok('day' in ok);
  if ('day' in ok) assert.deepEqual(orderFromDay(ok.day).map((o) => o.id), ['early', 'c', 'b']);
  const bad = reorder(d, 0, 2, MODE_CAR);
  assert.ok('error' in bad);
  if ('error' in bad) assert.equal(bad.error.reason, 'closed');
});

test('removing an item pulls the rest earlier', () => {
  const d = day(1, sat, [at('a', 0.001), at('b', 0.002)]);
  const after = removeItem(d, 'k-a', MODE_CAR);
  assert.equal(after.slots.length, 1);
  assert.equal(after.attractions.length, 1);
  assert.ok(after.slots[0].start < d.slots[1].start);
});

test('move to another day inserts at a working position', () => {
  const d1 = day(1, sat, [at('a', 0.001), at('b', 0.002)]);
  const d2 = day(2, sun, [at('c', 0.001)]);
  const r = moveToDay(d1, d2, 'k-b', MODE_CAR);
  assert.ok('to' in r);
  if ('to' in r) {
    assert.deepEqual(r.from.attractions.map((a) => a.id), ['a']);
    assert.deepEqual(r.to.attractions.map((a) => a.id).sort(), ['b', 'c']);
    assert.equal(r.to.slots.length, 2);
  }
});

test('move is refused when the place is closed on the other day', () => {
  const closedSunday: WeeklyHours = week(H(9), H(17));
  closedSunday[0] = [];
  const d1 = day(1, sat, [at('museum', 0.001, closedSunday)]);
  const d2 = day(2, sun, [at('c', 0.001)]);
  const r = moveToDay(d1, d2, 'k-museum', MODE_CAR);
  assert.ok('error' in r);
  if ('error' in r) assert.equal(r.error.reason, 'closedDay');
});
