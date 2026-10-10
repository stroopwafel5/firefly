#!/usr/bin/env node
/**
 * Thorough live test of Firefly's Tripadvisor (Terra) key. No `npm install` needed — Node 18+.
 *
 *   node scripts/testTripadvisor.mjs                 # key from functions/.secret.local
 *   node scripts/testTripadvisor.mjs --key <KEY>
 *
 * It calls every Terra endpoint Firefly uses, checks the answers contain what Firefly reads,
 * checks the documented limits, and saves every answer to ./tripadvisor-test-results/
 * (the key is sent only in the X-API-Key header and is never saved).
 *
 * Cost: about 50 billable places from the Discover plan's 1,000 free ones. Error answers and
 * allowlist calls are free. It adds about 20 Prague / Tel Aviv places to your allowlist, which
 * Firefly would do anyway.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.TERRA_BASE || 'https://terra.tripadvisor.com/api'; // TERRA_BASE: only for testing this script
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(process.cwd(), 'tripadvisor-test-results');

if (typeof fetch !== 'function') {
  console.error('Node 18 or newer is needed (https://nodejs.org).');
  process.exit(1);
}

function keyFromFile() {
  try {
    const line = readFileSync(join(root, 'functions/.secret.local'), 'utf8').split('\n').find((l) => l.startsWith('TRIPADVISOR_KEY='));
    return line?.slice('TRIPADVISOR_KEY='.length).trim() ?? '';
  } catch {
    return '';
  }
}
const argIdx = process.argv.indexOf('--key');
const KEY = (argIdx > 0 ? process.argv[argIdx + 1] : '') || process.env.TRIPADVISOR_KEY || keyFromFile();
if (!KEY) {
  console.error('No key: put TRIPADVISOR_KEY=… in functions/.secret.local or pass --key <KEY>.');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

/* ------------------------------ helpers ------------------------------ */

let n = 0;
let billed = 0;
const results = [];

function url(path, params = {}) {
  const p = new URLSearchParams({ version: '1' });
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x)));
    else p.set(k, String(v));
  }
  return `${BASE}${path}?${p}`;
}

async function call(name, path, params = {}, { key = KEY, method = 'GET', body } = {}) {
  const u = url(path, params);
  const headers = { accept: 'application/json' };
  if (key) headers['X-API-Key'] = key;
  if (body) headers['Content-Type'] = 'application/json';
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(u, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    return { status: 0, body: null, ms: Date.now() - t0, error: e?.cause?.code ?? e?.message ?? String(e) };
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  const ms = Date.now() - t0;
  const rate = Object.fromEntries([...res.headers].filter(([h]) => /rate|limit|quota|retry/i.test(h)));
  n++;
  writeFileSync(
    join(outDir, `${String(n).padStart(2, '0')}-${name}.json`),
    JSON.stringify({ request: { method, url: u, body }, status: res.status, ms, rateHeaders: rate, response: json ?? text.slice(0, 5000) }, null, 2),
  );
  return { status: res.status, body: json, text, ms, rate };
}

function report(status, test, detail, lines = []) {
  results.push({ status, test, detail });
  const icon = { PASS: '✔', FAIL: '✘', WARN: '!', INFO: '·' }[status];
  console.log(`  ${icon} ${status.padEnd(4)} ${test}: ${detail}`);
  for (const l of lines) console.log(`           ${l}`);
}
const section = (title) => console.log(`\n■ ${title}`);
const err = (r) => (r.error ? `cannot connect (${r.error})` : `HTTP ${r.status} ${r.body?.detail ?? r.body?.message ?? r.body?.title ?? (r.text ?? '').slice(0, 120)}`.trim());
const primary = (names, langs) => {
  if (!names?.length) return '';
  for (const l of langs) {
    const hit = names.find((x) => x.language?.toLowerCase().startsWith(l) && x.primary) ?? names.find((x) => x.language?.toLowerCase().startsWith(l));
    if (hit) return hit.value;
  }
  return (names.find((x) => x.primary) ?? names[0]).value;
};
const pct = (part, whole) => (whole ? `${Math.round((100 * part) / whole)}%` : '—');
const PRAGUE = { lat: 50.0875, lon: 14.4213 };
const TEL_AVIV = { lat: 32.0853, lon: 34.7818 };

/** What Firefly reads from a full Location; returns a one-line coverage summary. */
function coverage(locs) {
  const c = (f) => locs.filter(f).length;
  return [
    `name ${pct(c((l) => l.names?.length), locs.length)}`,
    `coordinates ${pct(c((l) => l.coordinates?.latitude != null), locs.length)}`,
    `rating ${pct(c((l) => l.traveler_ratings?.overall?.rating != null), locs.length)}`,
    `categories ${pct(c((l) => l.categories?.length), locs.length)}`,
    `opening hours ${pct(c((l) => l.opening_hours?.periods?.length), locs.length)}`,
    `visit length ${pct(c((l) => l.recommended_visit_length > 0), locs.length)}`,
    `Tripadvisor link ${pct(c((l) => l.urls?.tripadvisor?.main), locs.length)}`,
    `address ${pct(c((l) => l.addresses?.length), locs.length)}`,
  ].join(', ');
}

/* ------------------------------ tests ------------------------------ */

console.log(`Tripadvisor Terra key test — ${new Date().toISOString()} — key …${KEY.slice(-4)}`);

section('1. Reaching Terra and the key itself');
{
  const noKey = await call('no-key', '/catalog/locations/nearby', { ...PRAGUE, radius: 1, unit: 'KM', size: 1 }, { key: '' });
  if (noKey.status === 0) {
    report('FAIL', 'reach terra.tripadvisor.com', err(noKey), ['Check this computer\'s internet connection / firewall, then run again.']);
    process.exit(1);
  }
  report([401, 403].includes(noKey.status) ? 'PASS' : 'FAIL', 'request without a key is refused', `HTTP ${noKey.status} (${noKey.ms} ms)`);
  const wrong = await call('wrong-key', '/catalog/locations/nearby', { ...PRAGUE, radius: 1, unit: 'KM', size: 1 }, { key: '00000000-0000-0000-0000-000000000000' });
  report([401, 403].includes(wrong.status) ? 'PASS' : 'FAIL', 'request with a wrong key is refused', `HTTP ${wrong.status}`);
}

section('2. Catalog search (finds places; not limited by the allowlist)');
const catalog = {};
for (const [label, where, locale, category, size] of [
  ['Prague attractions', PRAGUE, ['en-US'], 'ATTRACTION', 5],
  ['Tel Aviv attractions (Hebrew)', TEL_AVIV, ['he-IL', 'en-US'], 'ATTRACTION', 5],
  ['Prague restaurants', PRAGUE, ['en-US'], 'RESTAURANT', 3],
  ['Prague hotels', PRAGUE, ['en-US'], 'HOTEL', 3],
]) {
  const r = await call(`catalog-${label.split(' ').slice(0, 2).join('-').toLowerCase()}`, '/catalog/locations/nearby', {
    ...where,
    radius: 3,
    unit: 'KM',
    category,
    sort: 'rating,desc',
    size,
    locale,
  });
  const data = r.body?.data ?? [];
  billed += data.length;
  catalog[label] = data.map((d) => d.location);
  if (r.status !== 200) {
    report('FAIL', label, err(r), r.status === 401 || r.status === 403 ? ['The key was refused: copy it again from the Terra dashboard (Overview → My API key).'] : []);
    continue;
  }
  const ratings = data.map((d) => d.location?.overall_rating?.rating ?? 0);
  const sorted = ratings.every((x, i) => i === 0 || ratings[i - 1] >= x);
  const within = data.every((d) => (d.distance_kilometers ?? 0) <= 3.05);
  const hebrew = data.filter((d) => /[֐-׿]/.test(primary(d.location?.names, ['he', 'iw']))).length;
  report(
    data.length && sorted && within ? 'PASS' : 'FAIL',
    label,
    `${data.length} places, best rated first: ${sorted}, all within 3 km: ${within}${label.includes('Hebrew') ? `, Hebrew names: ${hebrew}/${data.length}` : ''} (${r.ms} ms)`,
    data.map((d) => `${d.location.id}  ★${d.location.overall_rating?.rating ?? '?'} (${d.location.overall_rating?.count ?? '?'})  ${primary(d.location.names, label.includes('Hebrew') ? ['he', 'iw', 'en'] : ['en'])}  ${d.distance_kilometers?.toFixed?.(2) ?? '?'} km`),
  );
}

section('3. Allowlist (free): Firefly adds new areas automatically');
{
  const before = await call('allowlist-get', '/allowlist', {});
  const count = before.body?.data?.length ?? before.body?.allowlist?.length ?? before.body?.pagination?.total_elements;
  report(before.status === 200 ? 'PASS' : 'WARN', 'read the allowlist', before.status === 200 ? `HTTP 200, ${count ?? 'unknown number of'} IDs listed` : err(before));
  const ids = Object.values(catalog).flat().map((l) => l?.id).filter(Boolean);
  const add = await call('allowlist-append', '/allowlist', {}, { method: 'POST', body: { operation_type: 'APPEND', allowlist: [...new Set(ids)] } });
  const sum = (add.body?.added ?? 0) + (add.body?.no_change ?? 0);
  report(
    add.status === 200 && sum === new Set(ids).size ? 'PASS' : 'FAIL',
    `append ${new Set(ids).size} catalog places`,
    add.status === 200 ? `${add.body?.added} added, ${add.body?.no_change} already there` : err(add),
    add.status === 403 ? ['This account may not manage an allowlist: Firefly then falls back to catalog data (no opening hours or categories).'] : [],
  );
}

section('4. Licensed nearby search (what the trip planner uses: full details + one photo)');
let firstId;
const licensedIds = [];
for (const [label, where, locale, category, size] of [
  ['Prague attractions, Russian', PRAGUE, ['ru-RU', 'en-US'], 'ATTRACTION', 5],
  ['Tel Aviv attractions, Hebrew', TEL_AVIV, ['he-IL', 'en-US'], 'ATTRACTION', 5],
  ['Prague restaurants', PRAGUE, ['en-US'], 'RESTAURANT', 3],
  ['Prague hotels', PRAGUE, ['en-US'], 'HOTEL', 3],
]) {
  const r = await call(`nearby-${label.split(',')[0].replace(/\s+/g, '-').toLowerCase()}`, '/locations/nearby', {
    ...where,
    radius: 3,
    unit: 'KM',
    category,
    sort: 'rating,desc',
    include_photo: true,
    size,
    locale,
  });
  const data = r.body?.data ?? [];
  billed += data.length;
  if (r.status !== 200) {
    report('FAIL', label, err(r), r.status === 403 ? ['Your Terra package does not include the Location endpoints (Terra dashboard → Manage plan). Firefly falls back to catalog data.'] : []);
    continue;
  }
  const locs = data.map((d) => d.location);
  locs.forEach((l) => licensedIds.push(l.id));
  firstId ??= locs[0]?.id;
  const photos = data.filter((d) => d.photo?.photo?.original_size_url).length;
  const lang = label.includes('Russian') ? /[Ѐ-ӿ]/ : label.includes('Hebrew') ? /[֐-׿]/ : null;
  const localized = lang ? locs.filter((l) => lang.test(primary(l.names, label.includes('Russian') ? ['ru'] : ['he', 'iw']))).length : null;
  report(
    data.length ? 'PASS' : 'FAIL',
    label,
    `${data.length} places, photo ${pct(photos, data.length)}${localized != null ? `, names in that language ${localized}/${data.length}` : ''} (${r.ms} ms)`,
    [
      coverage(locs),
      ...locs.map(
        (l) =>
          `${l.id}  ★${l.traveler_ratings?.overall?.rating ?? '?'}  ${primary(l.names, label.includes('Russian') ? ['ru', 'en'] : label.includes('Hebrew') ? ['he', 'iw', 'en'] : ['en'])}  [${(l.categories ?? []).map((c) => c.display_name ?? c.id).slice(0, 2).join(', ')}]${l.price_level ? `  ${l.price_level}` : ''}${l.accommodation?.star_rating ? `  ${l.accommodation.star_rating}★ hotel` : ''}`,
      ),
    ],
  );
  if (!data.length) report('WARN', label, 'empty: the allowlist update may not have taken effect yet — run again in a minute');
}

section('5. Paging and documented limits (error answers are free)');
{
  const p2 = await call('nearby-page-2', '/locations/nearby', { ...PRAGUE, radius: 3, unit: 'KM', category: 'ATTRACTION', sort: 'rating,desc', size: 2, page: 2 });
  billed += p2.body?.data?.length ?? 0;
  report(p2.status === 200 && p2.body?.pagination?.page === 2 ? 'PASS' : 'FAIL', 'page 2 of 2-per-page', p2.status === 200 ? `page ${p2.body?.pagination?.page}, ${p2.body?.data?.length} places, ${p2.body?.pagination?.total_elements} in total` : err(p2));
  for (const [label, params, expect] of [
    ['size 21 is refused (max 20)', { size: 21 }, 400],
    ['radius 9 km is refused (max 8)', { radius: 9 }, 400],
    ['page 4 × 20 is refused (offset max 40)', { size: 20, page: 4 }, 400],
  ]) {
    const r = await call(`limit-${label.split(' ')[0]}`, '/locations/nearby', { ...PRAGUE, radius: 3, unit: 'KM', category: 'ATTRACTION', ...params });
    if (r.status === 200) billed += r.body?.data?.length ?? 0;
    report(r.status === expect ? 'PASS' : 'WARN', label, `HTTP ${r.status}${r.body?.detail ? ` — ${r.body.detail}` : ''}`);
  }
}

section('6. Details, multi-get, photos, reviews (the attraction page)');
if (!firstId) {
  report('FAIL', 'details', 'no licensed place to look at (section 4 failed)');
} else {
  const d = await call('details-ru', `/locations/${firstId}`, { locale: ['ru-RU', 'en-US'] });
  if (d.status === 200) billed += 1;
  report(d.status === 200 && d.body?.id === firstId ? 'PASS' : 'FAIL', `details of ${firstId} (Russian)`, d.status === 200 ? `${primary(d.body.names, ['ru', 'en'])} — ${coverage([d.body])}` : err(d), d.body?.opening_hours?.formatted ? [`hours: ${d.body.opening_hours.formatted.slice(0, 3).join(' | ')}`] : []);

  const ids = licensedIds.slice(0, 3);
  const m = await call('multi-get', '/locations', { id: ids.join(',') });
  const list = Array.isArray(m.body) ? m.body : m.body?.data ?? [];
  billed += list.length;
  report(m.status === 200 && list.length === ids.length ? 'PASS' : 'FAIL', `several places in one call (${ids.length})`, m.status === 200 ? `${list.length} returned, answer is ${Array.isArray(m.body) ? 'a list' : 'wrapped in "data"'} (Firefly handles both)` : err(m));

  const ph = await call('photos', `/locations/${firstId}/photos`, { size: 3 });
  const pics = ph.body?.data ?? [];
  if (ph.status === 200) billed += 1;
  report(ph.status === 200 && pics.every((p) => p.photo?.original_size_url) && pics.length ? 'PASS' : 'FAIL', 'photos', ph.status === 200 ? `${pics.length} photos, sources: ${[...new Set(pics.map((p) => p.source?.name))].join('/')}` : err(ph), pics.map((p) => `${p.photo?.original_size_url}  by ${p.user?.username ?? p.source?.name}`));

  for (const lang of ['en', 'iw', 'ru']) {
    const r = await call(`reviews-${lang}`, `/locations/${firstId}/reviews`, { size: 3, language: lang });
    const revs = r.body?.data ?? [];
    if (r.status === 200) billed += 1;
    const linked = revs.filter((x) => x.url).length;
    report(
      r.status === 200 && linked === revs.length ? (revs.length ? 'PASS' : 'WARN') : 'FAIL',
      `reviews in ${{ en: 'English', iw: 'Hebrew', ru: 'Russian' }[lang]}`,
      r.status === 200 ? `${revs.length} reviews (${r.body?.pagination?.total_elements ?? '?'} in total), ${linked} with a link to the review${revs.length ? '' : ' — none in this language is normal for some places'}` : err(r),
      revs.slice(0, 2).map((x) => `${x.rating}★ ${primary(x.title, [lang === 'iw' ? 'he' : lang, lang])} — ${x.url}`),
    );
  }
}

section('7. Search by name (the "must-see" picker)');
{
  const lic = await call('search-licensed', '/locations/search', { query: 'Charles Bridge', category: 'ATTRACTION', size: 3 });
  billed += lic.body?.data?.length ?? 0;
  report(lic.status === 200 ? 'PASS' : 'FAIL', 'licensed search "Charles Bridge"', lic.status === 200 ? `${lic.body?.data?.length ?? 0} found (only places on the allowlist appear here; Firefly then tries the catalog)` : err(lic));
  const cat = await call('search-catalog', '/catalog/locations/search', { query: 'Charles Bridge', category: 'ATTRACTION', size: 3 });
  const found = cat.body?.data ?? [];
  billed += found.length;
  report(cat.status === 200 && found.length ? 'PASS' : 'FAIL', 'catalog search "Charles Bridge"', cat.status === 200 ? `${found.length} found` : err(cat), found.map((f) => `${f.location?.id} ${primary(f.location?.names, ['en'])}`));
  const none = await call('unknown-id', '/locations/1', {});
  report([400, 404].includes(none.status) ? 'PASS' : 'WARN', 'an unknown place ID is refused', `HTTP ${none.status}`);
}

/* ------------------------------ summary ------------------------------ */

const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('WARN')} warnings — about ${billed} billable places used (Discover: 1,000 free once).`);
console.log(`Every answer is saved in ${outDir}`);
console.log('Zip that folder and send it back: Firefly\'s mapping can then be checked against these real answers.');
writeFileSync(join(outDir, '00-summary.json'), JSON.stringify({ at: new Date().toISOString(), billed, results }, null, 2));
process.exit(count('FAIL') ? 1 : 0);
