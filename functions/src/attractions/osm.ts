/**
 * OpenStreetMap (Overpass API) — the free, keyless backup for restaurants when Tripadvisor is
 * busy or out of quota. Data © OpenStreetMap contributors (ODbL); each restaurant links to its
 * own website, or to its OpenStreetMap page. Pure (no Firebase), unit-tested.
 */

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export type Lang = 'en' | 'he' | 'ru';

/** Named restaurants and cafés within `radiusKm` of a point. */
export function restaurantsQuery(lat: number, lon: number, radiusKm: number, limit = 80): string {
  const m = Math.round(Math.max(0.3, Math.min(5, radiusKm)) * 1000);
  const around = `(around:${m},${lat.toFixed(5)},${lon.toFixed(5)})`;
  return `[out:json][timeout:20];
(
  node["amenity"~"^(restaurant|cafe)$"]["name"]${around};
  way["amenity"~"^(restaurant|cafe)$"]["name"]${around};
);
out center tags ${limit};`;
}

export interface OverpassJson {
  elements?: Array<{
    type: 'node' | 'way' | 'relation';
    id: number;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
  }>;
}

/** OSM elements → Firefly's restaurant JSON; better-described places first. */
export function osmRestaurants(j: OverpassJson, lang: Lang) {
  const list = (j.elements ?? [])
    .map((e) => {
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      const t = e.tags ?? {};
      const name = t[`name:${lang}`] || t.name;
      if (!name || lat == null || lon == null) return null;
      if (t.disused === 'yes' || t['disused:amenity']) return null;
      const page = t.website || t['contact:website'] || `https://www.openstreetmap.org/${e.type}/${e.id}`;
      const cuisine = (t.cuisine ?? '')
        .split(';')
        .map((c) => c.trim().replace(/_/g, ' '))
        .filter(Boolean)
        .slice(0, 3);
      // Places with a website, cuisine and opening hours on the map are usually established ones.
      const detail = Number(!!(t.website || t['contact:website'])) + Number(!!t.cuisine) + Number(!!t.opening_hours) + Number(t.amenity === 'restaurant');
      return {
        detail,
        r: {
          id: `osm-${e.type}-${e.id}`,
          name,
          description: cuisine.join(', '),
          photos: [] as string[],
          photoSources: [] as Array<{ url: string; sourcePage: string; credit: string }>,
          linkToPage: page,
          location: { locLat: lat, locLon: lon },
          openingHours: [] as string[],
          cuisine,
          priceLevel: '',
          rating: undefined as number | undefined,
          source: 'openstreetmap' as const,
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  return list.sort((a, b) => b.detail - a.detail).map((x) => x.r);
}

/* ---------------- sights (backup when Tripadvisor and Wikidata's map search fail) ---------------- */

/**
 * Notable sights around a point: OpenStreetMap features that carry a Wikidata link (so they can
 * be checked and ranked by how many Wikipedias cover them). Used when Tripadvisor is busy or out
 * of quota and Wikidata's own map search doesn't answer.
 */
export function sightsQuery(lat: number, lon: number, radiusKm: number, limit = 500): string {
  const m = Math.round(Math.max(0.5, Math.min(20, radiusKm)) * 1000);
  const a = `(around:${m},${lat.toFixed(5)},${lon.toFixed(5)})`;
  return `[out:json][timeout:25];
(
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|aquarium|theme_park)$"]["wikidata"]${a};
  nwr["historic"~"^(castle|fort|fortress|monument|memorial|ruins|archaeological_site|city_gate|palace|manor|monastery|tower|church)$"]["wikidata"]${a};
  nwr["leisure"~"^(park|garden|nature_reserve|water_park)$"]["wikidata"]${a};
  nwr["amenity"="place_of_worship"]["wikidata"]["heritage"]${a};
  nwr["building"~"^(cathedral|synagogue|mosque)$"]["wikidata"]${a};
  nwr["natural"~"^(waterfall|cave_entrance|beach)$"]["wikidata"]${a};
  nwr["man_made"~"^(tower|bridge|lighthouse)$"]["wikidata"]${a};
  way["bridge"="yes"]["wikidata"]["name"]${a};
  nwr["place"="square"]["wikidata"]${a};
);
out center tags ${limit};`;
}

export type OsmKind =
  | 'castle' | 'palace' | 'fortress' | 'ruins' | 'monument' | 'square' | 'bridge' | 'tower' | 'museum' | 'gallery' | 'church'
  | 'monastery' | 'synagogue' | 'mosque' | 'reserve' | 'park' | 'garden' | 'waterfall' | 'cave' | 'beach' | 'viewpoint' | 'zoo'
  | 'aquarium' | 'themepark' | 'other';

/** The kind of sight an OSM feature is, from its tags. */
export function osmKind(t: Record<string, string>): OsmKind {
  const tourism = t.tourism ?? '';
  const historic = t.historic ?? '';
  const religion = t.religion ?? '';
  const worship = t.amenity === 'place_of_worship' || ['cathedral', 'synagogue', 'mosque', 'church'].includes(t.building ?? '') || historic === 'church';
  if (tourism === 'museum') return 'museum';
  if (tourism === 'gallery') return 'gallery';
  if (tourism === 'zoo') return 'zoo';
  if (tourism === 'aquarium') return 'aquarium';
  if (tourism === 'theme_park' || t.leisure === 'water_park') return 'themepark';
  if (historic === 'castle') return t.castle_type === 'palace' || t.castle_type === 'stately' ? 'palace' : 'castle';
  if (historic === 'palace' || historic === 'manor') return 'palace';
  if (historic === 'fort' || historic === 'fortress') return 'fortress';
  if (historic === 'ruins' || historic === 'archaeological_site') return 'ruins';
  if (historic === 'monastery') return 'monastery';
  if (worship) return religion === 'jewish' || t.building === 'synagogue' ? 'synagogue' : religion === 'muslim' || t.building === 'mosque' ? 'mosque' : 'church';
  if (historic === 'monument' || historic === 'memorial' || historic === 'city_gate') return 'monument';
  if (historic === 'tower' || t.man_made === 'tower' || t.man_made === 'lighthouse') return 'tower';
  if (t.man_made === 'bridge' || t.bridge === 'yes') return 'bridge';
  if (t.place === 'square') return 'square';
  if (t.leisure === 'nature_reserve') return 'reserve';
  if (t.leisure === 'garden') return 'garden';
  if (t.leisure === 'park') return 'park';
  if (t.natural === 'waterfall') return 'waterfall';
  if (t.natural === 'cave_entrance') return 'cave';
  if (t.natural === 'beach') return 'beach';
  if (tourism === 'viewpoint') return 'viewpoint';
  return 'other';
}

export interface OsmSight {
  qid: string;
  name: string;
  names: Partial<Record<Lang, string>>;
  lat: number;
  lon: number;
  kind: OsmKind;
  /** Commons file name from the map's own image tags, if any. */
  imageFile?: string;
  osm: string;
  /** The map's opening hours, when written in a form we can read. */
  hours?: Array<Array<{ open: number; close: number }>>;
}

/** OSM features → one sight per Wikidata item (the first named feature wins). */
export function osmSights(j: OverpassJson): OsmSight[] {
  const byQid = new Map<string, OsmSight>();
  for (const e of j.elements ?? []) {
    const t = e.tags ?? {};
    const qid = (t.wikidata ?? '').split(';')[0].trim();
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (!/^Q\d+$/.test(qid) || !t.name || lat == null || lon == null || byQid.has(qid)) continue;
    if (t.disused === 'yes' || t.abandoned === 'yes' || t['demolished:building']) continue;
    const commons = (t.wikimedia_commons ?? '').startsWith('File:') ? t.wikimedia_commons.slice(5) : undefined;
    byQid.set(qid, {
      qid,
      name: t.name,
      names: { en: t['name:en'], he: t['name:he'], ru: t['name:ru'] },
      lat,
      lon,
      kind: osmKind(t),
      imageFile: commons,
      osm: `https://www.openstreetmap.org/${e.type}/${e.id}`,
      hours: parseOpeningHours(t.opening_hours),
    });
  }
  return [...byQid.values()];
}

/**
 * Which of these Wikidata items are people, families, dynasties or deities. On the map a tomb or
 * a statue is sometimes linked to the person it honours instead of the monument itself, and the
 * sight would then be planned as "Abdallah of Morocco".
 */
export function peopleQuery(qids: string[]): string {
  const items = qids.filter((q) => /^Q\d+$/.test(q)).map((q) => `wd:${q}`).join(' ');
  return `SELECT DISTINCT ?item WHERE {
  VALUES ?item { ${items} }
  VALUES ?class { wd:Q5 wd:Q15632617 wd:Q8436 wd:Q164950 wd:Q178885 }
  ?item wdt:P31 ?class .
}`;
}

/** Q-ids in a SPARQL answer's ?item column. */
export function readQids(j: { results?: { bindings?: Array<{ item?: { value?: string } }> } }): Set<string> {
  const out = new Set<string>();
  for (const b of j.results?.bindings ?? []) {
    const m = /(Q\d+)$/.exec(b.item?.value ?? '');
    if (m) out.add(m[1]);
  }
  return out;
}

/* ---- Wikidata's own API (not the query service): how known each place is, and its names ---- */

export const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

export function entitiesUrl(qids: string[]): string {
  const p = new URLSearchParams({
    action: 'wbgetentities',
    ids: qids.slice(0, 50).join('|'),
    props: 'sitelinks|labels|descriptions',
    languages: 'en|he|ru',
    format: 'json',
    origin: '*',
  });
  return `${WIKIDATA_API}?${p}`;
}

export interface EntitiesJson {
  entities?: Record<
    string,
    {
      id?: string;
      missing?: string;
      labels?: Record<string, { value: string }>;
      descriptions?: Record<string, { value: string }>;
      sitelinks?: Record<string, { title: string }>;
    }
  >;
}

export interface EntityInfo {
  sitelinks: number;
  labels: Partial<Record<Lang, string>>;
  description: string;
  /** Wikipedia article titles by language. */
  articles: Partial<Record<Lang, string>>;
}

export function readEntities(j: EntitiesJson): Map<string, EntityInfo> {
  const out = new Map<string, EntityInfo>();
  for (const [qid, e] of Object.entries(j.entities ?? {})) {
    if (!e || e.missing !== undefined) continue;
    const links = e.sitelinks ?? {};
    // Wikipedias only (not Commons, Wikivoyage, Wikisource…).
    const wikipedias = Object.keys(links).filter((k) => /^[a-z_]+wiki$/.test(k) && !['commonswiki', 'specieswiki', 'metawiki', 'wikidatawiki'].includes(k));
    out.set(qid, {
      sitelinks: wikipedias.length,
      labels: { en: e.labels?.en?.value, he: e.labels?.he?.value, ru: e.labels?.ru?.value },
      description: e.descriptions?.en?.value ?? '',
      articles: { en: links.enwiki?.title, he: links.hewiki?.title, ru: links.ruwiki?.title },
    });
  }
  return out;
}

/** Lead photos of English Wikipedia articles (up to 50 titles per request). */
export function pageImagesUrl(titles: string[]): string {
  const p = new URLSearchParams({ action: 'query', prop: 'pageimages', piprop: 'name', titles: titles.slice(0, 50).join('|'), format: 'json', formatversion: '2', redirects: '1', origin: '*' });
  return `https://en.wikipedia.org/w/api.php?${p}`;
}

export interface PageImagesJson {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
    pages?: Array<{ title: string; pageimage?: string; missing?: boolean }>;
  };
}

/** Article title (as asked) → its lead photo's file name (photos only: JPEG). */
export function readPageImages(j: PageImagesJson): Map<string, string> {
  const back = new Map<string, string>();
  for (const n of [...(j.query?.normalized ?? []), ...(j.query?.redirects ?? [])]) back.set(n.to, back.get(n.from) ?? n.from);
  const out = new Map<string, string>();
  for (const p of j.query?.pages ?? []) {
    if (!p.pageimage || !/\.jpe?g$/i.test(p.pageimage)) continue;
    const file = p.pageimage.replace(/_/g, ' ');
    out.set(p.title, file);
    const asked = back.get(p.title);
    if (asked) out.set(asked, file);
  }
  return out;
}

/* ---------------- opening hours on the map (the "opening_hours" tag) ---------------- */

const OSM_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * The common forms of OpenStreetMap's opening_hours ("Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su off",
 * "Tu-Su 10:00-18:00", "24/7", "09:00-18:00") → a week (index 0 = Sunday). Anything with months,
 * dates, holidays-only rules, sunrise/sunset or comments returns undefined: unknown is better
 * than wrong.
 */
export function parseOpeningHours(raw: string | undefined): Array<Array<{ open: number; close: number }>> | undefined {
  const text = (raw ?? '').trim();
  if (!text) return undefined;
  if (/^24\/7$/.test(text)) return Array.from({ length: 7 }, () => [{ open: 0, close: 1440 }]);
  const week: Array<Array<{ open: number; close: number }> | null> = [null, null, null, null, null, null, null];
  for (const ruleRaw of text.split(';')) {
    const rule = ruleRaw.trim();
    if (!rule) continue;
    if (/^PH\b/.test(rule) || /^SH\b/.test(rule)) continue; // public / school holidays: not a weekday rule
    const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?(?:,PH)?\s*(.*)$/);
    if (!m) return undefined;
    const days = m[1] ? expandDays(m[1]) : [0, 1, 2, 3, 4, 5, 6];
    const rest = m[2].trim();
    if (/^(off|closed)$/i.test(rest)) {
      days.forEach((d) => (week[d] = []));
      continue;
    }
    const spans: Array<{ open: number; close: number }> = [];
    for (const part of rest.split(',')) {
      const t = part.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})\+?$/);
      if (!t) return undefined;
      const open = Number(t[1]) * 60 + Number(t[2]);
      let close = Number(t[3]) * 60 + Number(t[4]);
      if (close <= open) close += 1440;
      spans.push({ open, close });
    }
    if (!spans.length) return undefined;
    days.forEach((d) => (week[d] = spans));
  }
  if (week.every((d) => d === null)) return undefined;
  // Days a rule set doesn't mention are closed (OSM's meaning).
  return week.map((d) => d ?? []);
}

function expandDays(spec: string): number[] {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-');
    const from = OSM_DAYS.indexOf(a);
    const to = b ? OSM_DAYS.indexOf(b) : from;
    // Mo=1 … Su=0: walk forward through the week, wrapping (Fr-Mo = Fr, Sa, Su, Mo).
    for (let d = from, i = 0; i < 7; d = (d + 1) % 7, i++) {
      out.add(d);
      if (d === to) break;
    }
  }
  return [...out];
}

/* ---------------- sights without a Wikidata link (quiet areas only) ---------------- */

/** Named sights within `radiusKm`, with or without a Wikidata link — for the countryside, where few have one. */
export function localSightsQuery(lat: number, lon: number, radiusKm: number, limit = 300): string {
  const m = Math.round(Math.max(1, Math.min(50, radiusKm)) * 1000);
  const a = `(around:${m},${lat.toFixed(5)},${lon.toFixed(5)})`;
  return `[out:json][timeout:25];
(
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|aquarium|theme_park)$"]["name"]${a};
  nwr["historic"~"^(castle|fort|fortress|ruins|archaeological_site|monastery|city_gate|palace|manor)$"]["name"]${a};
  nwr["leisure"~"^(nature_reserve|water_park)$"]["name"]${a};
  nwr["natural"~"^(waterfall|cave_entrance|beach|spring)$"]["name"]${a};
  nwr["boundary"="national_park"]["name"]${a};
);
out center tags ${limit};`;
}

export interface LocalSight {
  id: string;
  name: string;
  names: Partial<Record<Lang, string>>;
  lat: number;
  lon: number;
  kind: OsmKind;
  qid?: string;
  /** 6.0–7.4: how well described the place is on the map (website, Wikipedia, hours, photo). */
  popularity: number;
  website?: string;
  wikipedia?: string;
  imageFile?: string;
  hours?: Array<Array<{ open: number; close: number }>>;
  description: string;
  page: string;
}

/** Map features → sights, best described first. */
export function localSights(j: OverpassJson): LocalSight[] {
  const out: LocalSight[] = [];
  const seen = new Set<string>();
  for (const e of j.elements ?? []) {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (!t.name || lat == null || lon == null) continue;
    if (t.disused === 'yes' || t.abandoned === 'yes' || t.access === 'private' || t.access === 'no') continue;
    const key = `${t.name.toLowerCase()}|${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const kind: OsmKind = t.boundary === 'national_park' ? 'reserve' : t.natural === 'spring' ? 'waterfall' : osmKind(t);
    const website = t.website || t['contact:website'];
    const wikipedia = t.wikipedia;
    const hours = parseOpeningHours(t.opening_hours);
    const imageFile = (t.wikimedia_commons ?? '').startsWith('File:') ? t.wikimedia_commons.slice(5) : undefined;
    const detail = Number(!!website) + Number(!!wikipedia) * 1.5 + Number(!!t.opening_hours) * 0.5 + Number(!!imageFile) + Number(!!t.wikidata) + Number(!!t.description);
    out.push({
      id: `osm-${e.type}-${e.id}`,
      name: t.name,
      names: { en: t['name:en'], he: t['name:he'], ru: t['name:ru'] },
      lat,
      lon,
      kind,
      qid: /^Q\d+$/.test(t.wikidata ?? '') ? t.wikidata : undefined,
      popularity: Math.round(Math.min(7.4, 6.0 + detail * 0.25) * 10) / 10,
      website,
      wikipedia,
      imageFile,
      hours,
      description: (t.description ?? '').slice(0, 300),
      page: website || `https://www.openstreetmap.org/${e.type}/${e.id}`,
    });
  }
  return out.sort((a, b) => b.popularity - a.popularity);
}
