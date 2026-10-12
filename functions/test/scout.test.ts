import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGION_CITIES, REGION_TARGETS, SNAPSHOT_DAYS, snapshotWindow } from '../src/events/plan';
import { REPORT_TOOL, ScoutDeps, cellOf, cellsAround, cityGroups, rankListings, readScoutReport, runScout, scoutRequest } from '../src/events/scoutCore';

test('weekly list: 950 events — Israel 50, Europe 500, Japan, South-East Asia and Africa 100 each, the rest 100', () => {
  assert.deepEqual(REGION_TARGETS, { israel: 50, europe: 500, japan: 100, seasia: 100, africa: 100, world: 100 });
  for (const c of ['Amsterdam', 'Brussels', 'Berlin', 'Prague', 'Warsaw', 'Kraków', 'Antwerp', 'Brno', 'Wrocław', 'Eindhoven']) assert.ok(REGION_CITIES.europe.includes(c), c);
  assert.deepEqual(REGION_CITIES.africa.slice(0, 4), ['Cape Town', 'Johannesburg', 'Pretoria', 'Durban'], 'South Africa first');
  assert.ok(REGION_CITIES.japan.includes('Kyoto') && REGION_CITIES.seasia.includes('Bangkok'));
  const w = snapshotWindow(new Date(Date.UTC(2026, 9, 12))); // a Monday
  assert.equal(w.from, '2026-10-13');
  assert.equal(SNAPSHOT_DAYS, 28);
  assert.equal(w.to, '2026-11-09');
  assert.deepEqual(w.days.slice(0, 3), ['2026-10-16', '2026-10-17', '2026-10-18'], 'Friday to Sunday first in line');
  assert.equal(w.days.length, 12);
});

test('weekly web search: the request asks for outdoor and family events with web search, answered through one tool', () => {
  const r = scoutRequest({ region: 'europe', cities: ['Amsterdam', 'Utrecht'], from: '2026-10-13', to: '2026-11-09', max: 12, model: 'claude-haiku-5-5' });
  assert.equal(r.model, 'claude-haiku-5-5');
  assert.deepEqual(r.tools[0], { type: 'web_search_20250305', name: 'web_search', max_uses: 4 });
  assert.equal(r.tools[1].name, REPORT_TOOL.name);
  assert.match(String(r.messages[0].content), /Amsterdam; Utrecht/);
  assert.match(r.system, /outdoor events/);
  assert.match(r.system, /Never invent/);
  assert.deepEqual(cityGroups(['a', 'b', 'c', 'd', 'e'], 4), [['a', 'b', 'c', 'd'], ['e']]);
});

test('weekly web search: reported events are checked (real links, dates, no social media, no repeats)', () => {
  const answer = {
    content: [
      { type: 'server_tool_use', name: 'web_search' },
      {
        type: 'tool_use',
        name: 'report_events',
        input: {
          events: [
            { title: 'Kerstmarkt Utrecht', url: 'https://www.kerstmarktutrecht.nl/', city: 'Utrecht', countryCode: 'nl', startDate: '2026-12-10', endDate: '2026-12-13', outdoor: true, family: true },
            { title: 'Same market again', url: 'http://kerstmarktutrecht.nl', city: 'Utrecht', countryCode: 'NL', startDate: '2026-12-10', endDate: '2026-12-13', outdoor: true, family: true },
            { title: 'Insta party', url: 'https://www.instagram.com/p/xyz', city: 'Amsterdam', countryCode: 'NL', startDate: '2026-10-20', endDate: '2026-10-20', outdoor: false, family: false },
            { title: 'No date', url: 'https://example.org/x', city: 'Amsterdam', countryCode: 'NL', startDate: 'soon', endDate: '', outdoor: false, family: false },
            { title: 'Museum night', url: 'https://museumnacht.amsterdam/', city: 'Amsterdam', countryCode: 'NL', startDate: '2026-11-07', endDate: '2026-11-06', outdoor: false, family: false },
          ],
        },
      },
    ],
  };
  const list = readScoutReport(answer)!;
  assert.deepEqual(list.map((l) => l.title), ['Kerstmarkt Utrecht', 'Museum night']);
  assert.equal(list[0].countryCode, 'NL');
  assert.equal(list[1].endDate, '2026-11-07', 'an end before the start becomes the start');
  assert.equal(readScoutReport({ content: [{ type: 'text' }] }), null);
  assert.deepEqual(rankListings(list).map((l) => l.title), ['Kerstmarkt Utrecht', 'Museum night'], 'outdoor and family first');
});

test('scout events are found by map cell: a 150 km circle needs only a few cells', () => {
  assert.equal(cellOf(52.37, 4.9), '52:4');
  const cells = cellsAround(52.37, 4.9, 150);
  assert.ok(cells.includes('52:4') && cells.includes('51:3') && cells.length <= 30, String(cells.length));
  assert.ok(cellsAround(0, 179.9, 50).includes('0:-180'), 'wraps round the date line');
});

test('weekly web search run: reads new pages only, within the weekly limit, and keeps what passes the checks', async () => {
  const saved: string[] = [];
  const remembered: Array<[string, string]> = [];
  let asked = 0;
  const deps: ScoutDeps = {
    ask: async (body) => {
      asked++;
      const cities = String((body.messages[0] as { content: string }).content);
      const city = cities.match(/: ([^;.]+)/)![1];
      if (asked === 1) return { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', name: 'web_search' }] };
      return {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            name: 'report_events',
            input: {
              events: [1, 2, 3].map((n) => ({ title: `${city} fair ${n}`, url: `https://example.org/${encodeURIComponent(city)}/${n}`, city, countryCode: 'NL', startDate: '2026-10-20', endDate: '2026-10-21', outdoor: n === 1, family: true })),
            },
          },
        ],
      };
    },
    process: {
      fetchPage: async (url) => ({ html: `<html><head><title>${url}</title><meta property="og:image" content="https://example.org/photo.jpg"></head><body>Fair</body></html>`, finalUrl: url, status: 200, contentType: 'text/html' }),
      ai: async () => ({
        content: [
          {
            type: 'tool_use',
            name: 'save_event',
            input: {
              readable: true, online: false, name: { en: 'Fair', he: 'יריד', ru: 'Ярмарка' }, description: { en: 'A fair.', he: 'יריד.', ru: 'Ярмарка.' },
              priceText: { en: '', he: '', ru: '' }, startDate: '2026-10-20', endDate: '2026-10-21', startTime: '', endTime: '', venue: 'Square', address: 'Square, Utrecht',
              city: 'Utrecht', countryCode: 'NL', geocodeQuery: 'Square, Utrecht, Netherlands', wikipediaTitle: '', free: true, priceMin: null, currency: '',
              types: ['Festival'], imageUrl: 'https://example.org/photo.jpg', imageKind: 'photo', imageCredit: 'Example', warnings: [],
            },
          },
        ],
      }),
      geocode: async () => ({ lat: 52.09, lon: 5.12, country: 'NL' }),
      wikiPhoto: async () => null,
      model: 'm',
      today: '2026-10-12',
    },
    seen: async (url) => url.endsWith('/2'),
    remember: async (url, status) => void remembered.push([url, status]),
    save: async (e) => void saved.push(e.id),
    log: () => undefined,
  };
  const r = await runScout(deps, { from: '2026-10-13', to: '2026-11-09', today: '2026-10-12', model: 'm', maxPages: 10, deadline: Date.now() + 600_000 });
  assert.ok(r.read <= 10, `weekly limit: ${r.read}`);
  assert.equal(r.published, saved.length);
  assert.ok(r.published > 0);
  assert.ok(!remembered.some(([u]) => u.endsWith('/2')), 'pages already read are skipped');
  assert.ok(remembered.every(([, s]) => s === 'published'));
  assert.ok(r.byRegion.europe! > 0, 'Europe gets the biggest share');
});
