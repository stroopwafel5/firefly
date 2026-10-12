import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessLinks, findNeeds, htmlToText, isPublicWebUrl } from '../src/accessibility/phrases';
import { accessQuery, mapFeatureFor, needsFromTags, readMapAccess } from '../src/accessibility/osmAccess';

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

test('venue text: Arabic, Dutch, Polish, Czech, Portuguese, Turkish and Japanese wording', () => {
  assert.ok(findNeeds('جولات خاصة للمكفوفين وضعاف البصر مع كتيبات بطريقة برايل').blind);
  assert.ok(findNeeds('المتحف مجهز لاستقبال الكراسي المتحركة').physical);
  assert.ok(findNeeds('برنامج خاص للأطفال المصابين بالتوحد').autism);
  assert.ok(findNeeds('جولات بلغة الإشارة للصم').hearing);
  assert.ok(!findNeeds('دقيقة صمت في الصمت التام').hearing, '"silence" is not "the deaf"');
  assert.ok(findNeeds('Rondleidingen voor blinden en slechtzienden; er is een voelroute').blind);
  assert.ok(findNeeds('Prikkelarme ochtenden voor bezoekers met autisme').autism);
  assert.ok(findNeeds('Zwiedzanie z audiodeskrypcją dla osób niewidomych').blind);
  assert.ok(findNeeds('Muzeum jest dostępne dla osób na wózkach inwalidzkich').physical);
  assert.ok(findNeeds('Prohlídky pro nevidomé a slabozraké návštěvníky').blind);
  assert.ok(findNeeds('Visitas com audiodescrição para pessoas cegas').blind);
  assert.ok(findNeeds('Görme engelli ziyaretçiler için sesli betimleme').blind);
  assert.ok(findNeeds('館内は車椅子でご利用いただけます。点字パンフレットあり').blind);
  assert.ok(findNeeds('館内は車椅子でご利用いただけます。').physical);
});

test('venue text: statements about the website itself and negated phrases do not count', () => {
  assert.deepEqual(findNeeds('This website is designed to work with screen readers used by blind and partially sighted people.'), {});
  assert.deepEqual(findNeeds('האתר מותאם לקוראי מסך עבור עיוורים ולקויי ראייה, בהתאם לתקן 5568.'), {});
  assert.deepEqual(findNeeds('Версия для слабовидящих'), {});
  assert.deepEqual(findNeeds('Unfortunately the tower is not wheelchair accessible.'), {});
  assert.deepEqual(findNeeds('המגדל אינו נגיש לנכים.'), {});
  // The website's statement is skipped; the museum's own provision further on still counts.
  const mixed = findNeeds('Our website works with screen readers for blind users. Touch tours are held every Sunday for blind visitors.');
  assert.match(mixed.blind ?? '', /Touch tours/);
  assert.ok(findNeeds('האתר נגיש לכיסאות גלגלים ויש שירותי נכים').physical, 'Hebrew "האתר" is also the (tourist) site');
});

test('finding the accessibility page: links naming accessibility come before a vague "Access" link', () => {
  const html = `<a href="/getting-here">Access</a><a href="/visit/accessibility">Accessibility</a><a href="/ar/%D8%A5%D9%85%D9%83%D8%A7%D9%86%D9%8A%D8%A9-%D8%A7%D9%84%D9%88%D8%B5%D9%88%D9%84">x</a>`;
  const links = accessLinks(html, 'https://www.museum.ma/', 3);
  assert.equal(links[0], 'https://www.museum.ma/visit/accessibility');
  assert.equal(links[1], 'https://www.museum.ma/ar/%D8%A5%D9%85%D9%83%D8%A7%D9%86%D9%8A%D8%A9-%D8%A7%D9%84%D9%88%D8%B5%D9%88%D9%84', 'an Arabic address, decoded');
  assert.equal(links[2], 'https://www.museum.ma/getting-here');
});

test('OpenStreetMap: only the needs asked about are looked up, and only clear tags count', () => {
  const q = accessQuery(31.63, -8.0, 12, ['blind', 'autism']);
  assert.match(q, /tactile_paving/);
  assert.match(q, /sensory_friendly/);
  assert.ok(!q.includes('wheelchair'), 'physical was not asked');
  assert.match(q, /around:12000,31\.63000,-8\.00000/);
  assert.deepEqual(needsFromTags({ wheelchair: 'yes' }, ['physical']), { physical: 'wheelchair=yes' });
  assert.deepEqual(needsFromTags({ wheelchair: 'limited' }, ['physical']), {});
  assert.deepEqual(needsFromTags({ tactile_paving: 'yes', wheelchair: 'yes' }, ['blind']), { blind: 'tactile_paving=yes' }, 'wheelchair says nothing about blind visitors');
  assert.ok(needsFromTags({ 'blind:description:en': 'Tactile model of the medina at the entrance' }, ['blind']).blind);
  assert.deepEqual(needsFromTags({ sensory_friendly: 'yes' }, ['autism']), { autism: 'sensory_friendly=yes' });
  assert.deepEqual(needsFromTags({ hearing_loop: 'no' }, ['hearing']), {});
});

test('OpenStreetMap: the map feature is matched by Wikidata item, name in any language, or the same spot', () => {
  const list = readMapAccess(
    {
      elements: [
        { type: 'way', id: 1, center: { lat: 31.6178, lon: -7.9891 }, tags: { name: 'قصر الباهية', 'name:en': 'Bahia Palace', wheelchair: 'yes' } },
        { type: 'node', id: 2, lat: 31.6236, lon: -7.9936, tags: { name: 'متحف مراكش', wikidata: 'Q3329702', tactile_paving: 'yes' } },
        { type: 'node', id: 3, lat: 31.63, lon: -8.0, tags: { name: 'Nothing here', wheelchair: 'no' } },
      ],
    },
    ['physical', 'blind'],
  );
  assert.equal(list.length, 2, 'features without a clear tag are dropped');
  assert.equal(mapFeatureFor({ name: 'Bahia Palace', location: { locLat: 31.6181, locLon: -7.9895 } }, list)?.url, 'https://www.openstreetmap.org/way/1');
  assert.equal(mapFeatureFor({ name: 'Museum of Marrakech', location: { locLat: 31.62, locLon: -7.99 }, wikidataId: 'Q3329702' }, list)?.url, 'https://www.openstreetmap.org/node/2');
  assert.equal(mapFeatureFor({ name: 'Koutoubia Mosque', location: { locLat: 31.6241, locLon: -7.9942 } }, list), undefined, 'a different place 60 m away');
  assert.equal(mapFeatureFor({ name: 'Dar Si Said', location: { locLat: 31.6178, locLon: -7.9891 }, wikidataId: 'Q1' }, [{ ...list[0], wikidata: 'Q2' }]), undefined, 'two different Wikidata items');
});

test("Google Maps' wheelchair information confirms the physical need (an accessible entrance; a toilet alone doesn't)", async () => {
  const { wheelchairNote } = await import('../src/attractions/googlePlaces');
  assert.equal(wheelchairNote({ accessibilityOptions: { wheelchairAccessibleEntrance: true, wheelchairAccessibleRestroom: true } }), 'Wheelchair-accessible entrance, toilet');
  assert.equal(wheelchairNote({ accessibilityOptions: { wheelchairAccessibleRestroom: true, wheelchairAccessibleParking: true } }), undefined);
  assert.equal(wheelchairNote({}), undefined);
  const { mergeSources } = await import('../src/attractions/merge');
  const base = { id: '1', name: 'Wawel Castle', types: [], location: { locLat: 50.054, locLon: 19.935 }, photo_urls: [], photoSources: [], provider: 'tripadvisor' as const, link: 'https://ta/1' };
  const google = { ...base, id: 'g-1', provider: 'google' as const, link: 'https://maps.google.com/?cid=1', wheelchair: 'Wheelchair-accessible entrance' };
  const [merged] = mergeSources([[base], [google]]);
  assert.equal(merged.id, '1', 'the Tripadvisor record is kept');
  assert.equal(merged.wheelchair, 'Wheelchair-accessible entrance');
  assert.equal(merged.wheelchairPage, 'https://maps.google.com/?cid=1', 'with the Google page that says so');
});
