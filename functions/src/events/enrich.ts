import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { GOOGLE_SERVER_KEY } from '../params';
import { geocodeText } from '../google';
import { mapLimit, secret, sha1 } from '../util';
import { EventJSON } from './types';
import { hostname } from './parse';

const UA = 'Mozilla/5.0 (compatible; FireflyBot/1.0; +https://www.differentroute.net)';
const BAD_IMAGE = /logo|placeholder|default|favicon|icon|sprite|blank|avatar/i;

/**
 * The image the event's own page publishes (og:image / twitter:image), so the photo shown is
 * the publisher's and its source page is the event page itself. Returns null when absent.
 */
export async function pageImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null;
    const html = (await res.text()).slice(0, 300_000);
    const meta = (prop: string) =>
      new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i').exec(html)?.[1] ??
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i').exec(html)?.[1];
    const raw = meta('og:image:secure_url') ?? meta('og:image') ?? meta('twitter:image');
    if (!raw) return null;
    const abs = new URL(raw.replace(/&amp;/g, '&'), res.url).toString();
    if (!/^https?:/.test(abs) || BAD_IMAGE.test(abs)) return null;
    return abs;
  } catch {
    return null;
  }
}

/** Google events: geocode the address and swap the Google thumbnail for the publisher's own image. */
export async function finishGoogleEvents(
  raw: Array<Omit<EventJSON, 'location'> & { _address: string }>,
  lang: 'en' | 'he' | 'ru',
): Promise<EventJSON[]> {
  const key = secret(GOOGLE_SERVER_KEY);
  // Without a Google key, addresses go to OpenStreetMap at 1 per second: geocode fewer of them.
  // With a key: 12 events at a time, and each event's address and photo are looked up together.
  const done = await mapLimit(raw.slice(0, key ? 40 : 15), key ? 12 : 1, async (r) => {
    const [geo, img] = await Promise.all([
      geocodeText(r._address, lang, key).catch(() => null),
      key ? pageImage(r.link) : Promise.resolve(null),
    ]);
    if (!geo) return null; // no mappable address → not shown (must be physical and on the map)
    const { _address: _ignored, ...rest } = r;
    const photo = img ?? (key ? null : await pageImage(r.link));
    const ev: EventJSON = {
      ...rest,
      country: geo.country || r.country,
      location: { locLat: geo.lat, locLon: geo.lon },
      ...(photo
        ? { photo_urls: [photo], photoSources: [{ url: photo, sourcePage: r.link, credit: `Published by ${hostname(r.link)}` }] }
        : {}),
    };
    return ev;
  });
  return done.filter((e): e is EventJSON => !!e);
}

/** Removes photos users reported and an admin hid (collection hiddenPhotos/{sha1(url)}). */
export async function dropHiddenPhotos(events: EventJSON[]): Promise<EventJSON[]> {
  const urls = [...new Set(events.flatMap((e) => e.photo_urls))];
  if (!urls.length) return events;
  const db = getFirestore();
  const hidden = new Set<string>();
  try {
    for (let i = 0; i < urls.length; i += 100) {
      const refs = urls.slice(i, i + 100).map((u) => db.collection('hiddenPhotos').doc(sha1(u)));
      const snaps = await db.getAll(...refs);
      snaps.forEach((s: { exists: boolean }, k: number) => s.exists && hidden.add(urls[i + k]));
    }
  } catch (e) {
    logger.warn('hiddenPhotos check failed', e);
  }
  if (!hidden.size) return events;
  return events.map((e) => {
    const keep = e.photo_urls.map((u, i) => [u, e.photoSources[i]] as const).filter(([u]) => !hidden.has(u));
    return { ...e, photo_urls: keep.map(([u]) => u), photoSources: keep.map(([, s]) => s) };
  });
}
