import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleQueries, parseTimes, resolveDay } from '../src/events/parse';
import { ISRAEL_CITIES, ISRAEL_TARGET, WORLD_TARGET, nextTwoWeekends, roundRobin } from '../src/events/plan';
import { EventJSON, inferTypes, validateEvent } from '../src/events/types';

const today = new Date(Date.UTC(2026, 9, 9)); // Fri 9 Oct 2026

test('resolveDay infers the year of "Oct 17" style dates', () => {
  assert.equal(resolveDay('Oct 17', today), '2026-10-17');
  assert.equal(resolveDay('Sat, Oct 17, 8 – 11 PM', today), '2026-10-17');
  assert.equal(resolveDay('Jan 5', today), '2027-01-05');
  assert.equal(resolveDay('17 Oct', today), '2026-10-17');
  assert.equal(resolveDay('no date here', today), null);
});

test('parseTimes reads the first time range', () => {
  assert.deepEqual(parseTimes('Sat, Oct 17, 8 – 11 PM'), { start: '20:00', end: '23:00' });
  assert.deepEqual(parseTimes('Sun, Oct 18, 10:30 AM – 4 PM'), { start: '10:30', end: '16:00' });
  assert.deepEqual(parseTimes('Oct 15 – 18'), {});
});

test('Google queries are written in the user language', () => {
  assert.deepEqual(googleQueries('Haifa', 'he'), ['אירועים בHaifa', 'סדנאות, סיורים מודרכים ופעילויות למשפחות בHaifa']);
  assert.deepEqual(googleQueries('Accra', 'en'), ['events in Accra', 'family workshops, guided tours and outdoor activities in Accra']);
});

test('next two weekends from Friday 9 Oct 2026 are 16–18 and 23–25 Oct', () => {
  const w = nextTwoWeekends(today);
  assert.equal(w.from, '2026-10-16');
  assert.equal(w.to, '2026-10-25');
  assert.deepEqual(w.days, ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-23', '2026-10-24', '2026-10-25']);
});

function ev(id: string, start: string, end = start): EventJSON {
  return {
    id,
    name: `Event ${id}`,
    description: '',
    startDate: start,
    endDate: end,
    types: ['Festival'],
    country: 'IL',
    price: 0,
    link: `https://example.org/${id}`,
    photo_urls: ['https://example.org/p.jpg'],
    photoSources: [{ url: 'https://example.org/p.jpg', sourcePage: `https://example.org/${id}`, credit: 'x' }],
    location: { locLat: 32.08, locLon: 34.78 },
    venue: 'Venue',
    address: 'Street 1, Tel Aviv',
    origin: 'google-events',
    sourceName: 'example.org',
  };
}

test('fallback mix: 50 Israel + 100 world, spread across cities, weekend events first', () => {
  assert.equal(ISRAEL_TARGET, 50);
  assert.equal(WORLD_TARGET, 100);
  assert.ok(ISRAEL_CITIES.includes('Jerusalem') && ISRAEL_CITIES.includes('Haifa'));
  const telAviv = Array.from({ length: 60 }, (_, i) => ev(`ta${i}`, '2026-10-20'));
  telAviv.push(ev('ta-weekend', '2026-10-17'));
  const haifa = [ev('h1', '2026-10-24'), ev('h2', '2026-10-21')];
  const picked = roundRobin([telAviv, haifa], 10, nextTwoWeekends(today).days);
  assert.equal(picked.length, 10);
  assert.ok(picked.some((e) => e.id.startsWith('h')), 'smaller cities still get a share');
  assert.equal(picked[0].id, 'ta-weekend', 'weekend events are taken first');
});

test('validation: physical, sourced, real photo with a source page', () => {
  assert.deepEqual(validateEvent(ev('ok', '2026-10-17')), []);
  assert.ok(validateEvent({ ...ev('o', '2026-10-17'), name: 'Online webinar' }).includes('onlineEvent'));
  assert.ok(validateEvent({ ...ev('n', '2026-10-17'), photo_urls: [], photoSources: [] }).includes('missingPhoto'));
  assert.ok(validateEvent({ ...ev('p', '2026-10-17'), location: { locLat: 0, locLon: 0 } }).includes('missingMapPin'));
});

test('event types from titles in three languages', () => {
  assert.ok(inferTypes('Jazz festival in the park').includes('Festival'));
  assert.ok(inferTypes('הצגת ילדים בתיאטרון').includes('Kid Friendly'));
  assert.ok(inferTypes('Выставка в музее').includes('History'));
  assert.deepEqual(inferTypes('Something'), ['Festival']);
});
