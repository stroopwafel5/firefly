import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../src/i18n/translate';
import type { TKey } from '../src/i18n';
import { CONSENT_ITEMS, checkHealthForm, emptyHealthForm, healthFormHtml } from '../src/services/healthFormCore';

const filled = () =>
  emptyHealthForm({
    bookingId: 'B123',
    uid: 'u1',
    guestName: 'Maya Cohen',
    dateOfBirth: '2013-05-02',
    gender: 'Female',
    arrival: '2027-07-07',
    departure: '2027-07-21',
    doctorName: 'Dr Levi',
    doctorTelephone: '03-1234567',
    regularTreatment: 'no',
    bringingMedication: 'no',
    tetanus: 'noUnsure',
    allergies: 'yes',
    allergiesDetails: 'Peanuts <severe>',
    bedWetting: 'no',
    agreement: true,
    printName: 'Dana Cohen',
    relationship: 'Mother',
    signatureSvg: 'M10,10 L50,60',
    date: '2026-10-10',
  });

test('health form: the paper form has 14 consent boxes, all optional', () => {
  assert.equal(CONSENT_ITEMS.length, 14);
  assert.deepEqual(checkHealthForm(filled()), {});
});

test('health form: missing answers, details for a "yes", and dates are checked', () => {
  const f = filled();
  f.regularTreatment = 'yes';
  f.tetanus = 'yes';
  f.tetanusLastInjection = '5/2020';
  f.agreement = false;
  f.signatureSvg = '';
  const e = checkHealthForm(f);
  assert.equal(e.regularTreatmentDetails, 'required');
  assert.equal(e.tetanusLastInjection, 'date');
  assert.equal(e.agreement, 'required');
  assert.equal(e.signatureSvg, 'required');
  assert.equal(e.allergiesDetails, undefined);
});

test('health form PDF: the English labels of the paper form, answers escaped, translation underneath in Hebrew', () => {
  const f = filled();
  f.consent.sunCream = true;
  const en = (k: string) => translate('en', k as TKey);
  const html = healthFormHtml(f, en, (k) => translate('he', k as TKey));
  for (const label of ['Guest Name', 'Booking ref', 'Doctor Telephone', 'Is your child likely to wet the bed?', 'Calpol (or equivalent)', 'Relationship to child']) {
    assert.ok(html.includes(label), label);
  }
  assert.ok(html.includes('Peanuts &lt;severe&gt;'), 'answers are escaped');
  assert.ok(html.includes('הצהרת') || html.includes('שם המשתתף'), 'Hebrew translation printed under the label');
  assert.ok(html.includes('Please print this form and bring it to the camp'), 'the reminder is on the page');
  assert.ok(html.includes('<path d="M10,10 L50,60"'), 'the signature is drawn');
  const englishOnly = healthFormHtml(f, en, () => '');
  assert.ok(!englishOnly.includes('class="tr"'), 'no translation lines in English');
});
