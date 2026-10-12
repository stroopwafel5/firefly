import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { OVERPASS_URL } from '../attractions/osm';
import { DAY, cached, isWarmup, mapLimit, requireAuth, requireString } from '../util';
import { MapAccess, OverpassAccessJson, accessQuery, mapFeatureFor, readMapAccess } from './osmAccess';
import { NEEDS, Need, accessLinks, findNeeds, htmlToText, isPublicWebUrl } from './phrases';

const within = <T>(ms: number, p: Promise<T>, fallback: T) => Promise.race([p, new Promise<T>((ok) => setTimeout(() => ok(fallback), ms))]);

/**
 * Confirms, need by need, whether a place suits blind, hard-of-hearing, autistic or
 * physically disabled visitors — only from sources anyone can check:
 *  1. Organisations (Firestore `accessibility/{tripadvisorId}`), added by Different Route from
 *     disability and tourism bodies: Access Israel, Tourisme & Handicap, Reisen für Alle,
 *     IBCCES Certified Autism Centers, AccessAble, Euan's Guide… (`npm run accessibility`).
 *  2. OpenStreetMap: what mappers tagged on the place (wheelchair=yes, tactile_paving=yes,
 *     hearing_loop=yes, sensory_friendly=yes…; osmAccess.ts), linked to the map feature.
 *  3. The venue's own website: its accessibility pages (found from the home page's links, or
 *     /accessibility) are read for wording specific to each need (phrases.ts), in 15 languages.
 * Each confirmation keeps its source URL, which the app shows. Nothing is inferred.
 */

export interface Source {
  need: Need;
  url: string;
  /** 'map' = OpenStreetMap's tags on the place. */
  by: 'venue' | 'organisation' | 'map';
  org?: string;
  phrase?: string;
  checkedAt: number;
}
export interface Verdict {
  needs: Need[];
  sources: Source[];
}

const UA = 'Mozilla/5.0 (compatible; FireflyBot/1.0; +https://www.differentroute.net)';
const VENUE_TTL = 30 * DAY;
const PAGE_MS = 5_000;

async function page(url: string): Promise<{ html: string; url: string } | null> {
  if (!isPublicWebUrl(url)) return null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en,he;q=0.9,fr;q=0.8,*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(PAGE_MS) });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html') || !isPublicWebUrl(res.url)) return null;
    return { html: (await res.text()).slice(0, 400_000), url: res.url };
  } catch {
    return null;
  }
}

/**
 * What the venue's own site says, per need (cached 30 days per site). A site that couldn't be
 * read (slow, down) is not cached, so it is tried again next time instead of counting as
 * "says nothing" for a month.
 */
export async function checkVenue(website: string): Promise<Source[]> {
  if (!website || !isPublicWebUrl(website)) return [];
  const origin = new URL(website).origin;
  // v2: more languages; statements about the website itself no longer count.
  const { value } = await cached<Source[] | null>(
    `a11y:v2:${origin}`,
    VENUE_TTL,
    async () => {
      const home = await page(website);
      if (!home) return null;
      const pages = [home];
      // Up to two accessibility pages per venue, read at the same time.
      const links = accessLinks(home.html, home.url, 2);
      const more = await Promise.all((links.length ? links : [`${origin}/accessibility`]).map(page));
      for (const p of more) if (p) pages.push(p);
      const sources: Source[] = [];
      for (const need of NEEDS) {
        // The accessibility pages are the better source; the home page counts too.
        for (const p of [...pages.slice(1), pages[0]]) {
          const hit = findNeeds(htmlToText(p.html), [need])[need];
          if (hit) {
            sources.push({ need, url: p.url, by: 'venue', phrase: hit.slice(0, 160), checkedAt: Date.now() });
            break;
          }
        }
      }
      return sources;
    },
    (v) => v !== null,
  );
  return value ?? [];
}

/** Organisation records for these Tripadvisor ids. */
export async function registryFor(ids: string[]): Promise<Map<string, Source[]>> {
  const out = new Map<string, Source[]>();
  const db = getFirestore();
  for (let i = 0; i < ids.length; i += 100) {
    const refs = ids.slice(i, i + 100).map((id) => db.collection('accessibility').doc(id));
    if (!refs.length) continue;
    const snaps = await db.getAll(...refs).catch(() => []);
    for (const s of snaps) {
      const d = s.data() as { sources?: Array<Omit<Source, 'by'>> } | undefined;
      if (d?.sources?.length) out.set(s.id, d.sources.filter((x) => NEEDS.includes(x.need)).map((x) => ({ ...x, by: 'organisation' as const })));
    }
  }
  return out;
}

/** OpenStreetMap's accessibility tags around a point, for these needs (cached 7 days; never throws). */
export async function mapAccessNear(lat: number, lon: number, radiusKm: number, needs: Need[]): Promise<MapAccess[]> {
  if (!needs.length) return [];
  const r = Math.round(Math.max(2, Math.min(15, radiusKm)));
  const key = `a11y:map:v1:${lat.toFixed(2)},${lon.toFixed(2)}:${r}:${[...needs].sort().join(',')}`;
  try {
    const { value } = await cached<MapAccess[] | null>(
      key,
      7 * DAY,
      async () => {
        const res = await fetch(OVERPASS_URL, {
          method: 'POST',
          headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(accessQuery(lat, lon, r, needs))}`,
          signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) return null;
        return readMapAccess((await res.json()) as OverpassAccessJson, needs);
      },
      (v) => v !== null,
    );
    return value ?? [];
  } catch (e) {
    logger.warn('accessibility map tags failed', { error: (e as Error).message });
    return [];
  }
}

export function verdict(sources: Source[], wanted: readonly Need[] = NEEDS): Verdict {
  const kept = sources.filter((s) => wanted.includes(s.need));
  return { needs: NEEDS.filter((n) => kept.some((s) => s.need === n)), sources: kept };
}

/** The map's statements about this place, as sources. */
export function mapSources(a: { name: string; location?: { locLat: number; locLon: number }; wikidataId?: unknown }, map: MapAccess[], wanted: Need[]): Source[] {
  if (!a.location || !map.length) return [];
  const f = mapFeatureFor({ name: a.name, location: a.location, wikidataId: typeof a.wikidataId === 'string' ? a.wikidataId : undefined }, map);
  if (!f) return [];
  return wanted.filter((n) => f.found[n]).map((n) => ({ need: n, url: f.url, by: 'map' as const, org: 'OpenStreetMap', phrase: f.found[n], checkedAt: Date.now() }));
}

/** Google Maps' "wheelchair-accessible entrance" for a place (googlePlaces.ts → wheelchairNote). */
export function googleSources(a: { wheelchair?: unknown; wheelchairPage?: unknown; link?: unknown; provider?: unknown }, wanted: Need[]): Source[] {
  if (!wanted.includes('physical') || typeof a.wheelchair !== 'string' || !a.wheelchair) return [];
  const page = typeof a.wheelchairPage === 'string' && a.wheelchairPage ? a.wheelchairPage : a.provider === 'google' && typeof a.link === 'string' ? a.link : '';
  if (!page) return [];
  return [{ need: 'physical', url: page, by: 'map', org: 'Google Maps', phrase: a.wheelchair, checkedAt: Date.now() }];
}

/**
 * Adds `disabilityCompatible` and `accessibilitySources` to attractions, for the needs asked
 * about only: organisation records and the map's tags first, venue websites for the rest
 * (12 at a time, in list order — the best-known places first). Whatever isn't checked by
 * `deadline` (ms timestamp) goes back unconfirmed, so the answer is never late.
 */
export async function withAccessibility<T extends { id: string; name: string; website?: string; location?: { locLat: number; locLon: number }; wikidataId?: unknown; wheelchair?: unknown; wheelchairPage?: unknown; link?: unknown; provider?: unknown }>(
  items: T[],
  wanted: Need[],
  o: { map?: Promise<MapAccess[]>; deadline?: number } = {},
): Promise<Array<T & { disabilityCompatible: string[]; accessibilitySources: Source[] }>> {
  if (!wanted.length) return items.map((x) => ({ ...x, disabilityCompatible: [], accessibilitySources: [] }));
  const deadline = o.deadline ?? Date.now() + 40_000;
  const left = () => Math.max(0, deadline - Date.now());
  const [reg, map] = await Promise.all([
    within(
      Math.min(10_000, left()),
      registryFor(items.map((x) => x.id)).catch((e) => {
        logger.warn('accessibility registry read failed', e);
        return new Map<string, Source[]>();
      }),
      new Map<string, Source[]>(),
    ),
    o.map ? within(Math.min(20_000, left()), o.map, [] as MapAccess[]) : Promise.resolve([] as MapAccess[]),
  ]);
  const known = items.map((x) => [...(reg.get(x.id) ?? []), ...mapSources(x, map, wanted), ...googleSources(x, wanted)]);
  const fromVenue: Source[][] = items.map(() => []);
  const checks = mapLimit(items, 12, async (x, i) => {
    const missing = wanted.filter((n) => !known[i].some((s) => s.need === n));
    if (!missing.length || !x.website || left() < 1_000) return;
    fromVenue[i] = (await checkVenue(x.website).catch(() => [] as Source[])).filter((s) => missing.includes(s.need));
  });
  await within(left(), checks, undefined);
  return items.map((x, i) => {
    const v = verdict([...known[i], ...fromVenue[i]], wanted);
    return { ...x, disabilityCompatible: v.needs, accessibilitySources: v.sources };
  });
}

export const parseNeeds = (v: unknown): Need[] => (Array.isArray(v) ? NEEDS.filter((n) => v.includes(n)) : []);

/** The attraction page's Accessibility section: all four needs for one place. */
export const attractionAccessibility = onCall({ timeoutSeconds: 60 }, async (req) => {
  if (isWarmup(req)) return { warm: true };
  requireAuth(req);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const id = requireString(d.id, 'id', 40);
  const website = typeof d.website === 'string' ? d.website.slice(0, 500) : '';
  if (website && !isPublicWebUrl(website)) throw new HttpsError('invalid-argument', 'website must be a public web address');
  // Where the place is and its name (newer apps send them): for OpenStreetMap's tags.
  const lat = typeof d.lat === 'number' ? d.lat : NaN;
  const lon = typeof d.lon === 'number' ? d.lon : NaN;
  const name = typeof d.name === 'string' ? d.name.slice(0, 200) : '';
  const here = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && name ? { locLat: lat, locLon: lon } : undefined;
  const [x] = await withAccessibility([{ id, name, website, location: here }], NEEDS, { map: here ? mapAccessNear(lat, lon, 2, NEEDS) : undefined, deadline: Date.now() + 45_000 });
  return { needs: x.disabilityCompatible, sources: x.accessibilitySources };
});
