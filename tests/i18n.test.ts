import { test } from 'node:test';
import assert from 'node:assert/strict';
import en from '../src/i18n/en';
import he from '../src/i18n/he';
import ru from '../src/i18n/ru';
import { formatClock, pluralForm, translate, translatePlural } from '../src/i18n/translate';

test('Hebrew and Russian translate every English key, with the same placeholders', () => {
  const keys = Object.keys(en) as Array<keyof typeof en>;
  for (const [name, dict] of [['he', he], ['ru', ru]] as const) {
    for (const k of keys) {
      assert.ok(dict[k]?.trim(), `${name} is missing ${k}`);
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
      if (!k.endsWith('_one')) assert.equal(ph(dict[k]), ph(en[k]), `${name} placeholders differ in ${k}`);
    }
  }
});

test('Hebrew text is actually Hebrew and Russian is Cyrillic', () => {
  assert.match(he['camps.title'], /[֐-׿]/);
  assert.match(ru['camps.title'], /[Ѐ-ӿ]/);
});

test('plural rules', () => {
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25].map((n) => pluralForm('ru', n)), ['one', 'few', 'many', 'many', 'one', 'few', 'many']);
  assert.equal(translatePlural('ru', 'common.days', 3), '3 дня');
  assert.equal(translatePlural('en', 'common.days', 1), '1 day');
  assert.equal(translatePlural('he', 'common.days', 1), 'יום אחד');
});

test('interpolation and clock', () => {
  assert.equal(translate('en', 'camps.day', { n: 3 }), 'Day 3');
  assert.equal(formatClock(1500), '01:00');
  assert.equal(formatClock(8 * 60 + 5), '08:05');
});

test('every dynamically built translation key exists in all languages', async () => {
  const { EVENT_TYPES } = await import('../src/models');
  const { RELATIONSHIPS } = await import('../src/services/bookingRelationships');
  const keys = [
    ...EVENT_TYPES.map((t) => `type.${t}`),
    ...RELATIONSHIPS.map((r) => `booking.rel.${r}`),
    ...['missingName', 'missingSourceLink', 'missingVenue', 'missingMapPin', 'onlineEvent', 'missingPhoto', 'missingPhotoSource', 'missingType', 'badDates', 'mustConfirm'].map((p) => `addEvent.err.${p}`),
    ...['city', 'dates', 'tooLong', 'travellers', 'nothingFound', 'noAccessible', 'noAttractions', 'closedArea'].map((c) => `planner.err.${c}`),
    ...['geocode', 'attractions', 'events', 'food', 'routes', 'details', 'kids'].map((s) => `planner.step.${s}`),
    ...['paArea', 'ukraine', 'crimea', 'occupiedUkraine', 'noIsraeliEntry'].map((a) => `plan.area.${a}`),
    ...['google', 'tripadvisor', 'openstreetmap'].map((h) => `plan.hoursChecked.${h}`),
    ...['wikipedia', 'google', 'tripadvisor', 'wikidata', 'openstreetmap'].map((d) => `attraction.src.${d}`),
    ...['tripadvisor', 'google', 'wikidata', 'osm', 'backup', 'phone'].map((k) => `plan.src.${k}`),
    ...['closed', 'closedDay', 'afterEnd', 'overlap'].map((r) => `plan.reason.${r}`),
    ...['month', 'thisWeekend', 'nextWeekend'].map((w) => `weekend.window.${w}`),
    ...['campBooked', 'eventGoing', 'tripCreated', 'tripAdded', 'friendRequest', 'friendAccepted'].map((n) => `notif.${n}`),
    ...['en', 'he', 'ru'].map((l) => `lang.${l}`),
    ...['CN', 'BY', 'MK', 'GB', 'AM', 'JP', 'CZ', 'MD', 'RS', 'KR', 'DE', 'NL', 'IL', 'MX', 'NG', 'ID'].map((c) => `country.${c}`),
  ];
  for (const [name, dict] of [['en', en], ['he', he], ['ru', ru]] as const) {
    for (const k of keys) assert.ok((dict as Record<string, string>)[k], `${name} is missing ${k}`);
  }
});
