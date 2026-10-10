import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessLinks, findNeeds, htmlToText, isPublicWebUrl } from '../src/accessibility/phrases';

test('venue text: each need is recognised on its own wording only', () => {
  const autismOnly = findNeeds('We offer a sensory map, ear defenders and a quiet room for autistic visitors.');
  assert.deepEqual(Object.keys(autismOnly), ['autism'], 'a quiet room says nothing about blind, deaf or wheelchair visitors');
  const blind = findNeeds('Audio description tours and tactile models are available for blind and partially sighted visitors.');
  assert.deepEqual(Object.keys(blind), ['blind']);
  const hearing = findNeeds('An induction loop is fitted at the ticket desk; British Sign Language tours monthly.');
  assert.deepEqual(Object.keys(hearing), ['hearing']);
  const physical = findNeeds('The museum is step-free throughout, with accessible toilets on every floor.');
  assert.deepEqual(Object.keys(physical), ['physical']);
});

test('venue text: common false friends are ignored', () => {
  assert.deepEqual(findNeeds('Close the window blinds. Take the ski lift to the top. Films are subtitled in English.'), {});
  assert.deepEqual(findNeeds('A skate ramp and a quiet street café.'), {});
});

test('venue text: Hebrew, Russian, French and German wording', () => {
  assert.ok(findNeeds('האתר נגיש לכיסאות גלגלים ויש שירותי נכים').physical);
  assert.ok(findNeeds('סיורים בשפת הסימנים ולולאת השראה בקופות').hearing);
  assert.ok(findNeeds('Экскурсии с тифлокомментированием для незрячих посетителей').blind);
  assert.ok(findNeeds('Пандус и туалет для колясочников').physical);
  assert.ok(findNeeds('Heures calmes pour les visiteurs autistes').autism);
  assert.ok(findNeeds('Das Museum ist barrierefrei und stufenlos erreichbar').physical);
});

test('finding the accessibility page: same-site links first, by link text or address', () => {
  const html = `<a href="/en/visit">Visit</a><a href="/en/visit/accessibility">Access for all</a>
    <a href="https://partner.org/accessibility">Partner</a><a href="/he/נגישות">נגישות</a>`;
  const links = accessLinks(html, 'https://www.museum.org/en/', 3);
  assert.equal(links[0], 'https://www.museum.org/en/visit/accessibility');
  assert.ok(links.includes('https://partner.org/accessibility'));
  assert.ok(!links.includes('https://www.museum.org/en/visit'));
  assert.equal(htmlToText('<style>x{}</style><p>Step&nbsp;free</p>'), 'Step free');
});

test('only public web addresses are fetched', () => {
  assert.ok(isPublicWebUrl('https://www.louvre.fr/en/visit'));
  for (const bad of ['http://localhost/x', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://metadata.google.internal/', 'file:///etc/passwd', 'http://intranet/', 'http://[::1]/']) {
    assert.equal(isPublicWebUrl(bad), false, bad);
  }
});
