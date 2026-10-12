import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultWeekStart, parseEventList, readHeading, sameLinkKey } from '../src/events/upload/parse';
import { readPage } from '../src/events/upload/page';
import { SAVE_EVENT_TOOL, eventRequest, readAiEvent } from '../src/events/upload/ai';
import { ProcessDeps, processListedEvent, uploadedEventId } from '../src/events/upload/process';
import { afterFailure, checkPasscode, readPasscodes, MAX_FAILS } from '../src/events/upload/passcode';
import { localizeEvent, validateEvent } from '../src/events/types';

const SAMPLE = readFileSync(join(__dirname, 'fixtures', 'weekend-ru.txt'), 'utf8');

test('upload list: the team’s real weekend list is read as 17 events on the right days', () => {
  const r = parseEventList(SAMPLE, '2026-10-15');
  assert.equal(r.lang, 'ru');
  assert.deepEqual(r.headings.map((h) => h.date), ['2026-10-15', '2026-10-16', '2026-10-17']);
  assert.deepEqual(r.ignored, ['Софаш'], 'the list title is not an event');
  assert.equal(r.items.length, 17, '20 lines with links, Open Houses and InDNegev listed 3 times each');
  const ballet = r.items[0];
  assert.equal(ballet.title, 'Балет Щелкунчик в Нетании');
  assert.equal(ballet.url, 'https://ru.kupatbravo.co.il/announce/Израильский-балет-Щелкунчик');
  assert.deepEqual(ballet.days, ['2026-10-15']);
  assert.equal(ballet.line, 5);
  const open = r.items.find((i) => i.title === 'Открытые дома в Иерусалиме')!;
  assert.deepEqual(open.days, ['2026-10-15', '2026-10-16', '2026-10-17'], 'one event on all three days');
  assert.equal(r.items.find((i) => i.title === 'День Рамадана в Раат')!.days[0], '2026-10-17');
  assert.equal(r.items.filter((i) => i.title === 'Вивальди при свечах в Гиватайме').length, 1, 'trailing space trimmed');
});

test('upload list: Hebrew headings with dates, notes under a link, a link on the title line, a missing link', () => {
  const text = [
    'סופ"ש',
    '',
    'יום שישי 16.10',
    'פיקניק טבעוני גדול',
    'https://www.instagram.com/p/abc/',
    'Sacher Park, Jerusalem, 11:00',
    '',
    'מוצ"ש:',
    'ג׳אז בנמל — https://example.com/jazz).',
    '',
    'סיור בלי קישור',
    '',
    'יום ראשון',
    'שוק איכרים https://example.org/market',
  ].join('\n');
  const r = parseEventList(text, '2026-10-15');
  assert.equal(r.lang, 'he');
  assert.deepEqual(r.headings.map((h) => h.date), ['2026-10-16', '2026-10-17', '2026-10-18'], 'the Sunday after Saturday');
  const [picnic, jazz, noLink, market] = r.items;
  assert.equal(picnic.notes, 'Sacher Park, Jerusalem, 11:00');
  assert.equal(jazz.title, 'ג׳אז בנמל');
  assert.equal(jazz.url, 'https://example.com/jazz', 'trailing punctuation dropped');
  assert.equal(noLink.url, '');
  assert.deepEqual(market.days, ['2026-10-18']);
  assert.equal(readHeading('שבת בנמל יפו'), null, 'an event title that starts with a day name is not a heading');
  assert.equal(readHeading('Четверг 15.10')?.day, 15);
  assert.equal(sameLinkKey('https://ecrahat.com/%D7%A8%D7%9E%D7%93%D7%90%D7%9F-360/'), sameLinkKey('http://www.ecrahat.com/רמדאן-360'));
});

test('upload list: "this weekend" is the coming Thursday (or this one, Thursday to Saturday)', () => {
  assert.equal(defaultWeekStart('2026-10-11'), '2026-10-15'); // Sunday
  assert.equal(defaultWeekStart('2026-10-14'), '2026-10-15'); // Wednesday
  assert.equal(defaultWeekStart('2026-10-15'), '2026-10-15'); // Thursday
  assert.equal(defaultWeekStart('2026-10-17'), '2026-10-15'); // Saturday
});

const HTML = `<!doctype html><html><head>
<title>Ignored when og:title exists</title>
<meta property="og:title" content="Щелкунчик &mdash; Израильский балет">
<meta property="og:description" content="Семейный спектакль">
<meta property="og:site_name" content="Kupat Bravo">
<meta property="og:image" content="/show/image/83503.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Event","name":"Nutcracker","startDate":"2026-10-15T17:00","image":"https://cdn.example.com/ld.jpg","location":{"@type":"Place","name":"Heichal HaTarbut"}}]}</script>
<script>var x = "not text";</script><style>.a{}</style>
</head><body>
<img src="/logo.svg" alt="logo"><img src="https://www.facebook.com/tr?id=1" width="1" height="1">
<img data-src="/photos/stage.jpg" alt="Dancers on stage"><img src="/icons/x.png" width="16">
<h1>Щелкунчик</h1><p>Чт, 15.10.2026 17:00<br>Нетания &amp; Модиин</p><div>145&nbsp;₪</div><p>Чт, 15.10.2026 17:00</p>
</body></html>`;

test('event page: title, structured data, candidate photos (no logos or pixels) and readable text', () => {
  const p = readPage(HTML, 'https://ru.kupatbravo.co.il/announce/x');
  assert.equal(p.title, 'Щелкунчик — Израильский балет');
  assert.equal(p.siteName, 'Kupat Bravo');
  assert.deepEqual(
    p.images.map((i) => i.url),
    ['https://ru.kupatbravo.co.il/show/image/83503.jpg', 'https://cdn.example.com/ld.jpg', 'https://ru.kupatbravo.co.il/photos/stage.jpg'],
  );
  assert.equal(p.events.length, 1);
  assert.match(p.events[0], /"startDate":"2026-10-15T17:00"/);
  assert.match(p.text, /Нетания & Модиин/);
  assert.match(p.text, /145 ₪/);
  assert.ok(!/not text|\.a\{\}/.test(p.text), 'no scripts or styles');
  assert.equal(p.text.split('Чт, 15.10.2026 17:00').length, 2, 'repeated lines once');
});

const listed = { title: 'Балет Щелкунчик в Нетании', url: 'https://ru.kupatbravo.co.il/announce/x', notes: '', days: ['2026-10-15'], line: 5 };

const toolAnswer = (input: Record<string, unknown>) => ({ content: [{ type: 'tool_use', name: 'save_event', input }] });
const goodInput = {
  readable: true,
  online: false,
  name: { en: 'The Nutcracker — Israel Ballet', he: 'מפצח האגוזים', ru: 'Балет «Щелкунчик» в Нетании' },
  description: { en: 'Tchaikovsky’s ballet for the whole family.', he: 'הבלט של צ׳ייקובסקי לכל המשפחה.', ru: 'Балет Чайковского для всей семьи.' },
  priceText: { en: '145 ₪', he: '145 ₪', ru: '145 ₪' },
  startDate: '2026-10-15',
  endDate: '2026-10-15',
  startTime: '17:00',
  endTime: '18:40',
  venue: 'Heichal HaTarbut Netanya',
  address: 'Netanya, Israel',
  city: 'Netanya',
  countryCode: 'IL',
  geocodeQuery: 'Heichal HaTarbut, Netanya, Israel',
  wikipediaTitle: 'Netanya',
  free: false,
  priceMin: 145,
  currency: 'ILS',
  types: ['Theatre', 'Family', 'Concert'],
  imageUrl: 'https://ru.kupatbravo.co.il/photos/stage.jpg',
  imageKind: 'photo',
  imageCredit: 'Kupat Bravo',
  warnings: [],
};

test('Claude request: forced tool call, the listed day, the page and its candidate photos', () => {
  const page = { ...readPage(HTML, 'https://ru.kupatbravo.co.il/announce/x'), finalUrl: 'https://ru.kupatbravo.co.il/announce/x', status: 200 };
  const body = eventRequest({ listed, listLang: 'ru', weekStart: '2026-10-15', today: '2026-10-11', page }, 'claude-sonnet-5-5');
  assert.deepEqual(body.tool_choice, { type: 'tool', name: 'save_event' });
  assert.equal(body.tools[0], SAVE_EVENT_TOOL);
  const prompt = body.messages[0].content;
  assert.match(prompt, /Listed for: Thursday,? 15 October 2026/);
  assert.match(prompt, /1\. https:\/\/ru\.kupatbravo\.co\.il\/show\/image\/83503\.jpg/);
  assert.match(body.system, /Russian name is the admin's title/);
  const ai = readAiEvent(toolAnswer({ ...goodInput, imageUrl: 'https://made.up/photo.jpg', startTime: '25:00', endDate: '2026-10-14' }), page.images.map((i) => i.url))!;
  assert.equal(ai.imageUrl, '', 'a photo that is not on the page is never used');
  assert.equal(ai.startTime, '');
  assert.equal(ai.endDate, '2026-10-15', 'end never before start');
  assert.deepEqual(ai.types, ['Theatre', 'Family'], 'unknown types dropped');
  assert.equal(readAiEvent({ content: [{ type: 'text' }] }, []), null);
});

function deps(over: Partial<ProcessDeps> = {}): ProcessDeps & { geocoded: string[] } {
  const geocoded: string[] = [];
  return {
    geocoded,
    fetchPage: async (url) => ({ html: HTML, finalUrl: url, status: 200, contentType: 'text/html; charset=utf-8' }),
    ai: async () => toolAnswer(goodInput),
    geocode: async (q) => {
      geocoded.push(q);
      return { lat: 32.33, lon: 34.86, country: 'IL', formatted: 'Netanya, Israel' };
    },
    wikiPhoto: async (t) => ({ url: `https://upload.wikimedia.org/${t}.jpg`, page: `https://en.wikipedia.org/wiki/${t}`, title: t }),
    model: 'claude-sonnet-5-5',
    today: '2026-10-11',
    ...over,
  };
}
const ctx = { uploadId: 'job1', admin: 'anna', listLang: 'ru' as const, weekStart: '2026-10-15' };

test('processing: a readable page becomes a valid event in three languages, price in euro, credited photo', async () => {
  const { result, event } = await processListedEvent(listed, 0, ctx, deps());
  assert.equal(result.status, 'published', result.reasons.join('; '));
  assert.ok(event);
  assert.deepEqual(validateEvent(event!), []);
  assert.equal(event!.id, uploadedEventId(listed.url, '2026-10-15'));
  assert.equal(event!.name, 'The Nutcracker — Israel Ballet');
  assert.equal(event!.i18n.name.ru, 'Балет «Щелкунчик» в Нетании');
  assert.equal(event!.price, 36, '145 ₪ ≈ €36');
  assert.equal(event!.priceText, '145 ₪');
  assert.deepEqual(event!.location, { locLat: 32.33, locLon: 34.86 });
  assert.deepEqual(event!.photoSources[0], { url: 'https://ru.kupatbravo.co.il/photos/stage.jpg', sourcePage: listed.url, credit: 'Kupat Bravo' });
  assert.equal(event!.origin, 'admin');
  assert.equal(event!.uploadedBy, 'anna');
  const he = localizeEvent(event!, 'he');
  assert.equal(he.name, 'מפצח האגוזים');
  assert.equal(he.description, 'הבלט של צ׳ייקובסקי לכל המשפחה.');
});

test('processing: an Instagram post that cannot be read uses the notes; no place on the map → held with a clear reason', async () => {
  const insta = { title: 'Большой пикник для веганов', url: 'https://www.instagram.com/p/abc/', notes: 'Sacher Park, Jerusalem, 11:00', days: ['2026-10-16'], line: 30 };
  let prompt = '';
  const d = deps({
    fetchPage: async () => {
      throw new Error('fetch failed');
    },
    ai: async (body) => {
      prompt = body.messages[0].content;
      return toolAnswer({ ...goodInput, readable: false, startDate: '', endDate: '', startTime: '11:00', endTime: '', venue: 'Sacher Park', city: 'Jerusalem', geocodeQuery: 'Sacher Park, Jerusalem, Israel', imageUrl: '', imageKind: 'none', wikipediaTitle: 'Sacher Park', priceMin: null, currency: '' });
    },
  });
  const { result, event } = await processListedEvent(insta, 1, ctx, d);
  assert.match(prompt, /PAGE: could not be fetched \(fetch failed\)/);
  assert.match(prompt, /Admin notes: Sacher Park, Jerusalem, 11:00/);
  assert.equal(result.status, 'published', result.reasons.join('; '));
  assert.equal(event!.startDate, '2026-10-16', 'the listed day');
  assert.equal(event!.price, null);
  assert.match(event!.photoSources[0].credit, /Wikimedia Commons, via Wikipedia: Sacher Park/);
  assert.ok(result.warnings.some((w) => /could not be read/.test(w)));

  const nowhere = await processListedEvent(insta, 1, ctx, deps({ ai: d.ai, fetchPage: d.fetchPage, geocode: async () => null }));
  assert.equal(nowhere.result.status, 'held');
  assert.ok(nowhere.result.reasons.some((r) => /Could not find the place on the map/.test(r)));
  assert.equal(nowhere.event, undefined, 'held events are not published');
});

test('processing: the list decides the weekend, past events and online events are held, Claude errors are reported', async () => {
  const other = await processListedEvent(listed, 0, ctx, deps({ ai: async () => toolAnswer({ ...goodInput, startDate: '2026-10-22', endDate: '2026-10-22' }) }));
  assert.equal(other.event!.startDate, '2026-10-15');
  assert.ok(other.result.warnings.some((w) => /page says 2026-10-22/.test(w)));

  const past = await processListedEvent({ ...listed, days: ['2026-10-01'] }, 0, ctx, deps({ ai: async () => toolAnswer({ ...goodInput, startDate: '2026-10-01', endDate: '2026-10-01' }) }));
  assert.ok(past.result.reasons.some((r) => /Already over/.test(r)));

  const online = await processListedEvent(listed, 0, ctx, deps({ ai: async () => toolAnswer({ ...goodInput, online: true }) }));
  assert.equal(online.result.status, 'held');

  const logo = await processListedEvent(listed, 0, ctx, deps({ ai: async () => toolAnswer({ ...goodInput, imageKind: 'logo' }) }));
  assert.match(logo.event!.photoSources[0].sourcePage, /wikipedia\.org\/wiki\/Netanya/, 'a logo is never the photo: Wikipedia’s photo of the place instead');

  const broke = await processListedEvent(listed, 0, ctx, deps({ ai: async () => { throw new Error('Claude API 400: Your credit balance is too low'); } }));
  assert.equal(broke.result.status, 'failed');
  assert.match(broke.result.reasons[0], /credit balance/);

  const noLink = await processListedEvent({ ...listed, url: '' }, 0, ctx, deps());
  assert.match(noLink.result.reasons[0], /No link/);
});

test('passcode: one or several named codes, constant-time check, lock after 8 wrong tries', () => {
  assert.deepEqual(readPasscodes('anna:sunny-river-4821, david:green-hill-7710, short, unset'), [
    { name: 'anna', code: 'sunny-river-4821' },
    { name: 'david', code: 'green-hill-7710' },
  ]);
  assert.equal(checkPasscode('anna:sunny-river-4821, david:green-hill-7710', 'green-hill-7710'), 'david');
  assert.equal(checkPasscode('firefly-9g37-4xrc', ' firefly-9g37-4xrc '), 'admin');
  assert.equal(checkPasscode('firefly-9g37-4xrc', 'wrong'), null);
  assert.equal(checkPasscode('unset', 'unset'), null, 'the placeholder never opens it');
  let s = afterFailure(undefined, 0);
  for (let i = 1; i < MAX_FAILS; i++) s = afterFailure(s, i * 1000);
  assert.ok(s.lockedUntil > 8000, 'locked after the 8th wrong passcode');
  assert.equal(afterFailure(s, 20 * 60_000).fails, 1, 'counting starts again after 15 minutes');
});
