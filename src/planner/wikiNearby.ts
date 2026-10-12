import { Attraction, AI_IMAGE, AttractionKind, KIND_TYPES, Location, isEventDescription, isPersonDescription } from '../models';

/**
 * The phone's own last resort for sights: Wikipedia articles with coordinates around a place,
 * asked straight from the phone (no server, no key). Used when the server can't answer or finds
 * almost nothing, so a trip still has its real sights. Only articles about places to visit are
 * kept (museums, parks, churches, ruins, beaches…, from the article's short description), ranked
 * by how often the article was read in the last 30 days. Pure (URLs and parsing), unit-tested.
 */

export type WikiLang = 'en' | 'he' | 'ru';

/** A query string (React Native's URLSearchParams is incomplete, so built by hand). */
const query = (params: Record<string, string>) =>
  Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

/** Step 1: articles with coordinates within `radiusKm` (Wikipedia allows 10 km at most). */
export function geosearchUrl(lat: number, lon: number, radiusKm = 10, limit = 200): string {
  return `https://en.wikipedia.org/w/api.php?${query({
    action: 'query',
    list: 'geosearch',
    gscoord: `${lat.toFixed(5)}|${lon.toFixed(5)}`,
    gsradius: String(Math.round(Math.max(1, Math.min(10, radiusKm)) * 1000)),
    gslimit: String(Math.min(500, limit)),
    gsprop: 'type',
    format: 'json',
    formatversion: '2',
    origin: '*',
  })}`;
}

export interface GeoHit {
  pageid: number;
  title: string;
  lat: number;
  lon: number;
  dist?: number;
  type?: string;
}

/** Coordinate types that are never a sight (cities, regions, stations, schools…). */
const NOT_SIGHT_TYPES = new Set(['city', 'adm1st', 'adm2nd', 'adm3rd', 'country', 'railwaystation', 'airport', 'edu', 'event', 'satellite']);

export function readGeosearch(j: { query?: { geosearch?: GeoHit[] } }): GeoHit[] {
  return (j.query?.geosearch ?? []).filter((h) => !h.type || !NOT_SIGHT_TYPES.has(h.type));
}

/** Step 2: what each article is (short description), its photo, Wikidata item, readers and name in the trip's language. */
export function detailsUrl(pageids: number[], lang: WikiLang): string {
  return `https://en.wikipedia.org/w/api.php?${query({
    action: 'query',
    pageids: pageids.slice(0, 50).join('|'),
    prop: lang === 'en' ? 'description|pageimages|pageprops|pageviews' : 'description|pageimages|pageprops|pageviews|langlinks',
    piprop: 'thumbnail|name',
    pithumbsize: '800',
    pilicense: 'free',
    ppprop: 'wikibase_item|disambiguation',
    pvipdays: '30',
    ...(lang === 'en' ? {} : { lllang: lang, lllimit: 'max' }),
    format: 'json',
    formatversion: '2',
    origin: '*',
  })}`;
}

export interface WikiPage {
  pageid: number;
  title: string;
  description?: string;
  thumbnail?: { source: string };
  pageimage?: string;
  pageprops?: { wikibase_item?: string; disambiguation?: string };
  pageviews?: Record<string, number | null>;
  langlinks?: Array<{ lang: string; title: string }>;
}

/** Not a place to visit, whatever else the description says. */
const NOT_A_SIGHT =
  /neighbo|district|suburb|quarter of|street|road|highway|interchange|junction|railway|station|airport|port of|university|college|school|hospital|medical cent|company|corporation|\bbank\b|hotel|stadium|arena|sports|kibbutz|moshav|village|town in|city in|municipality|council|settlement|military|army|air base|naval|prison|shopping|\bmall\b|office|residential|skyscraper|high-rise|power station|factory|industrial|court\b|embassy|consulate|ministry|government|police|politician|businessman|footballer|singer|actor|writer|television|newspaper|radio|band\b|album|film|song|club\b|association|organi[sz]ation|cemetery/i;

const WIKI_KINDS: Array<[RegExp, AttractionKind]> = [
  [/national park/i, 'nationalpark'],
  [/nature reserve|natural reserve|wildlife reserve|\breserve\b|conservation (area|centre|center)|sacred (grove|forest)|forest reserve|national forest/i, 'reserve'],
  [/\bbeach/i, 'beach'],
  [/waterfall|\bspring\b/i, 'waterfall'],
  [/\bcave|grotto/i, 'cave'],
  [/crater|makhtesh|canyon|gorge/i, 'canyon'],
  [/\bzoo\b|safari|wildlife park/i, 'zoo'],
  [/aquarium|underwater observatory/i, 'aquarium'],
  [/theme park|amusement park|water park/i, 'themepark'],
  [/castle/i, 'castle'],
  [/palace/i, 'palace'],
  [/fortress|citadel|crusader|\bfort\b/i, 'fortress'],
  [/archaeolog|ruins|ancient (city|town|village|site)|\btel\b|\btell\b|historic site/i, 'ruins'],
  [/art museum|art gallery|gallery/i, 'gallery'],
  [/(cultural|arts?|heritage) (centre|center)/i, 'museum'],
  [/museum/i, 'museum'],
  [/synagogue/i, 'synagogue'],
  [/mosque/i, 'mosque'],
  [/monastery|abbey|convent/i, 'monastery'],
  [/church|cathedral|basilica|chapel|shrine/i, 'church'],
  [/theat(re|er)|opera house|concert hall/i, 'theatre'],
  [/market|bazaar|souk|shuk/i, 'market'],
  [/garden/i, 'garden'],
  [/\bpark\b/i, 'park'],
  [/observation|viewpoint|lookout|promenade/i, 'viewpoint'],
  [/lighthouse|\btower\b/i, 'tower'],
  [/bridge/i, 'bridge'],
  [/old city|old town|historic (centre|center|quarter)/i, 'oldtown'],
  [/\bsquare\b|plaza/i, 'square'],
  [/monument|memorial|statue|mausoleum|\btomb\b/i, 'monument'],
  [/\blake\b|reservoir|lagoon/i, 'lake'],
  [/\bmount(ain)?\b(?! range)/i, 'viewpoint'],
];

/** Kinds that make an article a sight even when its description also says "naval", "village"… */
const STRONG: ReadonlySet<AttractionKind> = new Set<AttractionKind>([
  'nationalpark', 'reserve', 'beach', 'waterfall', 'cave', 'canyon', 'zoo', 'aquarium', 'themepark', 'castle', 'palace', 'fortress',
  'ruins', 'gallery', 'museum', 'synagogue', 'mosque', 'monastery', 'church',
]);

/** What kind of sight an article is about, from its short description (and title), or null. */
export function wikiKind(description: string, title: string): AttractionKind | null {
  const d = description.trim();
  if (!d) {
    // No description: only titles that say it plainly ("Hecht Museum", "Stella Maris Monastery").
    if (NOT_A_SIGHT.test(title) || isEventDescription('', title)) return null;
    for (const [re, k] of WIKI_KINDS) if (STRONG.has(k) && re.test(title)) return k;
    return null;
  }
  for (const [re, k] of WIKI_KINDS) if (STRONG.has(k) && re.test(d)) return k; // "Naval museum in Haifa"
  if (NOT_A_SIGHT.test(d)) return null; // "Neighbourhood of Haifa", "University in Haifa"
  if (isPersonDescription(d)) return null; // "Sultan of Morocco six times from 1729 to 1757"
  if (isEventDescription(d, title)) return null; // "2010 Mount Carmel forest fire"
  for (const [re, k] of WIKI_KINDS) if (re.test(d) || re.test(title)) return k;
  return null;
}

/** 0–10 from readers in the last 30 days: ~1,000 → 7.6, ~20,000 → 9.2 (capped 5.0–9.6). */
export function popularityFromViews(views: number): number {
  const p = 4 + 1.2 * Math.log10(Math.max(0, views) + 1);
  return Math.round(Math.min(9.6, Math.max(5, p)) * 10) / 10;
}

const VISIT: Partial<Record<AttractionKind, number>> = {
  nationalpark: 240, reserve: 150, themepark: 240, zoo: 180, aquarium: 120, museum: 120, gallery: 100, castle: 120, palace: 120,
  fortress: 90, ruins: 90, cave: 90, canyon: 150, waterfall: 75, lake: 90, beach: 120, park: 75, garden: 75, oldtown: 90,
  church: 40, monastery: 60, synagogue: 40, mosque: 40, bridge: 30, square: 30, tower: 45, monument: 30, viewpoint: 30, theatre: 60, market: 60,
};

const articleUrl = (wiki: string, title: string) => `https://${wiki}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

/** Articles → attractions (same shape as the server's), best known first. */
export function wikiAttractions(hits: GeoHit[], pages: WikiPage[], lang: WikiLang): Attraction[] {
  const byId = new Map(pages.map((p) => [p.pageid, p]));
  const out: Attraction[] = [];
  for (const h of hits) {
    const p = byId.get(h.pageid);
    if (!p || p.pageprops?.disambiguation !== undefined) continue;
    const kind = wikiKind(p.description ?? '', p.title);
    if (!kind) continue;
    const local = p.langlinks?.find((l) => l.lang === lang)?.title;
    const name = (local ?? p.title).replace(/\s*\([^)]*\)$/, '');
    const views = Object.values(p.pageviews ?? {}).reduce<number>((s, v) => s + (v ?? 0), 0);
    const qid = p.pageprops?.wikibase_item;
    const photo = p.thumbnail?.source && p.pageimage && /\.jpe?g$/i.test(p.pageimage) && !AI_IMAGE.test(p.pageimage) ? p.thumbnail.source : undefined;
    const link = local ? articleUrl(lang, local) : articleUrl('en', p.title);
    const desc = p.description ? p.description.charAt(0).toUpperCase() + p.description.slice(1) : '';
    const a = new Attraction(
      qid ? `wd-${qid}` : `wp-en-${p.pageid}`,
      name,
      desc,
      KIND_TYPES[kind],
      '',
      null,
      link,
      photo ? [photo] : [],
      new Location(h.lat, h.lon),
      [],
      photo ? [{ url: photo, sourcePage: `https://en.wikipedia.org/wiki/File:${encodeURIComponent(p.pageimage!.replace(/ /g, '_'))}`, credit: 'Wikipedia / Wikimedia Commons' }] : [],
      undefined,
      undefined,
      undefined,
      kind,
      VISIT[kind] ?? 60,
    );
    a.kind = kind;
    a.provider = 'wikidata';
    a.wikidataId = qid ?? '';
    a.popularity = views ? popularityFromViews(views) : 6.5;
    a.descriptionSource = 'wikipedia';
    out.push(a);
  }
  return out.sort((x, y) => (y.popularity ?? 0) - (x.popularity ?? 0));
}
