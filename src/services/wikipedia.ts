import AsyncStorage from '@react-native-async-storage/async-storage';
import { config } from '../config';
import { TYPE_PHOTO_ARTICLES } from '../data/tripTypes';
import type { Lang } from '../i18n/localized';
import { AI_IMAGE } from '../models';
import type { Attraction, EventType, FunFact, KidText, PhotoSource, PlacePhoto } from '../models';
import { PROVIDER_LANG } from '../i18n/localized';
import { kidSummary, nameSimilarity, pickFunFact } from '../planner/kidify';
import { api } from './api';

/**
 * Wikipedia is used for three verifiable things:
 *  1. real photos for the trip-type picker (lead photo of a named place),
 *  2. kid-friendly descriptions (Simple English Wikipedia, or he/ru Wikipedia),
 *  3. one sourced "fun fact" per place in the kids' plan.
 * Every text and photo comes back with the article URL it was taken from.
 */

const HEADERS = { 'Api-User-Agent': config.wikiUserAgent, Accept: 'application/json' };

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

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
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

/** Finds the Wikipedia article about a place: nearby articles whose title matches its name. */
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
  // Different-language name: accept the closest article only if it is practically on the spot.
  const closest = hits[0];
  return closest && closest.dist < 60 ? closest.title : null;
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
