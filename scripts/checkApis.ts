/**
 * Live check of every outside service Firefly uses, with the keys in functions/.secret.local and
 * the SAME request-building and parsing code the Cloud Functions run.
 *
 *   npm run check:apis                                  # everything (uses 3 SerpApi searches and ~12 Tripadvisor places)
 *   npm run check:apis -- --only ticketmaster,anthropic
 *   npm run check:apis -- --no-serp                     # SerpApi: free account check only, no searches
 *   npm run check:apis -- --agoda-city 5085             # test Agoda with that Agoda city id (once you have keys)
 *
 * Run it on any normal computer with internet. It prints PASS / FAIL / SKIP per test with
 * sample data, and exits with code 1 if anything failed. HOW_TO_TEST.md §2.3 shows a full run.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AgodaResponse, agodaCityRequest, agodaHeaders, mapAgoda, AGODA_LITE_URL } from '../functions/src/hotels/agodaMap';
import { GhResponse, googleHotelsUrl, mapGoogleHotels } from '../functions/src/hotels/googleHotelsMap';
import { SerpEventsResponse, mapSerpEvents, serpEventsUrl } from '../functions/src/events/googleEventsMap';
import { TmResponse, isNotAnEvent, mapTicketmaster, ticketmasterUrl } from '../functions/src/events/ticketmasterMap';
import { SearchArgs, validateEvent } from '../functions/src/events/types';
import { nominatimSearchUrl, parseNominatimSearch, NOMINATIM_UA } from '../functions/src/geo/nominatim';
import { ANTHROPIC_URL, anthropicHeaders, kidifyRequest, kidifyText, numbersNotInSource } from '../functions/src/kidifyCore';
import { approveLink, paypalBase, paypalOrderBody, paypalTokenRequest } from '../functions/src/paypalCore';
import { TERRA_REVIEW_LANG, TerraLocation, TerraNearby, TerraPage, TerraPhoto, TerraReview, localesFor, terraHeaders, terraUrl, toAttraction, toReview } from '../functions/src/tripadvisorMap';

/* ------------------------------ setup ------------------------------ */

const argv = process.argv.slice(2);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const only = opt('only')?.split(',').map((s) => s.trim().toLowerCase());
const noSerp = argv.includes('--no-serp');

function readEnv(file: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(file, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    );
  } catch {
    return {};
  }
}
const root = typeof __dirname !== 'undefined' ? join(__dirname, '..') : process.cwd();
const env = { ...readEnv(join(root, 'functions/.env')), ...readEnv(join(root, 'functions/.secret.local')), ...process.env } as Record<string, string | undefined>;
const val = (k: string) => {
  const v = (env[k] ?? '').trim();
  return v && !/^(unset|none|todo|-)$/i.test(v) ? v : '';
};

type Status = 'PASS' | 'FAIL' | 'SKIP';
const results: Array<{ api: string; test: string; status: Status; detail: string }> = [];
function report(api: string, test: string, status: Status, detail: string, sample: string[] = []) {
  results.push({ api, test, status, detail });
  const icon = status === 'PASS' ? '✔' : status === 'FAIL' ? '✘' : '–';
  console.log(`  ${icon} ${status}  ${test}: ${detail}`);
  for (const s of sample) console.log(`           ${s}`);
}

async function http<T>(url: string, init: RequestInit = {}, timeoutMs = 25_000): Promise<{ status: number; body: T | null; text: string }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let body: T | null = null;
  try {
    body = JSON.parse(text) as T;
  } catch {
    /* not JSON */
  }
  return { status: res.status, body, text };
}

const netError = (e: unknown) => {
  const c = (e as { cause?: { code?: string } })?.cause?.code ?? (e as Error)?.message ?? String(e);
  return `cannot reach the server (${c}) — check this computer's internet / firewall`;
};

async function section(name: string, fn: () => Promise<void>) {
  if (only && !only.includes(name.toLowerCase())) return;
  console.log(`\n■ ${name}`);
  try {
    await fn();
  } catch (e) {
    report(name, 'unexpected error', 'FAIL', netError(e));
  }
}

// Dates used by the tests: the next two weekends.
const today = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (n: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + n));
const nextFri = ((5 - today.getUTCDay() + 7) % 7) || 7;
const FROM = iso(addDays(nextFri));
const TO = iso(addDays(nextFri + 9));

const area = (lat: number, lon: number, placeName: string, country: string, radiusKm = 30, lang: SearchArgs['lang'] = 'en'): SearchArgs => ({
  lat,
  lon,
  placeName,
  country,
  radiusKm,
  from: FROM,
  to: TO,
  lang,
});

/* ------------------------------ Anthropic ------------------------------ */

const KIDS_TEXT = {
  en: 'Prague Castle is a castle complex in Prague, Czech Republic, built in the 9th century. It is the official office of the President of the Czech Republic. The castle is among the largest in the world, at about 70,000 square metres.',
  he: 'מצודת פראג היא מתחם טירה בפראג שבצ׳כיה, שנבנה במאה ה-9. זהו המשרד הרשמי של נשיא צ׳כיה. הטירה היא מהגדולות בעולם, ושטחה כ-70,000 מטרים רבועים.',
  ru: 'Пражский Град — замковый комплекс в Праге, построенный в IX веке. Это официальная резиденция президента Чехии. Замок — один из крупнейших в мире, его площадь около 70 000 квадратных метров.',
} as const;

async function main() {
  console.log(`Firefly API check — ${new Date().toISOString()} — test window ${FROM}…${TO}`);
  await section('Anthropic', async () => {
  const key = val('ANTHROPIC_API_KEY');
  if (!key) return report('Anthropic', 'key', 'SKIP', 'ANTHROPIC_API_KEY not set (kids see the Wikipedia text as is)');
  const model = val('KIDIFY_MODEL') || 'claude-haiku-5-5';
  const m = await http<{ data?: Array<{ id: string }>; error?: { message: string } }>('https://api.anthropic.com/v1/models', {
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
  });
  if (m.status !== 200) return report('Anthropic', 'key is valid', 'FAIL', `HTTP ${m.status} ${m.body?.error?.message ?? m.text.slice(0, 120)}`);
  const ids = m.body?.data?.map((x) => x.id) ?? [];
  report('Anthropic', 'key is valid', 'PASS', `${ids.length} models available`);
  report('Anthropic', `model "${model}" available`, ids.includes(model) ? 'PASS' : 'FAIL', ids.includes(model) ? 'yes' : `no — set KIDIFY_MODEL to one of: ${ids.slice(0, 5).join(', ')}`);
  for (const lang of ['en', 'he', 'ru'] as const) {
    const t0 = Date.now();
    const r = await http<{ content?: Array<{ type: string; text?: string }>; error?: { message: string } }>(ANTHROPIC_URL, {
      method: 'POST',
      headers: anthropicHeaders(key),
      body: JSON.stringify(kidifyRequest(KIDS_TEXT[lang], lang, 'Prague Castle', model)),
    }, 40_000);
    const text = r.body ? kidifyText(r.body as never) : null;
    if (r.status !== 200 || !text) {
      report('Anthropic', `kids' rewording (${lang})`, 'FAIL', `HTTP ${r.status} ${r.body?.error?.message ?? ''}`);
      continue;
    }
    const script = lang === 'he' ? /[֐-׿]/.test(text) : lang === 'ru' ? /[Ѐ-ӿ]/.test(text) : /^[\x00-\x7F’'“”—–…]*$/.test(text);
    const extra = numbersNotInSource(KIDS_TEXT[lang], text);
    const ok = script && extra.length === 0 && text.length < 600;
    report('Anthropic', `kids' rewording (${lang})`, ok ? 'PASS' : 'FAIL', `${Date.now() - t0} ms, right language: ${script}, new numbers: ${extra.join(',') || 'none'}`, [`“${text}”`]);
  }
});

/* ------------------------------ Ticketmaster ------------------------------ */

  await section('Ticketmaster', async () => {
  const key = val('TICKETMASTER_KEY');
  if (!key) return report('Ticketmaster', 'key', 'SKIP', 'TICKETMASTER_KEY not set');
  const cases: Array<[string, SearchArgs, number]> = [
    ['London', area(51.5074, -0.1278, 'London', 'GB'), 5],
    ['Prague', area(50.0875, 14.4213, 'Prague', 'CZ', 40), 3],
    ['Tel Aviv (little coverage expected)', area(32.0853, 34.7818, 'Tel Aviv', 'IL', 100), 0],
  ];
  for (const [label, a, min] of cases) {
    const r = await http<TmResponse>(ticketmasterUrl(a, key));
    if (r.status !== 200 || !r.body) {
      report('Ticketmaster', label, 'FAIL', `HTTP ${r.status} ${r.body?.fault?.faultstring ?? r.text.slice(0, 120)}`);
      continue;
    }
    const raw = r.body._embedded?.events ?? [];
    const rejected = raw.filter(isNotAnEvent).map((e) => e.name);
    const events = mapTicketmaster(r.body, a).filter((e) => e.endDate >= a.from);
    const invalid = events.filter((e) => validateEvent(e).length);
    const ok = events.length >= min && invalid.length === 0;
    report(
      'Ticketmaster',
      `${label} ${a.from}…${a.to}`,
      ok ? 'PASS' : 'FAIL',
      `${r.body.page?.totalElements ?? raw.length} listed, ${raw.length} fetched, ${events.length} kept, ${rejected.length} not-events dropped, ${invalid.length} invalid`,
      [
        ...events.slice(0, 3).map((e) => `${e.startDate} ${e.startTime ?? ''} ${e.name} @ ${e.venue} — ${e.link}`),
        ...(rejected.length ? [`dropped e.g.: ${rejected.slice(0, 3).join(' | ')}`] : []),
      ],
    );
  }
});

/* ------------------------------ SerpApi ------------------------------ */

  await section('SerpApi', async () => {
  const key = val('SERPAPI_KEY');
  if (!key) return report('SerpApi', 'key', 'SKIP', 'SERPAPI_KEY not set');
  const acc = await http<{ plan_name?: string; total_searches_left?: number; searches_per_month?: number; plan_renewal_date?: string; error?: string }>(
    `https://serpapi.com/account.json?api_key=${key}`,
  );
  if (acc.status !== 200 || !acc.body || acc.body.error) return report('SerpApi', 'account', 'FAIL', `HTTP ${acc.status} ${acc.body?.error ?? ''}`);
  const left = acc.body.total_searches_left ?? 0;
  report('SerpApi', 'key is valid (free check)', 'PASS', `${acc.body.plan_name}: ${left} of ${acc.body.searches_per_month} searches left, renews ${acc.body.plan_renewal_date}`);
  if (noSerp) return report('SerpApi', 'searches', 'SKIP', '--no-serp');
  if (left < 3) return report('SerpApi', 'searches', 'SKIP', 'fewer than 3 searches left this month');

  for (const [label, a, q] of [
    ['Google events: Accra (en)', area(5.6037, -0.187, 'Accra', 'GH', 50), 'events in Accra'],
    ['Google events: Tel Aviv (he)', area(32.0853, 34.7818, 'תל אביב-יפו', 'IL', 30, 'he'), 'אירועים בתל אביב-יפו'],
  ] as Array<[string, SearchArgs, string]>) {
    const r = await http<SerpEventsResponse>(serpEventsUrl(a, q, key), {}, 40_000);
    if (r.status !== 200 || !r.body || r.body.error) {
      report('SerpApi', label, 'FAIL', `HTTP ${r.status} ${r.body?.error ?? ''}`);
      continue;
    }
    const raw = mapSerpEvents(r.body, a, q);
    const withLink = raw.filter((e) => /^https?:\/\//.test(e.link));
    report('SerpApi', label, raw.length ? 'PASS' : 'FAIL', `${r.body.events_results?.length ?? 0} listings, ${raw.length} with dates, ${withLink.length} with a source link (addresses are geocoded on the server)`, raw
      .slice(0, 3)
      .map((e) => `${e.startDate} ${e.name} — ${e._address} — ${e.link}`));
  }

  const stay = { checkIn: FROM, checkOut: iso(addDays(nextFri + 2)), adults: 2, kids: 2 };
  const r = await http<GhResponse>(googleHotelsUrl('Prague', stay, 'en', key, { gl: 'cz' }), {}, 40_000);
  if (r.status !== 200 || !r.body || r.body.error) return report('SerpApi', 'Google Hotels: Prague', 'FAIL', `HTTP ${r.status} ${r.body?.error ?? ''}`);
  const hotels = mapGoogleHotels(r.body, stay, 'en', 'Prague');
  const priced = hotels.filter((h) => h.price != null);
  report('SerpApi', `Google Hotels: Prague ${stay.checkIn}→${stay.checkOut}, 2+2`, priced.length ? 'PASS' : 'FAIL', `${hotels.length} hotels on the map, ${priced.length} with a price`, hotels
    .slice(0, 3)
    .map((h) => `${h.name} ★${h.rating ?? '?'} ${h.price != null ? `€${h.price}/night` : ''} — book: ${h.linkToBooking.slice(0, 70)}`));
});

/* ------------------------------ TripAdvisor (Terra) ------------------------------ */

  // Uses about 12 billable places (catalog 5 + licensed nearby 5 + photos 1 + reviews 1).
  await section('TripAdvisor', async () => {
    const key = val('TRIPADVISOR_KEY');
    if (!key) return report('TripAdvisor', 'key', 'SKIP', 'TRIPADVISOR_KEY not set');
    const get = <T>(path: string, params: Record<string, string | number | boolean | string[]>, init: RequestInit = {}) =>
      http<T & { title?: string; detail?: string; message?: string }>(terraUrl(path, params), {
        ...init,
        headers: { ...terraHeaders(key), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      });
    const where = { lat: 50.0875, lon: 14.4213, radius: 3, unit: 'KM', category: 'ATTRACTION', sort: 'rating,desc', size: 5 };
    const cat = await get<TerraPage<{ location: TerraLocation }>>('/catalog/locations/nearby', { ...where, locale: localesFor('en') });
    if (cat.status !== 200 || !cat.body?.data) {
      return report('TripAdvisor', 'key works (catalog search, Prague)', 'FAIL', `HTTP ${cat.status} ${cat.body?.detail ?? cat.body?.message ?? cat.body?.title ?? cat.text.slice(0, 160)}`, [
        'Terra keys go in the X-API-Key header and have no domain/IP settings. 401/403: check the key on the Terra dashboard (Overview → My API key) and the plan (Manage plan).',
      ]);
    }
    const ids = cat.body.data.map((c) => c.location.id);
    report('TripAdvisor', 'key works (catalog search, Prague)', ids.length ? 'PASS' : 'FAIL', `${ids.length} top-rated places`, cat.body.data.map((c) => `${c.location.id} ${c.location.names?.find((n) => n.primary)?.value ?? ''}`));

    const nearby = () => get<TerraPage<TerraNearby>>('/locations/nearby', { ...where, include_photo: true, locale: localesFor('en') });
    let near = await nearby();
    if (near.status === 200 && !(near.body?.data?.length)) {
      const add = await get<{ added?: number; no_change?: number }>('/allowlist', {}, { method: 'POST', body: JSON.stringify({ operation_type: 'APPEND', allowlist: ids }) });
      report('TripAdvisor', 'add places to the allowlist', add.status === 200 ? 'PASS' : 'FAIL', add.status === 200 ? `${add.body?.added ?? 0} added, ${add.body?.no_change ?? 0} already there` : `HTTP ${add.status} ${add.body?.detail ?? ''}`);
      near = await nearby();
    }
    const list = near.body?.data ?? [];
    if (near.status !== 200 || !list.length) {
      return report('TripAdvisor', 'licensed nearby search', 'FAIL', `HTTP ${near.status} ${near.body?.detail ?? near.body?.message ?? ''} — ${list.length} places`, near.status === 403 ? ['Your Terra package does not include this endpoint: see Manage plan on the Terra dashboard.'] : []);
    }
    const a = toAttraction(list[0].location, list[0].photo ? [list[0].photo] : [], 'en');
    report('TripAdvisor', 'licensed nearby search → Firefly attraction', a.location.locLat ? 'PASS' : 'FAIL', `${list.length} places; ${a.name}: types ${a.types.join('/') || '—'}, visit ${a.suggestedMinutes} min, ★${a.rating} (${a.numReviews}), hours ${a.weeklyHours ? 'yes' : 'not published'}, photo ${a.photo_urls.length ? 'yes' : 'no'}`, [a.link]);

    const id = list[0].location.id;
    const pics = await get<TerraPage<TerraPhoto>>(`/locations/${id}/photos`, { size: 1 });
    report('TripAdvisor', 'photos', pics.status === 200 && pics.body?.data?.length ? 'PASS' : 'FAIL', pics.status === 200 ? `${pics.body?.data?.length ?? 0} photo(s)` : `HTTP ${pics.status}`, (pics.body?.data ?? []).map((p) => p.photo?.original_size_url ?? ''));
    const revs = await get<TerraPage<TerraReview>>(`/locations/${id}/reviews`, { size: 3, language: TERRA_REVIEW_LANG.ru });
    const mapped = (revs.body?.data ?? []).map((r) => toReview(r, 'ru'));
    report('TripAdvisor', 'reviews in Russian, each linked to the review', revs.status === 200 && mapped.every((r) => r.url) ? 'PASS' : 'FAIL', revs.status === 200 ? `${mapped.length} review(s)` : `HTTP ${revs.status}`, mapped.slice(0, 2).map((r) => `${r.rating}★ ${r.title} — ${r.url}`));
  });

/* ------------------------------ PayPal ------------------------------ */

  await section('PayPal', async () => {
  const id = val('PAYPAL_CLIENT_ID');
  const secretKey = val('PAYPAL_CLIENT_SECRET');
  if (!id || !secretKey) return report('PayPal', 'keys', 'SKIP', 'PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set');
  const configured = val('PAYPAL_ENV') || 'sandbox';
  let workingEnv = '';
  for (const envName of [configured, configured === 'live' ? 'sandbox' : 'live']) {
    const [url, init] = paypalTokenRequest(envName, id, secretKey);
    const r = await http<{ access_token?: string; error?: string; error_description?: string }>(url, init);
    if (r.status === 200 && r.body?.access_token) {
      workingEnv = envName;
      report('PayPal', `credentials (${envName})`, envName === configured ? 'PASS' : 'FAIL', envName === configured ? 'token issued' : `these are ${envName.toUpperCase()} keys but PAYPAL_ENV=${configured} — set PAYPAL_ENV=${envName}`);
      if (envName === 'sandbox') {
        const order = await http<{ id?: string; status?: string; links?: Array<{ rel: string; href: string }>; message?: string }>(`${paypalBase('sandbox')}/v2/checkout/orders`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${r.body.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(paypalOrderBody(`check-${Date.now()}`, 'API check (not a real booking)', 1)),
        });
        const link = order.body ? approveLink(order.body) : undefined;
        report('PayPal', 'sandbox order (€1, never captured)', link ? 'PASS' : 'FAIL', `${order.body?.status ?? `HTTP ${order.status} ${order.body?.message ?? ''}`}`, link ? [`approve at: ${link}`] : []);
      }
      break;
    }
    report('PayPal', `credentials (${envName})`, envName === configured ? 'FAIL' : 'SKIP', `HTTP ${r.status} ${r.body?.error ?? ''} ${r.body?.error_description ?? ''}`.trim());
  }
  if (!workingEnv) report('PayPal', 'summary', 'FAIL', 'neither sandbox nor live accepted the Client ID + Secret — copy them again from developer.paypal.com → Apps & Credentials');
});

/* ------------------------------ Agoda ------------------------------ */

  await section('Agoda', async () => {
  const site = val('AGODA_SITE_ID');
  const key = val('AGODA_API_KEY');
  if (!site || !key) return report('Agoda', 'credentials', 'SKIP', 'AGODA_SITE_ID / AGODA_API_KEY not set yet (apply at partners.agoda.com — HOW_TO_TEST.md §2)');
  const cityId = Number(opt('agoda-city'));
  if (!cityId) return report('Agoda', 'city search', 'SKIP', 'pass --agoda-city <Agoda city id> to test a search');
  const stay = { checkIn: FROM, checkOut: iso(addDays(nextFri + 2)), adults: 2, kids: 1 };
  const r = await http<AgodaResponse>(val('AGODA_ENDPOINT') || AGODA_LITE_URL, {
    method: 'POST',
    headers: agodaHeaders(site, key),
    body: JSON.stringify(agodaCityRequest(cityId, stay, 'en', { family: true })),
  });
  if (r.status !== 200 || !r.body || r.body.error) return report('Agoda', `city ${cityId}`, 'FAIL', `HTTP ${r.status} ${r.body?.error?.message ?? r.text.slice(0, 120)}`);
  const hotels = mapAgoda(r.body, stay, 'en', '', (x) => (x.latitude != null && x.longitude != null ? { lat: x.latitude, lon: x.longitude } : { lat: 0, lon: 0 }));
  report('Agoda', `city ${cityId} ${stay.checkIn}→${stay.checkOut}`, hotels.length ? 'PASS' : 'FAIL', `${hotels.length} hotels`, hotels.slice(0, 3).map((h) => `${h.name} ${h.currency} ${h.price}/night — ${h.linkToBooking}`));
});

/* ------------------------------ Geocoding ------------------------------ */

  await section('Geocoding', async () => {
  const key = val('GOOGLE_SERVER_KEY');
  if (key) {
    const r = await http<{ status: string; results: Array<{ formatted_address: string }> }>(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent('Granada, Nicaragua')}&key=${key}`,
    );
    report('Geocoding', 'Google Geocoding', r.body?.status === 'OK' ? 'PASS' : 'FAIL', `${r.body?.status} ${r.body?.results?.[0]?.formatted_address ?? ''}`);
  } else {
    report('Geocoding', 'Google server key', 'SKIP', 'GOOGLE_SERVER_KEY not set: the server uses OpenStreetMap instead (slower, 1 request/second)');
  }
  const r = await http<never>(nominatimSearchUrl('Granada, Nicaragua', 'en'), { headers: { 'User-Agent': NOMINATIM_UA } });
  const g = parseNominatimSearch(r.body);
  report('Geocoding', 'OpenStreetMap fallback', g && Math.abs(g.lat - 11.93) < 0.2 ? 'PASS' : 'FAIL', g ? `${g.name}, ${g.country} (${g.lat.toFixed(3)}, ${g.lon.toFixed(3)})` : `HTTP ${r.status}`);
});

  /* ------------------------------ summary ------------------------------ */

  const count = (s: Status) => results.filter((r) => r.status === s).length;
  console.log(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped`);
  process.exit(count('FAIL') ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
