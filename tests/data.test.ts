import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOOKING_FORM_CAMP_OPTIONS, CAMPS, campFromData, campPageFromData } from '../src/data/camps';
import { SEED_EVENT_COUNT, seedEvents } from '../src/data/seedEvents';
import { validateEvent } from '../src/models';
import { LANGS } from '../src/i18n/localized';

test('every camp has real photos from differentroute.net and a booking option', () => {
  assert.equal(CAMPS.length, 16);
  for (const c of CAMPS) {
    assert.ok(c.photos.length >= 1, c.slug);
    for (const [file, page] of c.photos) {
      assert.match(file, /^8d160b_[0-9a-f]{32}~mv2\.(png|jpe?g|webp)$/, `${c.slug} photo id`);
      assert.match(page, /^https:\/\/www\.differentroute\.net/);
    }
    assert.ok((BOOKING_FORM_CAMP_OPTIONS as readonly string[]).includes(c.bookingOption), c.slug);
    assert.ok(c.minAge < c.maxAge && c.price > 0);
    assert.ok(c.startDate < c.endDate);
  }
});

test('camp itineraries exist in all three languages and convert to models', () => {
  for (const c of CAMPS) {
    for (const lang of LANGS) {
      const camp = campFromData(c, lang);
      assert.ok(camp.name && camp.description, `${c.slug} ${lang}`);
      assert.equal(camp.toElement().id, c.id);
      const page = campPageFromData(c, lang);
      assert.equal(page.dayByDayItinerary.length, c.itinerary.length);
      page.dayByDayItinerary.forEach((d, i) => assert.ok(d.trim().length > 10, `${c.slug} day ${i + 1} ${lang}`));
    }
  }
  // Only Armenia (404 on the site) and the Netherlands (no page) have no itinerary.
  assert.deepEqual(
    CAMPS.filter((c) => !c.itinerary.length).map((c) => c.slug).sort(),
    ['armenia-camp', 'netherlands-camp'],
  );
});

test('every bundled event is physical, sourced and has credited photos', () => {
  assert.ok(SEED_EVENT_COUNT >= 20);
  for (const lang of LANGS) {
    for (const e of seedEvents(lang)) {
      const problems = validateEvent(e.toJSON());
      assert.deepEqual(problems, [], `${e.id}: ${problems.join(', ')}`);
      assert.ok(e.name && e.description, `${e.id} ${lang}`);
    }
  }
});

test('validateEvent rejects online events and photos without a source', () => {
  const ok = seedEvents('en')[0].toJSON();
  assert.deepEqual(validateEvent(ok), []);
  assert.ok(validateEvent({ ...ok, venue: 'Online livestream' }).includes('onlineEvent'));
  assert.ok(validateEvent({ ...ok, photoSources: [] }).includes('missingPhotoSource'));
  assert.ok(validateEvent({ ...ok, location: { locLat: 0, locLon: 0 } }).includes('missingMapPin'));
  assert.ok(validateEvent({ ...ok, link: 'not a link' }).includes('missingSourceLink'));
});
