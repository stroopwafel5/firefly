import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AreaStore, NearbyQuery, RELICENSE_AFTER_MS, TerraTransport, allowlistAppend, locationsById, nearbyPlaces } from '../src/terraFlow';
import { TerraLocation, toAttraction } from '../src/tripadvisorMap';

/**
 * A simulated Tripadvisor Terra server that follows the documented rules
 * (docs.terra.tripadvisor.com): allowlist-scoped Location endpoints, an unrestricted catalog,
 * size ≤ 20, radius ≤ 8 km, nearby offset ≤ 40, billing per place returned, free allowlist calls.
 */
type Cat = 'ATTRACTION' | 'RESTAURANT' | 'HOTEL';
const km = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const s = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLon - aLon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
};

class FakeTerra implements TerraTransport {
  allowlist = new Set<number>();
  billed = 0;
  calls: string[] = [];
  /** Accounts whose contract covers everything don't use an allowlist. */
  usesAllowlist = true;
  locationEndpointsForbidden = false;
  allowlistForbidden = false;
  multiGetAsArray = false;
  constructor(public places: Array<TerraLocation & { _cat: Cat }>) {}

  private problem(status: number, detail: string) {
    return { status, body: { status, title: 'Bad Request', detail } as never };
  }
  private licensed = (l: TerraLocation) => !this.usesAllowlist || this.allowlist.has(l.id);

  async get<T>(path: string, p: Record<string, unknown>): Promise<{ status: number; body: T | null }> {
    this.calls.push(path);
    if (p.version !== undefined && String(p.version) !== '1') return this.problem(400, 'bad version');
    const size = Number(p.size ?? 20);
    const page = Number(p.page ?? 1);
    if (size > 20) return this.problem(400, "'size' should not go over 20");
    if (path === '/locations' || /^\/locations\/\d+/.test(path)) {
      if (this.locationEndpointsForbidden) return this.problem(403, 'API Key does not have access to endpoint');
      const ids = String(p.id ?? path.split('/')[2]).split(',').map(Number);
      const found = this.places.filter((l) => ids.includes(l.id) && this.licensed(l)).map(strip);
      this.billed += found.length;
      if (path !== '/locations') return found[0] ? { status: 200, body: found[0] as T } : this.problem(404, 'Not Found');
      return { status: 200, body: (this.multiGetAsArray ? found : { data: found }) as T };
    }
    const nearby = path === '/locations/nearby' || path === '/catalog/locations/nearby';
    if (!nearby) return this.problem(404, 'Not Found');
    if (path === '/locations/nearby' && this.locationEndpointsForbidden) return this.problem(403, 'API Key does not have access to endpoint');
    const radius = Number(p.radius);
    if (p.unit === 'KM' && radius > 8) return this.problem(400, '`radius` cannot be greater than 8.0 KM');
    if (path === '/locations/nearby' && size * (page - 1) > 40) return this.problem(400, 'offset too large');
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    const all = this.places
      .filter((l) => (!p.category || l._cat === p.category) && km(lat, lon, l.coordinates!.latitude, l.coordinates!.longitude) <= radius)
      .filter((l) => path.startsWith('/catalog') || this.licensed(l))
      .sort((a, b) => (b.traveler_ratings?.overall?.rating ?? 0) - (a.traveler_ratings?.overall?.rating ?? 0));
    const slice = all.slice(size * (page - 1), size * page);
    this.billed += slice.length;
    const data = slice.map((l) =>
      path.startsWith('/catalog')
        ? { location: { id: l.id, names: l.names, descriptions: l.descriptions, coordinates: l.coordinates, overall_rating: l.traveler_ratings?.overall, urls: l.urls } }
        : { location: strip(l), ...(p.include_photo ? { photo: { id: l.id * 10, photo: { original_size_url: `https://media.example/${l.id}.jpg` } } } : {}) },
    );
    return { status: 200, body: { data, pagination: { page, size, total_elements: all.length, total_pages: Math.ceil(all.length / size) } } as T };
  }

  async post<T>(path: string, body: unknown): Promise<{ status: number; body: T | null }> {
    this.calls.push(`POST ${path}`);
    if (this.allowlistForbidden) return this.problem(403, 'not allowed');
    const b = body as { operation_type: string; allowlist: number[] };
    assert.equal(b.operation_type, 'APPEND');
    let added = 0;
    for (const id of b.allowlist) if (!this.allowlist.has(id) && this.allowlist.add(id)) added++;
    return { status: 200, body: { added, deleted: 0, no_change: b.allowlist.length - added } as T };
  }
}
const strip = ({ _cat: _ignored, ...l }: TerraLocation & { _cat?: Cat }) => l as TerraLocation;

/** A made-up city: 70 attractions, 30 restaurants, 10 hotels within ~6 km, ratings 3.0–5.0. */
function city(): Array<TerraLocation & { _cat: Cat }> {
  const out: Array<TerraLocation & { _cat: Cat }> = [];
  const mk = (i: number, cat: Cat) => ({
    id: 1000 + i,
    _cat: cat,
    names: [{ language: 'en', value: `${cat} ${i}`, primary: true }],
    descriptions: [{ language: 'en', value: `Place ${i}` }],
    coordinates: { latitude: 50.0875 + ((i % 9) - 4) * 0.01, longitude: 14.4213 + ((Math.floor(i / 9) % 9) - 4) * 0.012 },
    categories: [{ id: cat === 'ATTRACTION' ? 'museums' : cat.toLowerCase(), hierarchy: cat === 'ATTRACTION' ? 'attractions > museums' : cat.toLowerCase() }],
    traveler_ratings: { overall: { rating: 3 + ((i * 13) % 21) / 10, count: 100 + i } }, // 3.0–5.0
    status: { value: (i === 8 ? 'CLOSED' : 'OPEN') as 'OPEN' | 'CLOSED' }, // the best-rated one has closed
    urls: { tripadvisor: { main: `https://www.tripadvisor.com/d${1000 + i}` } },
  });
  for (let i = 0; i < 70; i++) out.push(mk(i, 'ATTRACTION'));
  for (let i = 70; i < 100; i++) out.push(mk(i, 'RESTAURANT'));
  for (let i = 100; i < 110; i++) out.push(mk(i, 'HOTEL'));
  return out;
}
class MemoryStore implements AreaStore {
  m = new Map<string, { ids: number[]; want: number; at: number }>();
  async get(k: string) {
    return this.m.get(k);
  }
  async set(k: string, v: { ids: number[]; want: number; at: number }) {
    this.m.set(k, v);
  }
}
const q = (want: number, extra: Partial<NearbyQuery> = {}): NearbyQuery => ({ lat: 50.0875, lon: 14.4213, radiusKm: 8, category: 'ATTRACTION', lang: 'en', want, ...extra });

test('Terra flow: a new area is licensed once (catalog → allowlist → licensed search)', async () => {
  const terra = new FakeTerra(city());
  const store = new MemoryStore();
  const r = await nearbyPlaces(terra, store, q(24));
  assert.deepEqual(terra.calls, ['/locations/nearby', '/catalog/locations/nearby', '/catalog/locations/nearby', 'POST /allowlist', '/locations/nearby', '/locations/nearby']);
  assert.equal(r.licensed, 24);
  assert.equal(r.items.length, 23, '24 returned, the one marked CLOSED is dropped');
  const ratings = r.items.map((n) => n.location.traveler_ratings!.overall!.rating!);
  assert.deepEqual(ratings, [...ratings].sort((a, b) => b - a), 'best rated first');
  assert.ok(r.items.every((n) => n.photo?.photo?.original_size_url), 'one photo each');
  assert.equal(terra.billed, 48, 'first time: catalog 24 + licensed 24 places billed (not 40 + 40)');
  assert.deepEqual(store.m.get('ATTRACTION_50.09_14.42')?.ids.length, 24, 'only IDs are remembered');

  terra.calls = [];
  terra.billed = 0;
  const again = await nearbyPlaces(terra, store, q(24));
  assert.deepEqual(terra.calls, ['/locations/nearby', '/locations/nearby'], 'next trip: no catalog, no allowlist call');
  assert.equal(terra.billed, 24);
  assert.equal(again.items.length, 23);
});

test('Terra flow: asking for more places later licenses more; a month later the area is refreshed', async () => {
  const terra = new FakeTerra(city());
  const store = new MemoryStore();
  const t0 = Date.UTC(2026, 9, 10);
  await nearbyPlaces(terra, store, q(10), t0);
  terra.calls = [];
  // Shrink what's licensed so the licensed search comes back short, as if places closed.
  terra.allowlist = new Set([...terra.allowlist].slice(0, 5));
  const short = await nearbyPlaces(terra, store, q(10), t0 + 1000);
  assert.ok(!terra.calls.includes('POST /allowlist'), 'licensed recently: not re-licensed');
  assert.equal(short.items.length, 4); // 5 still licensed, one of them closed
  terra.calls = [];
  await nearbyPlaces(terra, store, q(30), t0 + 2000);
  assert.ok(terra.calls.includes('POST /allowlist'), 'more wanted than licensed before → license more');
  terra.calls = [];
  terra.allowlist = new Set([...terra.allowlist].slice(0, 5));
  await nearbyPlaces(terra, store, q(10), t0 + 2000 + RELICENSE_AFTER_MS + 1);
  assert.ok(terra.calls.includes('POST /allowlist'), 'after 30 days the area is refreshed');
});

test('Terra flow: requests respect every documented limit (no 400s)', async () => {
  const terra = new FakeTerra(city());
  // radius 25 km asked → clamped to 8; want 60 → 3 pages of 20 (offset 40, the maximum)
  const r = await nearbyPlaces(terra, new MemoryStore(), q(60, { radiusKm: 25 }));
  assert.equal(r.items.length, 59);
  // want 45 → 3 pages of 15
  const r2 = await nearbyPlaces(new FakeTerra(city()), new MemoryStore(), q(45));
  assert.equal(r2.items.length, 44);
  // restaurants and hotels are separate categories
  const rest = await nearbyPlaces(terra, new MemoryStore(), q(12, { category: 'RESTAURANT', radiusKm: 5 }));
  assert.ok(rest.items.length > 0 && rest.items.every((n) => n.location.names![0].value.startsWith('RESTAURANT')));
});

test('Terra flow: accounts without an allowlist never touch the catalog', async () => {
  const terra = new FakeTerra(city());
  terra.usesAllowlist = false;
  const r = await nearbyPlaces(terra, new MemoryStore(), q(20));
  assert.deepEqual(terra.calls, ['/locations/nearby']);
  assert.equal(r.items.length, 19);
  assert.equal(terra.billed, 20);
});

test('Terra flow: package without Location endpoints (403) or without allowlist rights → catalog data', async () => {
  const terra = new FakeTerra(city());
  terra.locationEndpointsForbidden = true;
  const r = await nearbyPlaces(terra, new MemoryStore(), q(10));
  assert.equal(r.fallback, 'catalog');
  assert.equal(r.items.length, 10);
  const a = toAttraction(r.items[0].location, [], 'en');
  assert.ok(a.rating && a.link.startsWith('https://www.tripadvisor.com/'), 'rating and link still come through');

  const t2 = new FakeTerra(city());
  t2.allowlistForbidden = true;
  const r2 = await nearbyPlaces(t2, new MemoryStore(), q(10));
  assert.equal(r2.fallback, 'catalog');
  assert.equal(r2.items.length, 10);
});

test('Terra flow: details by ID license missing places and keep the order asked', async () => {
  const terra = new FakeTerra(city());
  terra.allowlist.add(1005);
  const out = await locationsById(terra, [1007, 1005, 1007, 99999], 'ru');
  assert.deepEqual(out.map((l) => l.id), [1007, 1005], 'duplicates and unknown IDs dropped');
  assert.ok(terra.allowlist.has(1007));
  assert.deepEqual(terra.calls, ['/locations', 'POST /allowlist', '/locations']);
  terra.multiGetAsArray = true;
  assert.deepEqual((await locationsById(terra, [1005], 'en')).map((l) => l.id), [1005], 'array-shaped answers work too');
  assert.deepEqual(await locationsById(terra, [], 'en'), []);
});

test('Terra flow: allowlist calls are de-duplicated and never billed; failures surface', async () => {
  const terra = new FakeTerra(city());
  assert.equal(await allowlistAppend(terra, [1, 1, 2, 0, -5]), 2);
  assert.equal(await allowlistAppend(terra, [1, 2]), 0);
  assert.equal(terra.billed, 0);
  terra.allowlistForbidden = true;
  await assert.rejects(allowlistAppend(terra, [3]), /allowlist HTTP 403/);
});
