import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { DAY, cached, isWarmup, mapLimit, requireAuth, requireString } from '../util';
import { NEEDS, Need, accessLinks, findNeeds, htmlToText, isPublicWebUrl } from './phrases';

/**
 * Confirms, need by need, whether a place suits blind, hard-of-hearing, autistic or
 * physically disabled visitors — only from verifiable sources:
 *  1. Organisations (Firestore `accessibility/{tripadvisorId}`), added by Different Route from
 *     disability and tourism bodies: Access Israel, Tourisme & Handicap, Reisen für Alle,
 *     IBCCES Certified Autism Centers, AccessAble, Euan's Guide… (`npm run accessibility`).
 *  2. The venue's own website: its accessibility page (found from the home page's links, or
 *     /accessibility) is read for wording specific to each need (phrases.ts).
 * Each confirmation keeps its source URL, which the app shows. Nothing is inferred.
 */

export interface Source {
  need: Need;
  url: string;
  by: 'venue' | 'organisation';
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

async function page(url: string): Promise<{ html: string; url: string } | null> {
  if (!isPublicWebUrl(url)) return null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(5_000) });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html') || !isPublicWebUrl(res.url)) return null;
    return { html: (await res.text()).slice(0, 400_000), url: res.url };
  } catch {
    return null;
  }
}

/** What the venue's own site says, per need (cached 30 days per site). */
export async function checkVenue(website: string): Promise<Source[]> {
  if (!website || !isPublicWebUrl(website)) return [];
  const origin = new URL(website).origin;
  const { value } = await cached<Source[]>(`a11y:v1:${origin}`, VENUE_TTL, async () => {
    const home = await page(website);
    if (!home) return [];
    const pages = [home];
    // One accessibility page per venue keeps a whole town's check within about half a minute.
    const links = accessLinks(home.html, home.url, 1);
    for (const l of links.length ? links : [`${origin}/accessibility`]) {
      const p = await page(l);
      if (p) pages.push(p);
    }
    const sources: Source[] = [];
    for (const need of NEEDS) {
      // The accessibility page is the better source; the home page counts too.
      for (const p of [...pages.slice(1), pages[0]]) {
        const hit = findNeeds(htmlToText(p.html), [need])[need];
        if (hit) {
          sources.push({ need, url: p.url, by: 'venue', phrase: hit.slice(0, 160), checkedAt: Date.now() });
          break;
        }
      }
    }
    return sources;
  });
  return value;
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

export function verdict(sources: Source[], wanted: readonly Need[] = NEEDS): Verdict {
  const kept = sources.filter((s) => wanted.includes(s.need));
  return { needs: NEEDS.filter((n) => kept.some((s) => s.need === n)), sources: kept };
}

/**
 * Adds `disabilityCompatible` and `accessibilitySources` to attractions, for the needs asked
 * about only. Organisation records first; venue websites for the rest (8 at a time).
 */
export async function withAccessibility<T extends { id: string; website?: string }>(
  items: T[],
  wanted: Need[],
): Promise<Array<T & { disabilityCompatible: string[]; accessibilitySources: Source[] }>> {
  if (!wanted.length) return items.map((x) => ({ ...x, disabilityCompatible: [], accessibilitySources: [] }));
  const reg = await registryFor(items.map((x) => x.id)).catch((e) => {
    logger.warn('accessibility registry read failed', e);
    return new Map<string, Source[]>();
  });
  return mapLimit(items, 8, async (x) => {
    const fromOrgs = reg.get(x.id) ?? [];
    const missing = wanted.filter((n) => !fromOrgs.some((s) => s.need === n));
    const fromVenue = missing.length && x.website ? (await checkVenue(x.website)).filter((s) => missing.includes(s.need)) : [];
    const v = verdict([...fromOrgs, ...fromVenue], wanted);
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
  const [x] = await withAccessibility([{ id, website }], NEEDS);
  return { needs: x.disabilityCompatible, sources: x.accessibilitySources };
});
