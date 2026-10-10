import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFields, growUrl, ilsAmount, isPaidNotice, israeliMobile, parseMultipart, parseNotice } from '../src/growCore';

test('Grow: sandbox and production addresses', () => {
  assert.equal(growUrl('sandbox', 'createPaymentProcess'), 'https://sandbox.meshulam.co.il/api/light/server/1.0/createPaymentProcess');
  assert.equal(growUrl('production', 'approveTransaction'), 'https://secure.meshulam.co.il/api/light/server/1.0/approveTransaction');
});

test('Grow: amount in shekels from the catalogue (own ILS price wins, else rate, rounded up)', () => {
  assert.equal(ilsAmount(2200, 4.0), 8800);
  assert.equal(ilsAmount(1999, 3.97), 7937);
  assert.equal(ilsAmount(2200, 4.0, 8500), 8500);
  assert.throws(() => ilsAmount(0, 4));
});

test('Grow: Israeli mobile numbers in every common spelling', () => {
  assert.equal(israeliMobile('', '054-123-4567'), '0541234567');
  assert.equal(israeliMobile('+972', '54 123 4567'), '0541234567');
  assert.equal(israeliMobile('', '972541234567'), '0541234567');
  assert.equal(israeliMobile('', '541234567'), '0541234567');
  assert.equal(israeliMobile('+44', '7700 900123'), null);
});

test('Grow: payment page fields carry the booking id and never a card number', () => {
  const f = createFields({ pageCode: 'pc', userId: 'u', sum: 8800, description: 'Different Route — Summer Camp in China', fullName: 'Dana Cohen', phone: '0541234567', email: 'd@x.co', notifyUrl: 'https://n', bookingId: 'B1', uid: 'U1' });
  assert.equal(f.sum, '8800.00');
  assert.equal(f['pageField[fullName]'], 'Dana Cohen');
  assert.equal(f.cField1, 'B1');
  assert.equal(f.successUrl, 'https://www.differentroute.net/?firefly=grow-return');
  assert.ok(!('apiKey' in f));
  assert.ok(!Object.keys(f).some((k) => /card/i.test(k)));
});

test('Grow: callback as form fields or JSON gives the same notice', () => {
  const form = parseNotice({ status: '1', 'data[processId]': '332002', 'data[processToken]': 'tok', 'data[transactionId]': '145111110', 'data[statusCode]': '2', 'data[status]': 'שולם', 'data[sum]': '269', 'data[customFields][cField1]': 'B1' });
  const json = parseNotice({ status: '1', data: { processId: '332002', processToken: 'tok', transactionId: '145111110', statusCode: '2', status: 'שולם', sum: '269', customFields: { cField1: 'B1' } } });
  for (const n of [form, json]) {
    assert.equal(n.processId, '332002');
    assert.equal(n.transactionId, '145111110');
    assert.equal(n.bookingId, 'B1');
    assert.equal(n.sum, 269);
    assert.ok(isPaidNotice(n));
  }
  assert.equal(isPaidNotice({ statusCode: '0', statusText: 'נכשל' }), false);
});

test('Grow: multipart callback bodies are read', () => {
  const body = ['--XYZ', 'Content-Disposition: form-data; name="data[processId]"', '', '77', '--XYZ', 'Content-Disposition: form-data; name="data[customFields][cField1]"', '', 'B9', '--XYZ--', ''].join('\r\n');
  const fields = parseMultipart(body, 'multipart/form-data; boundary=XYZ');
  assert.equal(fields['data[processId]'], '77');
  assert.equal(parseNotice(fields).bookingId, 'B9');
});
