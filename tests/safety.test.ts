import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Location } from '../src/models';
import { WarningCollector, allowedSpot, areaStatus, parseAreaNote, tripArea } from '../src/planner/safety';
import { routeCandidates } from '../src/planner/route';
import { localPlaceMatches } from '../src/planner/places';

const at = (lat: number, lon: number) => new Location(lat, lon);
const israelTrip = tripArea([{ location: at(32.08, 34.78), country: 'IL' }, { location: at(33.28, 35.57), country: 'IL' }]);

test('safety: the Gaza Strip is closed; the Israeli towns along its fence are not', () => {
  for (const [name, lat, lon] of [
    ['Gaza City', 31.5017, 34.4668],
    ['Khan Yunis', 31.346, 34.306],
    ['Rafah', 31.2969, 34.2455],
    ['Deir al-Balah', 31.4183, 34.3503],
  ] as const) {
    assert.equal(areaStatus(at(lat, lon))?.id, 'gaza', name);
    assert.equal(allowedSpot(at(lat, lon), 'PS', israelTrip), false, name);
  }
  for (const [name, lat, lon] of [
    ['Sderot', 31.525, 34.596],
    ['Netiv HaAsara', 31.58, 34.54],
    ['Nahal Oz', 31.4735, 34.4975],
    ["Be'eri", 31.425, 34.493],
    ['Kissufim', 31.373, 34.398],
    ['Nir Oz', 31.31, 34.402],
    ['Kerem Shalom', 31.2287, 34.2833],
    ['Egyptian Rafah', 31.28, 34.22],
    ['Ashkelon', 31.668, 34.574],
  ] as const) {
    assert.equal(areaStatus(at(lat, lon), name === 'Egyptian Rafah' ? 'EG' : 'IL'), null, name);
  }
});

test('safety: the planner never routes to Gaza, North Korea, or across a closed border', () => {
  const allowed = routeCandidates().filter((c) => allowedSpot(c.location, c.country, israelTrip));
  assert.ok(!allowed.some((c) => c.name === 'Gaza'), 'Gaza is never a stop');
  assert.ok(!allowed.some((c) => c.country === 'KP'), 'nothing in North Korea');
  assert.ok(!allowed.some((c) => c.name === 'Beirut' || c.name === 'Damascus'), 'no stops in Lebanon or Syria on a trip from Israel');
  assert.ok(allowed.some((c) => c.country === 'JO'), 'Jordan stays possible (open crossings)');
  // A trip the traveller starts in Lebanon may use Lebanon.
  const beirut = tripArea([{ location: at(33.893, 35.502), country: 'LB' }]);
  assert.equal(allowedSpot(at(34.12, 35.65), 'LB', beirut), true, 'Byblos on a Beirut trip');
  assert.equal(allowedSpot(at(31.5017, 34.4668), '', beirut), false, 'Gaza never');
});

test('safety: sights across the border from Metula and the Golan are left out, Israeli ones kept', () => {
  // Beaufort Castle (Lebanon) — a source without a country code.
  assert.equal(allowedSpot(at(33.3247, 35.5303), '', israelTrip), false);
  for (const [name, lat, lon] of [
    ['Rosh HaNikra grottoes', 33.093, 35.1046],
    ['Metula', 33.2785, 35.5772],
    ['Misgav Am', 33.2475, 35.5481],
    ['Margaliot', 33.214, 35.545],
    ['Majdal Shams', 33.268, 35.77],
    ['Mount Hermon ski site', 33.3, 35.78],
    ['Ein Zivan', 33.098, 35.797],
    ['Hamat Gader', 32.683, 35.661],
  ] as const) {
    assert.equal(allowedSpot(at(lat, lon), '', israelTrip), true, name);
  }
});

test('safety: PA towns, Ukraine and Crimea are planned with a warning', () => {
  assert.equal(areaStatus(at(31.7044, 35.2077), 'PS')?.id, 'paArea', 'Bethlehem');
  assert.equal(areaStatus(at(31.9038, 35.2034))?.id, 'paArea', 'Ramallah');
  assert.equal(areaStatus(at(31.8569, 35.46))?.id, 'paArea', 'Jericho');
  assert.equal(allowedSpot(at(31.7044, 35.2077), 'PS', israelTrip), true, 'Bethlehem is allowed');
  // Jerusalem's own neighbourhoods and the settlements next to the towns get no warning.
  for (const [name, lat, lon] of [
    ['Har Homa', 31.722, 35.222],
    ['Gilo', 31.736, 35.186],
    ['Old City of Jerusalem', 31.7767, 35.2345],
    ['Kiryat Arba', 31.535, 35.122],
    ['Ariel', 32.106, 35.17],
  ] as const) {
    assert.equal(areaStatus(at(lat, lon), 'IL'), null, name);
  }
  assert.equal(areaStatus(at(50.455, 30.524), 'UA')?.id, 'ukraine', 'Kyiv');
  assert.equal(areaStatus(at(44.95, 34.1), 'UA')?.id, 'crimea', 'Simferopol');
  assert.equal(areaStatus(at(44.6, 33.52), 'RU')?.id, 'crimea', 'Sevastopol, whatever code a source gives');
  assert.equal(areaStatus(at(48.015, 37.8), 'UA')?.id, 'occupiedUkraine', 'Donetsk');
  assert.equal(areaStatus(at(46.17, 34.82), 'UA')?.id, 'occupiedUkraine', 'Henichesk is not Crimea');
  assert.equal(areaStatus(at(51.389, 30.099), 'UA')?.level, 'closed', 'Chernobyl zone');
  for (const p of [at(50.455, 30.524), at(44.95, 34.1)]) assert.equal(allowedSpot(p, 'UA', israelTrip), true);
});

test('safety: warnings are collected per area with days and places', () => {
  const w = new WarningCollector();
  w.add(2, at(31.7044, 35.2077), 'PS', 'Church of the Nativity');
  w.add(2, at(31.705, 35.208), 'PS', 'Manger Square');
  w.add(3, at(31.8569, 35.46), 'PS', 'Tel Jericho');
  w.add(1, at(31.7767, 35.2345), 'IL', 'Western Wall');
  const notes = w.notes();
  assert.equal(notes.length, 1);
  const parsed = parseAreaNote(notes[0])!;
  assert.equal(parsed.id, 'paArea');
  assert.deepEqual(parsed.days, [2, 3]);
  assert.deepEqual(parsed.places, ['Bethlehem', 'Jericho']);
});

test('safety: closed places are not suggested while typing', () => {
  assert.ok(!localPlaceMatches('Gaz').some((s) => s.name === 'Gaza'));
  assert.ok(!localPlaceMatches('Pyong').some((s) => s.country === 'KP'));
});
