import {
  TERRA_MAX_RADIUS_KM,
  TerraCategory,
  TerraLocation,
  TerraNearby,
  TerraPage,
  asList,
  isOpenBusiness,
  localesFor,
  pagePlan,
} from './tripadvisorMap';

/**
 * How Firefly talks to the Tripadvisor Terra API, independent of Firebase so it can be tested
 * against a simulated Terra server (functions/test/terraFlow.test.ts).
 *
 * Terra's Location endpoints only return places on the account's allowlist. The first time an
 * area is searched, Firefly finds its best-rated places in the catalog, appends their IDs to the
 * allowlist (free, immediate) and asks again. Only Location IDs are remembered (AreaStore), as
 * Terra's caching policy allows; no content is stored.
 */

export type Lang = 'en' | 'he' | 'ru';
type Params = Record<string, string | number | boolean | string[] | undefined>;

export interface TerraTransport {
  get<T>(path: string, params: Params): Promise<{ status: number; body: T | null }>;
  post<T>(path: string, body: unknown): Promise<{ status: number; body: T | null }>;
}

/** Remembers which areas were licensed (Location IDs only). */
export interface AreaStore {
  get(key: string): Promise<{ ids?: number[]; want?: number; at?: number } | undefined>;
  set(key: string, value: { ids: number[]; want: number; at: number }): Promise<void>;
}

export interface NearbyQuery {
  lat: number;
  lon: number;
  radiusKm: number;
  category: TerraCategory;
  lang: Lang;
  want: number;
  /** Use the catalog's lighter data when the full search can't be used (default true). */
  catalogFallback?: boolean;
}

export const RELICENSE_AFTER_MS = 30 * 24 * 3_600_000;

export async function allowlistAppend(t: TerraTransport, ids: number[]): Promise<number> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (!unique.length) return 0;
  const r = await t.post<{ added?: number }>('/allowlist', { operation_type: 'APPEND', allowlist: unique });
  if (r.status !== 200) throw new Error(`allowlist HTTP ${r.status}`);
  return r.body?.added ?? 0;
}

/** Pages through a nearby search (≤ 20 per page, at most 3 pages = Terra's offset limit of 40). */
export async function nearbyPages<T>(t: TerraTransport, path: string, q: NearbyQuery, extra: Params): Promise<{ items: T[]; status: number }> {
  const { size, pages } = pagePlan(q.want);
  const items: T[] = [];
  let status = 200;
  for (let page = 1; page <= pages; page++) {
    const r = await t.get<TerraPage<T>>(path, {
      lat: q.lat,
      lon: q.lon,
      radius: Math.min(TERRA_MAX_RADIUS_KM, Math.max(0.5, q.radiusKm)),
      unit: 'KM',
      category: q.category,
      sort: 'rating,desc',
      size,
      page,
      ...extra,
    });
    status = r.status;
    const data = r.body?.data ?? [];
    items.push(...data);
    if (r.status !== 200 || data.length < size || page >= (r.body?.pagination?.total_pages ?? 1)) break;
  }
  return { items, status };
}

export const areaKey = (q: NearbyQuery) => `${q.category}_${q.lat.toFixed(2)}_${q.lon.toFixed(2)}`;

/**
 * The best-rated open places of one kind around a point, with full details and one photo each.
 * Licenses the area first when needed (at most once a month per area and size).
 */
export async function nearbyPlaces(t: TerraTransport, store: AreaStore, q: NearbyQuery, now = Date.now()): Promise<{ items: TerraNearby[]; licensed: number; fallback?: 'catalog' }> {
  const extra = { include_photo: true, locale: localesFor(q.lang) };
  const usable = (list: TerraNearby[]) => list.filter((n) => n.location?.coordinates && isOpenBusiness(n.location)).slice(0, q.want);
  let res = await nearbyPages<TerraNearby>(t, '/locations/nearby', q, extra);
  if (res.status === 200 && res.items.length >= Math.min(q.want, 8)) return { items: usable(res.items), licensed: 0 };

  const area = await store.get(areaKey(q));
  const fresh = !!area?.at && now - area.at < RELICENSE_AFTER_MS && (area.want ?? 0) >= q.want;
  if (fresh && res.status === 200) return { items: usable(res.items), licensed: 0 };

  const catalog = await nearbyPages<{ location: TerraLocation }>(t, '/catalog/locations/nearby', q, { locale: localesFor(q.lang) });
  const fromCatalog = () => (q.catalogFallback === false ? [] : usable(catalog.items.map((c) => ({ location: c.location }))));
  const ids = catalog.items.map((c) => c.location?.id).filter((id): id is number => !!id);
  let licensed = 0;
  try {
    licensed = await allowlistAppend(t, ids);
  } catch {
    // Can't license (e.g. no allowlist permission): show the catalog's lighter data instead.
    return { items: fromCatalog(), licensed: 0, fallback: 'catalog' };
  }
  await store.set(areaKey(q), { ids, want: q.want, at: now });
  res = await nearbyPages<TerraNearby>(t, '/locations/nearby', q, extra);
  // Packages without the Location endpoints answer 403: use the catalog's lighter data.
  if (res.status !== 200) return { items: fromCatalog(), licensed, fallback: 'catalog' };
  return { items: usable(res.items), licensed };
}

/** Full details for some IDs (in the order asked), licensing any that aren't allowed yet. */
export async function locationsById(t: TerraTransport, ids: number[], lang: Lang): Promise<TerraLocation[]> {
  const wanted = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  if (!wanted.length) return [];
  const get = async () => asList((await t.get<TerraLocation[] | TerraPage<TerraLocation>>('/locations', { id: wanted.join(','), locale: localesFor(lang) })).body);
  let found = await get();
  const missing = wanted.filter((id) => !found.some((l) => l.id === id));
  if (missing.length) {
    await allowlistAppend(t, missing);
    found = await get();
  }
  return wanted.map((id) => found.find((l) => l.id === id)).filter((l): l is TerraLocation => !!l);
}
