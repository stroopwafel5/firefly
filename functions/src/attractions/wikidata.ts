import { KIND_TYPES, Kind, WIKIDATA_CLASSES, classRank, kindOfClass } from './kinds';

/**
 * Wikidata — the free, keyless backup source for attractions (TripAdvisor stays the main one).
 *  - Public SPARQL endpoint, no key or approval; data is CC0 (public domain), so it may be cached.
 *  - Every place has coordinates, its Wikipedia article (the source shown in the app) and often
 *    a Wikimedia Commons photo.
 *  - Popularity comes from "sitelinks": how many Wikipedia language editions have an article
 *    about the place (the Colosseum ≈ 170, a well-known castle ≈ 30, a local chapel ≈ 3).
 * Usage policy: a descriptive User-Agent, few parallel queries, results cached (we keep them
 * 30 days). Pure (no Firebase): query building and parsing are unit-tested.
 */

export const WDQS_URL = 'https://query.wikidata.org/sparql';
export const USER_AGENT = 'FireflyTravelApp/1.0 (Different Route; https://www.differentroute.net) node-fetch';
export type Lang = 'en' | 'he' | 'ru';

const CLASS_LIST = WIKIDATA_CLASSES.map(([q]) => `wd:${q}`).join(', ');

/*
 * How these queries stay fast, even in central London or Paris (hundreds of thousands of
 * mapped items within a few km):
 *  - `hint:optimizer "None"` makes the query service run the steps in the order written,
 *    instead of guessing. The guess is what timed out: it joined the 47 place kinds first and
 *    then ran the map search once per kind.
 *  - The map search comes first, then the cheap filters (number of Wikipedia editions, kind).
 *  - Only the best `limit` places come out of the inner part; names, descriptions, photos and
 *    articles are looked up for those few, not for every match.
 */

/** Places of the listed kinds within `radiusKm` of a point, most-linked first. */
export function aroundQuery(lat: number, lon: number, radiusKm: number, lang: Lang, limit = 250, minSitelinks = 3): string {
  const r = Math.max(0.5, Math.min(60, radiusKm));
  return `SELECT ?item ?itemLabel ?itemDescription ?lat ?lon ?sitelinks ?class ?image ?article ?cc WHERE {
  hint:Query hint:optimizer "None" .
  {
    SELECT ?item ?class ?sitelinks ?coord WHERE {
      SERVICE wikibase:around {
        ?item wdt:P625 ?coord .
        bd:serviceParam wikibase:center "Point(${lon.toFixed(5)} ${lat.toFixed(5)})"^^geo:wktLiteral .
        bd:serviceParam wikibase:radius "${r}" .
      }
      ?item wikibase:sitelinks ?sitelinks .
      FILTER(?sitelinks >= ${minSitelinks})
      ?item wdt:P31 ?class .
      FILTER(?class IN (${CLASS_LIST}))
      FILTER NOT EXISTS { ?item wdt:P576 ?ended . }
    }
    ORDER BY DESC(?sitelinks)
    LIMIT ${limit}
  }
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://${lang}.wikipedia.org/> . }
  OPTIONAL { ?item wdt:P17 ?country . ?country wdt:P297 ?cc . }
  BIND(geof:latitude(?coord) AS ?lat)
  BIND(geof:longitude(?coord) AS ?lon)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en" . }
}
ORDER BY DESC(?sitelinks)`;
}

/** The best-known places of the listed kinds in one country (for the Europe-wide cache). */
export function countryQuery(countryQid: string, classes: string[], minSitelinks: number, limit: number): string {
  return `SELECT ?item ?itemLabel ?itemDescription ?lat ?lon ?sitelinks ?class ?image ?article WHERE {
  hint:Query hint:optimizer "None" .
  {
    SELECT ?item ?class ?sitelinks ?coord WHERE {
      VALUES ?class { ${classes.map((q) => `wd:${q}`).join(' ')} }
      ?item wdt:P31 ?class .
      ?item wdt:P17 wd:${countryQid} .
      ?item wikibase:sitelinks ?sitelinks .
      FILTER(?sitelinks >= ${minSitelinks})
      ?item wdt:P625 ?coord .
      FILTER NOT EXISTS { ?item wdt:P576 ?ended . }
    }
    ORDER BY DESC(?sitelinks)
    LIMIT ${limit}
  }
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  BIND(geof:latitude(?coord) AS ?lat)
  BIND(geof:longitude(?coord) AS ?lon)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
ORDER BY DESC(?sitelinks)`;
}

/** Labels in Hebrew and Russian for cached places (the cache is built in English). */
export function labelsQuery(qids: string[]): string {
  return `SELECT ?item ?he ?ru ?heArticle ?ruArticle WHERE {
  VALUES ?item { ${qids.map((q) => `wd:${q}`).join(' ')} }
  OPTIONAL { ?item rdfs:label ?he . FILTER(LANG(?he) = "he") }
  OPTIONAL { ?item rdfs:label ?ru . FILTER(LANG(?ru) = "ru") }
  OPTIONAL { ?heArticle schema:about ?item ; schema:isPartOf <https://he.wikipedia.org/> . }
  OPTIONAL { ?ruArticle schema:about ?item ; schema:isPartOf <https://ru.wikipedia.org/> . }
}`;
}

/* ---------------- SPARQL JSON results ---------------- */

interface Binding {
  [name: string]: { type: string; value: string; 'xml:lang'?: string; datatype?: string } | undefined;
}
export interface SparqlJson {
  results?: { bindings?: Binding[] };
}

/** One place as read from Wikidata (before it becomes an attraction). */
export interface WdPlace {
  qid: string;
  name: string;
  description: string;
  lat: number;
  lon: number;
  sitelinks: number;
  kind: Kind;
  /** Commons file name (without "File:"), when the item has a photo. */
  imageFile?: string;
  /** Wikipedia article in the requested language, else none. */
  article?: string;
  country?: string;
  /** Hebrew / Russian names and articles (filled for the cache). */
  names?: Partial<Record<Lang, string>>;
  articles?: Partial<Record<Lang, string>>;
}

const qidOf = (uri?: string) => (uri ? uri.slice(uri.lastIndexOf('/') + 1) : '');
const isQid = (s: string) => /^Q\d+$/.test(s);

/** Commons file name from a P18 value (a Special:FilePath URL). */
export function commonsFile(p18?: string): string | undefined {
  if (!p18) return undefined;
  const raw = p18.slice(p18.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(raw).replace(/_/g, ' ');
  } catch {
    return raw.replace(/_/g, ' ');
  }
}

/** Rows → places: one per item (its most specific class wins), unnamed or unplaced items dropped. */
export function parsePlaces(j: SparqlJson): WdPlace[] {
  const byId = new Map<string, WdPlace & { rank: number }>();
  for (const b of j.results?.bindings ?? []) {
    const qid = qidOf(b.item?.value);
    const name = b.itemLabel?.value?.trim() ?? '';
    const lat = Number(b.lat?.value);
    const lon = Number(b.lon?.value);
    if (!qid || !name || isQid(name) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const cls = qidOf(b.class?.value);
    const rank = classRank(cls);
    const prev = byId.get(qid);
    if (prev && prev.rank <= rank) {
      // Keep the first photo / article seen, fill gaps.
      prev.imageFile ??= commonsFile(b.image?.value);
      prev.article ??= b.article?.value;
      continue;
    }
    byId.set(qid, {
      qid,
      name,
      description: b.itemDescription?.value?.trim() ?? '',
      lat,
      lon,
      sitelinks: Number(b.sitelinks?.value) || 0,
      kind: kindOfClass(cls),
      imageFile: prev?.imageFile ?? commonsFile(b.image?.value),
      article: prev?.article ?? b.article?.value,
      country: b.cc?.value ?? prev?.country,
      rank,
    });
  }
  return [...byId.values()].map(({ rank: _rank, ...p }) => p).sort((a, b) => b.sitelinks - a.sitelinks);
}

/**
 * Popularity on a 0–10 scale from the number of Wikipedia editions covering the place:
 * 5 + 2.2·log10(sitelinks + 1), capped at 10. ≈ 9.0 from ~65 editions (world-famous: Plitvice,
 * Charles Bridge), ≈ 7.0 from ~7 editions (well known in its country), ≈ 6.3 for 3.
 */
export function popularityFromSitelinks(n: number): number {
  const p = 5 + 2.2 * Math.log10(Math.max(0, n) + 1);
  return Math.round(Math.min(10, p) * 10) / 10;
}

/** A Commons photo, resized by Commons itself. */
export const commonsImageUrl = (file: string, width = 960) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=${width}`;
export const commonsPage = (file: string) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`;

/** Photo credit: author and licence from Commons (filled when known), always linking to the file page. */
export interface PhotoCredit {
  artist?: string;
  license?: string;
}

/** Visit length by kind (minutes). */
export const VISIT: Partial<Record<Kind, number>> = {
  nationalpark: 240, reserve: 150, themepark: 240, zoo: 180, aquarium: 120, museum: 120, gallery: 100,
  castle: 120, palace: 120, fortress: 90, ruins: 90, cave: 90, canyon: 150, waterfall: 75, lake: 90,
  beach: 120, park: 75, garden: 75, oldtown: 90, church: 40, monastery: 60, synagogue: 40, mosque: 40,
  bridge: 30, square: 30, tower: 45, monument: 30, viewpoint: 30, theatre: 60, market: 60,
};
export const visitMinutesFor = (kind: Kind | undefined): number => (kind && VISIT[kind]) || 60;

/** A Wikidata place as Firefly's attraction JSON (same shape as Tripadvisor's). */
export function wdToAttraction(p: WdPlace, lang: Lang, credit?: PhotoCredit) {
  const name = p.names?.[lang] || p.name;
  const article = p.articles?.[lang] || p.article || p.articles?.en;
  const link = article ?? `https://www.wikidata.org/wiki/${p.qid}`;
  const photo = p.imageFile ? commonsImageUrl(p.imageFile) : undefined;
  const creditText = [credit?.artist, credit?.license, 'Wikimedia Commons'].filter(Boolean).join(' · ');
  return {
    id: `wd-${p.qid}`,
    name,
    description: p.description ? p.description.charAt(0).toUpperCase() + p.description.slice(1) : '',
    types: KIND_TYPES[p.kind],
    country: p.country ?? '',
    price: null,
    link,
    photo_urls: photo ? [photo] : [],
    photoSources: photo ? [{ url: photo, sourcePage: commonsPage(p.imageFile!), credit: creditText }] : [],
    location: { locLat: p.lat, locLon: p.lon },
    openingHours: [] as string[],
    rating: undefined,
    numReviews: undefined,
    provider: 'wikidata' as const,
    category: p.kind,
    kind: p.kind,
    popularity: popularityFromSitelinks(p.sitelinks),
    suggestedMinutes: VISIT[p.kind] ?? 60,
    address: '',
    website: '',
    wikidataId: p.qid,
  };
}

/* ---------------- Commons photo credits ---------------- */

/** Commons API URL for the authors and licences of up to 50 files. */
export function commonsCreditsUrl(files: string[]): string {
  const titles = files.slice(0, 50).map((f) => `File:${f}`).join('|');
  const p = new URLSearchParams({ action: 'query', titles, prop: 'imageinfo', iiprop: 'extmetadata', format: 'json', formatversion: '2', origin: '*' });
  return `https://commons.wikimedia.org/w/api.php?${p}`;
}

const stripHtml = (s: string) =>
  s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/\s+/g, ' ').trim();

export interface CommonsInfo {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    pages?: Array<{ title: string; imageinfo?: Array<{ extmetadata?: Record<string, { value?: string }> }> }>;
  };
}

/** File name → author and licence. */
export function parseCommonsCredits(j: CommonsInfo): Map<string, PhotoCredit> {
  const out = new Map<string, PhotoCredit>();
  const back = new Map((j.query?.normalized ?? []).map((n) => [n.to, n.from]));
  for (const page of j.query?.pages ?? []) {
    const meta = page.imageinfo?.[0]?.extmetadata ?? {};
    const artist = stripHtml(meta.Artist?.value ?? '').slice(0, 80);
    const license = stripHtml(meta.LicenseShortName?.value ?? '');
    const title = back.get(page.title) ?? page.title;
    const file = title.replace(/^File:/, '').replace(/_/g, ' ');
    out.set(file, { artist: artist || undefined, license: license || undefined });
  }
  return out;
}
