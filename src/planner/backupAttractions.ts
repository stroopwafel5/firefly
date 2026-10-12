import type { Lang } from '../i18n/localized';
import { Attraction, AttractionJSON, KIND_TYPES, Location, isKind, popularityOf } from '../models';
import { haversineKm } from './geo';

/**
 * Firefly's backup list of attractions (~10,000 places in Europe and Israel from Wikidata, with
 * their Wikipedia articles and Commons photos), as the phone keeps it: one compact row per place.
 * The same list the server uses (functions/src/attractions/build.ts); `npm run attractions:build`
 * writes the copy bundled with the app, and the app downloads newer ones from Firestore.
 * Pure: unit-tested.
 */

/**
 * [qid, en, he, ru, lat, lon, sitelinks, kind, photo file, article en, he, ru, country, photo author, licence, description]
 * Articles are stored as their titles ("Prague Castle"), which keeps 10,000 places small enough to
 * ship inside the app; full links also work.
 */
export type BackupRow = [
  string, string, string, string, number, number, number, string, string, string, string, string, string, string, string, string,
];

/** The server's cached place (functions/src/attractions/build.ts → CachedPlace). */
export interface CachedPlaceJSON {
  qid: string;
  name: string;
  description?: string;
  lat: number;
  lon: number;
  sitelinks: number;
  kind: string;
  imageFile?: string;
  article?: string;
  country?: string;
  names?: Partial<Record<Lang, string>>;
  articles?: Partial<Record<Lang, string>>;
  credit?: { artist?: string; license?: string };
}

/** "https://he.wikipedia.org/wiki/%D7%9E…" → "מצודת פראג" (the link is rebuilt from it). */
export function articleTitle(url: string | undefined): string {
  if (!url) return '';
  const m = url.match(/^https:\/\/[a-z]+\.wikipedia\.org\/wiki\/(.+)$/);
  if (!m) return url;
  try {
    return decodeURIComponent(m[1]).replace(/_/g, ' ');
  } catch {
    return url;
  }
}

function articleUrl(lang: string, title: string): string {
  if (!title) return '';
  return /^https?:\/\//.test(title) ? title : `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

export function toRow(p: CachedPlaceJSON): BackupRow {
  return [
    p.qid,
    p.names?.en || p.name,
    p.names?.he ?? '',
    p.names?.ru ?? '',
    Math.round(p.lat * 1e5) / 1e5,
    Math.round(p.lon * 1e5) / 1e5,
    p.sitelinks,
    p.kind,
    p.imageFile ?? '',
    articleTitle(p.articles?.en || p.article),
    articleTitle(p.articles?.he),
    articleTitle(p.articles?.ru),
    p.country ?? '',
    (p.credit?.artist ?? '').slice(0, 60),
    p.credit?.license ?? '',
    (p.description ?? '').slice(0, 100),
  ];
}

export const isRow = (r: unknown): r is BackupRow => Array.isArray(r) && r.length >= 16 && typeof r[0] === 'string' && typeof r[4] === 'number';

/** Same scale as the server: 5 + 2.2·log10(Wikipedias + 1), ≈9.0 from ~65 Wikipedias. */
export const popularityFromSitelinks = (n: number) => Math.round(Math.min(10, 5 + 2.2 * Math.log10(Math.max(0, n) + 1)) * 10) / 10;

const commonsUrl = (file: string, width = 960) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=${width}`;
const commonsPage = (file: string) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`;

const VISIT: Record<string, number> = {
  nationalpark: 240, reserve: 150, themepark: 240, zoo: 180, aquarium: 120, museum: 120, gallery: 100, castle: 120, palace: 120,
  fortress: 90, ruins: 90, cave: 90, canyon: 150, waterfall: 75, lake: 90, beach: 120, park: 75, garden: 75, oldtown: 90, church: 40,
  monastery: 60, synagogue: 40, mosque: 40, bridge: 30, square: 30, tower: 45, monument: 30, viewpoint: 30, theatre: 60, market: 60,
};

export function rowToJSON(r: BackupRow, lang: Lang): AttractionJSON {
  const [qid, en, he, ru, lat, lon, sitelinks, kindRaw, file, aEn, aHe, aRu, country, artist, license, description] = r;
  const kind = isKind(kindRaw) ? kindRaw : 'other';
  const name = (lang === 'he' ? he : lang === 'ru' ? ru : en) || en;
  const article = (lang === 'he' ? articleUrl('he', aHe) : lang === 'ru' ? articleUrl('ru', aRu) : '') || articleUrl('en', aEn);
  const photo = file ? commonsUrl(file) : '';
  const credit = [artist, license, 'Wikimedia Commons'].filter(Boolean).join(' · ');
  return {
    id: `wd-${qid}`,
    name,
    description: description ? description.charAt(0).toUpperCase() + description.slice(1) : '',
    types: KIND_TYPES[kind],
    country,
    price: null,
    link: article || `https://www.wikidata.org/wiki/${qid}`,
    photo_urls: photo ? [photo] : [],
    photoSources: photo ? [{ url: photo, sourcePage: commonsPage(file), credit }] : [],
    location: { locLat: lat, locLon: lon },
    openingHours: [],
    category: kind,
    kind,
    popularity: popularityFromSitelinks(sitelinks),
    suggestedMinutes: VISIT[kind] ?? 60,
    provider: 'wikidata',
    wikidataId: qid,
  } as AttractionJSON;
}

/** Places of the list within `radiusKm`, best known first. */
export function rowsNear(rows: BackupRow[], at: Location, radiusKm: number, lang: Lang, limit = 80): Attraction[] {
  return rows
    .filter((r) => haversineKm(at, new Location(r[4], r[5])) <= radiusKm)
    .sort((a, b) => b[6] - a[6])
    .slice(0, limit)
    .map((r) => Attraction.fromJSON(rowToJSON(r, lang)));
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * The server's answer, completed from the phone's list: one entry per place (same Wikidata item,
 * or the same name within 300 m), best known first.
 */
export function mergeWithBackup(server: Attraction[], local: Attraction[]): Attraction[] {
  const out = [...server];
  const ids = new Set(server.flatMap((a) => [a.id, a.wikidataId ? `wd-${a.wikidataId}` : ''].filter(Boolean)));
  for (const a of local) {
    if (ids.has(a.id)) continue;
    if (out.some((b) => norm(b.name) === norm(a.name) && haversineKm(a.location, b.location) < 0.3)) continue;
    ids.add(a.id);
    out.push(a);
  }
  return out.sort((x, y) => popularityOf(y) - popularityOf(x));
}
