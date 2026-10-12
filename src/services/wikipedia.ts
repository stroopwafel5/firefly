import AsyncStorage from '@react-native-async-storage/async-storage';
import { config } from '../config';
import { TYPE_PHOTO_ARTICLES } from '../data/tripTypes';
import type { Lang } from '../i18n/localized';
import { AI_IMAGE } from '../models';
import type { Attraction, EventType, FunFact, KidText, PhotoSource, PlacePhoto } from '../models';
import { PROVIDER_LANG } from '../i18n/localized';
import { kidSummary, nameSimilarity, pickFunFact } from '../planner/kidify';
import { introduction, isBusinessVenue, scriptOf, wikiScript, wikipediaTitle } from '../planner/describe';
import { GeoHit, WikiPage, detailsUrl, geosearchUrl, readGeosearch, wikiAttractions } from '../planner/wikiNearby';
import { api } from './api';

/**
 * Wikipedia is used for three verifiable things:
 *  1. real photos for the trip-type picker (lead photo of a named place),
 *  2. kid-friendly descriptions (Simple English Wikipedia, or he/ru Wikipedia),
 *  3. one sourced "fun fact" per place in the kids' plan.
 * Every text and photo comes back with the article URL it was taken from.
 */

// Wikipedia refuses anonymous app traffic (Android's default "okhttp/…" User-Agent): name the app
// in both headers (Api-User-Agent is the one browsers may send; the app can set User-Agent itself).
const HEADERS = { 'User-Agent': config.wikiUserAgent, 'Api-User-Agent': config.wikiUserAgent, Accept: 'application/json' };

interface Summary {
  title: string;
  extract: string;
  url: string;
  image?: string;
  /** A smaller copy (~320 px wide) of the same photo. */
  thumb?: string;
  imageSourcePage?: string;
  lat?: number;
  lon?: number;
}

async function getJson<T>(url: string, timeoutMs = 15_000): Promise<T | null> {
  // React Native's fetch has no time limit of its own: never let one slow answer hold up a trip.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function summary(wiki: string, title: string): Promise<Summary | null> {
  const j = await getJson<{
    title: string;
    extract?: string;
    type?: string;
    content_urls?: { desktop?: { page?: string } };
    originalimage?: { source: string };
    thumbnail?: { source: string };
    coordinates?: { lat: number; lon: number };
  }>(`https://${wiki}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
  if (!j || j.type === 'disambiguation' || !j.extract) return null;
  const image = j.originalimage?.source ?? j.thumbnail?.source;
  const file = image ? decodeURIComponent(image.split('/').pop() ?? '').replace(/^\d+px-/, '') : undefined;
  return {
    title: j.title,
    extract: j.extract,
    url: j.content_urls?.desktop?.page ?? `https://${wiki}.wikipedia.org/wiki/${encodeURIComponent(j.title)}`,
    image,
    thumb: j.thumbnail?.source,
    imageSourcePage: file ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}` : undefined,
    lat: j.coordinates?.lat,
    lon: j.coordinates?.lon,
  };
}

/**
 * Finds the Wikipedia article about a place: nearby articles whose title matches its name. Only
 * when the name is written in another alphabet than this Wikipedia's (a Hebrew name, English
 * Wikipedia) is the article right on the spot (60 m) taken without a matching title — never for a
 * Latin name in English Wikipedia, where a different title means a different thing.
 */
export async function findArticle(wiki: string, name: string, lat: number, lon: number): Promise<string | null> {
  const j = await getJson<{ query?: { geosearch?: Array<{ title: string; dist: number }> } }>(
    `https://${wiki}.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}%7C${lon}&gsradius=1000&gslimit=20&format=json&origin=*`,
  );
  const hits = j?.query?.geosearch ?? [];
  let best: { title: string; s: number; dist: number } | null = null;
  for (const h of hits) {
    const s = nameSimilarity(name, h.title);
    if (s < 0.5) continue;
    if (!best || s > best.s || (s === best.s && h.dist < best.dist)) best = { title: h.title, s, dist: h.dist };
  }
  if (best) return best.title;
  // Different-alphabet name: accept the closest article only if it is practically on the spot.
  const script = scriptOf(name);
  if (!script || script === wikiScript(wiki)) return null;
  const closest = hits[0];
  return closest && closest.dist < 60 ? closest.title : null;
}

/* ------------------------------------------------------------------ */
/* Fuller descriptions for planned places                               */
/* ------------------------------------------------------------------ */

/** The same article in another language (Wikipedia's own interlanguage links). */
async function inLanguage(fromWiki: string, title: string, toWiki: string): Promise<string | null> {
  if (fromWiki === toWiki) return title;
  const j = await getJson<{ query?: { pages?: Array<{ langlinks?: Array<{ title: string }> }> } }>(
    `https://${fromWiki}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=langlinks&lllang=${toWiki}&redirects=1&format=json&formatversion=2&origin=*`,
  );
  return j?.query?.pages?.[0]?.langlinks?.[0]?.title ?? null;
}

/** The article about a Wikidata item in one language. */
async function fromWikidata(qid: string, wiki: string): Promise<string | null> {
  const j = await getJson<{ entities?: Record<string, { sitelinks?: Record<string, { title: string }> }> }>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=sitelinks&sitefilter=${wiki}wiki&format=json&origin=*`,
  );
  return j?.entities?.[qid]?.sitelinks?.[`${wiki}wiki`]?.title ?? null;
}

async function articleFor(a: Attraction, wiki: string): Promise<string | null> {
  const linked = wikipediaTitle(a.link);
  if (linked) {
    const t = await inLanguage(linked[0], linked[1], wiki);
    if (t) return t;
  }
  if (a.wikidataId) {
    const t = await fromWikidata(a.wikidataId, wiki);
    if (t) return t;
  }
  // A club, karaoke bar or restaurant: only an article linked to it (above), never one found nearby.
  if (isBusinessVenue(a)) return null;
  return findArticle(wiki, a.name, a.location.locLat, a.location.locLon);
}

const describeCache = new Map<string, Promise<{ text: string; url: string; source: 'wikipedia' } | null>>();

/**
 * A fuller description of a place: the introduction of its Wikipedia article in the trip's
 * language (found through its own link, its Wikidata item, or nearby articles with its name);
 * in English when that language has none and the place has hardly any description at all.
 * Always with the article's address, shown under the text.
 */
export function describeAttraction(a: Attraction, lang: Lang): Promise<{ text: string; url: string; source: 'wikipedia' } | null> {
  const key = `${lang}:${a.id}`;
  let p = describeCache.get(key);
  if (!p) {
    p = (async () => {
      const wikis = [PROVIDER_LANG[lang].wiki];
      if (lang !== 'en' && a.description.trim().length < 60) wikis.push('en');
      for (const wiki of wikis) {
        const title = await articleFor(a, wiki);
        const s = title ? await summary(wiki, title) : null;
        if (s?.extract) return { text: introduction(s.extract), url: s.url, source: 'wikipedia' as const };
      }
      return null;
    })();
    describeCache.set(key, p);
  }
  return p;
}

const kidCache = new Map<string, { kidText?: KidText; funFact?: FunFact }>();

/**
 * Kids' content for one attraction.
 *  - English: Simple English Wikipedia if it has the place, else English Wikipedia.
 *  - Hebrew / Russian: that language's Wikipedia, else English.
 *  - If the server has a Claude key configured, the description is rephrased for 7–10 year
 *    olds strictly from that sourced text (no new facts); otherwise the article intro is used.
 *  - The fun fact is always a sentence quoted from the article, linked to it.
 */
export async function kidContent(a: Attraction, lang: Lang): Promise<{ kidText?: KidText; funFact?: FunFact }> {
  const key = `${lang}:${a.id}`;
  const hit = kidCache.get(key);
  if (hit) return hit;
  const { locLat: lat, locLon: lon } = a.location;
  const wikis = lang === 'en' ? ['simple', 'en'] : [lang, 'en'];
  let found: Summary | null = null;
  let foundWiki = '';
  for (const wiki of wikis) {
    if (isBusinessVenue(a)) break;
    const title = await findArticle(wiki, a.name, lat, lon);
    if (!title) continue;
    found = await summary(wiki, title);
    if (found) {
      foundWiki = wiki;
      break;
    }
  }
  const out: { kidText?: KidText; funFact?: FunFact } = {};
  if (found) {
    const factLang: Lang = foundWiki === 'he' || foundWiki === 'ru' ? (foundWiki as Lang) : 'en';
    let text = kidSummary(found.extract, 2);
    if (text && foundWiki !== 'simple') {
      try {
        const r = await api.kidify({ text: found.extract.slice(0, 1500), lang, title: found.title });
        if (r.text) text = r.text;
      } catch {
        /* rewrite is optional */
      }
    }
    if (text) out.kidText = { attractionId: a.id, text, sourceUrl: found.url, sourceTitle: found.title };
    // Fun facts come from the full-language article when Simple English had the intro.
    let factSource = found;
    if (foundWiki === 'simple') {
      const en = await summary('en', found.title);
      if (en) factSource = en;
    }
    const fact = pickFunFact(factSource.extract, factLang);
    if (fact) out.funFact = { attractionId: a.id, text: fact, sourceUrl: factSource.url, sourceTitle: factSource.title };
  }
  kidCache.set(key, out);
  return out;
}

/* ------------------------------------------------------------------ */
/* Trip-type photos                                                     */
/* ------------------------------------------------------------------ */

const TYPE_PHOTO_KEY = 'firefly.typePhotos.v1';

export async function typePhotos(): Promise<Partial<Record<EventType, PhotoSource & { place: string }>>> {
  try {
    const cached = await AsyncStorage.getItem(TYPE_PHOTO_KEY);
    if (cached) return JSON.parse(cached);
  } catch {
    /* ignore */
  }
  const out: Partial<Record<EventType, PhotoSource & { place: string }>> = {};
  await Promise.all(
    (Object.keys(TYPE_PHOTO_ARTICLES) as EventType[]).map(async (type) => {
      for (const title of TYPE_PHOTO_ARTICLES[type]) {
        const s = await summary('en', title);
        // Only real photographs: JPEGs. Skips SVG logos, PNG maps and diagrams.
        if (s?.image && /\.jpe?g$/i.test(s.image) && s.imageSourcePage) {
          out[type] = { url: s.image, sourcePage: s.imageSourcePage, credit: `Wikimedia Commons — ${s.title}`, place: s.title };
          break;
        }
      }
    }),
  );
  try {
    if (Object.keys(out).length) await AsyncStorage.setItem(TYPE_PHOTO_KEY, JSON.stringify(out));
  } catch {
    /* ignore */
  }
  return out;
}

const placePhotoCache = new Map<string, Promise<PlacePhoto | null>>();

/**
 * A real photograph of a place for the route card, when the trip has none of its own: the lead
 * photo of its Wikipedia article (in the app's language, else English). Only JPEG photographs —
 * no maps, flags, coats of arms or diagrams — and nothing whose file says it is AI-made.
 */
export function placePhotoFromWikipedia(name: string, lang: Lang): Promise<PlacePhoto | null> {
  const key = `${lang}:${name}`;
  let p = placePhotoCache.get(key);
  if (!p) {
    p = (async () => {
      for (const wiki of [...new Set([PROVIDER_LANG[lang].wiki, 'en'])]) {
        const s = await summary(wiki, name);
        const url = s?.thumb ?? s?.image;
        if (!s || !url || !s.imageSourcePage || !/\.jpe?g$/i.test(s.image ?? url) || AI_IMAGE.test(url)) continue;
        return { url, sourcePage: s.imageSourcePage, credit: `Wikimedia Commons — ${s.title}`, title: s.title };
      }
      return null;
    })();
    placePhotoCache.set(key, p);
  }
  return p;
}

/* ------------------------------------------------------------------ */
/* Sights straight from Wikipedia (the phone's last resort)             */
/* ------------------------------------------------------------------ */

/**
 * Real sights around a place from Wikipedia's articles with coordinates, asked from the phone
 * (see planner/wikiNearby.ts). Used when the server can't answer or finds almost nothing.
 */
export async function wikipediaSightsNear(lat: number, lon: number, lang: Lang, radiusKm = 10): Promise<Attraction[]> {
  const geo = await getJson<{ query?: { geosearch?: GeoHit[] } }>(geosearchUrl(lat, lon, radiusKm));
  const hits = geo ? readGeosearch(geo) : [];
  if (!hits.length) return [];
  const batches: number[][] = [];
  for (let i = 0; i < Math.min(hits.length, 200); i += 50) batches.push(hits.slice(i, i + 50).map((h) => h.pageid));
  const pages = (
    await Promise.all(batches.map((ids) => getJson<{ query?: { pages?: WikiPage[] } }>(detailsUrl(ids, lang)).then((j) => j?.query?.pages ?? [])))
  ).flat();
  return wikiAttractions(hits, pages, lang);
}
