import { WIKIDATA_CLASSES } from './kinds';
import { EUROPE_CITIES } from './europeCities';
import { CACHE_TARGET, selectForCache } from './merge';
import {
  CommonsInfo,
  PhotoCredit,
  SparqlJson,
  WdPlace,
  aroundQuery,
  commonsCreditsUrl,
  countryQuery,
  labelsQuery,
  parseCommonsCredits,
  parsePlaces,
} from './wikidata';

/**
 * Builds the Europe-wide backup list of ~5,000 attractions from Wikidata, spread out so big cities
 * don't take all the room, a quarter of them nature. Every entry keeps its Wikidata id, Wikipedia
 * article and photo credit, so it can be checked.
 *
 * Two kinds of searches:
 *  - around every city of 150,000+ people (and the famous tourist towns): Wikidata's map search,
 *    every kind of place (8 km in the 100 biggest cities, which are packed with mapped places;
 *    12 km elsewhere);
 *  - per country, only the rarer nature kinds (national parks, waterfalls, caves, canyons,
 *    beaches, viewpoints, nature reserves) for the places far from any city.
 *
 * Every answer is saved as soon as it arrives (Firestore `attractionSearches`), so the build can be
 * stopped at any time and the next run carries on where it stopped: it only runs the searches that
 * are missing or more than 30 days old. The server refreshes the oldest ones every night, a few at a
 * time (attractions/index.ts), and `npm run attractions:build` does the whole lot from a PC.
 */

/** Wikidata ids of the countries covered. */
export const COUNTRIES: Array<[string, string]> = [
  ['AL', 'Q222'], ['AD', 'Q228'], ['AM', 'Q399'], ['AT', 'Q40'], ['BA', 'Q225'], ['BE', 'Q31'], ['BG', 'Q219'],
  ['BY', 'Q184'], ['CH', 'Q39'], ['CY', 'Q229'], ['CZ', 'Q213'], ['DE', 'Q183'], ['DK', 'Q35'], ['EE', 'Q191'],
  ['ES', 'Q29'], ['FI', 'Q33'], ['FR', 'Q142'], ['GB', 'Q145'], ['GE', 'Q230'], ['GR', 'Q41'], ['HR', 'Q224'],
  ['HU', 'Q28'], ['IE', 'Q27'], ['IL', 'Q801'], ['IS', 'Q189'], ['IT', 'Q38'], ['LI', 'Q347'], ['LT', 'Q37'],
  ['LU', 'Q32'], ['LV', 'Q211'], ['MC', 'Q235'], ['MD', 'Q217'], ['ME', 'Q236'], ['MK', 'Q221'], ['MT', 'Q233'],
  ['NL', 'Q55'], ['NO', 'Q20'], ['PL', 'Q36'], ['PT', 'Q45'], ['RO', 'Q218'], ['RS', 'Q403'], ['SE', 'Q34'],
  ['SI', 'Q215'], ['SK', 'Q214'], ['SM', 'Q238'], ['TR', 'Q43'], ['UA', 'Q212'], ['VA', 'Q237'], ['XK', 'Q1246'],
];

/** Countries with so much nature that they get a longer list. */
const LARGE = new Set(['FR', 'IT', 'DE', 'ES', 'GB', 'GR', 'TR', 'PL', 'AT', 'CH', 'NO', 'SE', 'FI', 'IS', 'HR', 'RO', 'PT', 'IE', 'IL']);

/** Nature kinds searched country by country (rare enough to be quick; lakes and parks are not). */
export function natureClassGroups(): string[][] {
  const pick = (kinds: string[]) => WIKIDATA_CLASSES.filter(([, k]) => kinds.includes(k)).map(([q]) => q);
  return [pick(['nationalpark', 'waterfall', 'cave', 'canyon', 'beach', 'viewpoint']), pick(['reserve'])];
}

/** The biggest cities (the list is sorted by population) get a smaller circle: they are packed. */
const BIG_CITY_RANK = 100;

/** A saved answer is used as it is for this long; after that it is refreshed when there is time. */
export const SEARCH_MAX_AGE_MS = 30 * 24 * 3600_000;

/** After this many searches in a row without an answer, Wikidata is down or busy: stop for now. */
const GIVE_UP_AFTER = 6;

/** Bump when the searches change, so old answers are not mixed with new ones. */
const SEARCH_VERSION = 'v2';

export interface CachedPlace extends WdPlace {
  credit?: PhotoCredit;
}

export interface SavedSearch {
  at: number;
  places: WdPlace[];
}

/** Where each search's answer is kept between runs. */
export interface SearchStore {
  loadAll(): Promise<Map<string, SavedSearch>>;
  save(key: string, value: SavedSearch): Promise<void>;
}

export interface BuildDeps {
  sparql(query: string): Promise<SparqlJson>;
  commons(url: string): Promise<CommonsInfo>;
  log(message: string): void;
  /** Pause between requests (be kind to the free endpoints). */
  pause?(ms: number): Promise<void>;
  /** Saved answers (default: kept in memory for this run only). */
  store?: SearchStore;
  now?(): number;
}

export interface BuildOptions {
  target?: number;
  cities?: Array<[string, string, number, number]>;
  /** Stop starting new searches after this long (the server has 30 minutes per run). */
  budgetMs?: number;
  /** Saved answers older than this are run again (0 = run everything again). */
  maxAgeMs?: number;
  /** When nothing new was found, skip names, photo credits and the selection (nothing to save). */
  onlyIfChanged?: boolean;
}

export interface BuildResult {
  places: CachedPlace[];
  /** Searches in all. */
  total: number;
  /** Answered in this run. */
  ran: number;
  /** Tried in this run without an answer. */
  failed: number;
  /** Still without any answer (not even an old one): the next run tries them first. */
  missing: number;
  /** Oldest answer the list is built from. */
  oldestAt: number;
  /** Anything new in this run. */
  changed: boolean;
}

interface Search {
  key: string;
  label: string;
  /** Tried in order: each next one is lighter, for when the one before times out. */
  queries: string[];
  country: string;
  /** City searches keep the country Wikidata gives; nature searches are per country already. */
  forceCountry: boolean;
}

const at2 = (n: number) => n.toFixed(2);

/** Every search the list is built from, biggest cities first. */
export function plannedSearches(cities: Array<[string, string, number, number]> = EUROPE_CITIES): Search[] {
  const list: Search[] = cities.map(([name, cc, lat, lon], i) => {
    const r = i < BIG_CITY_RANK ? 8 : 12;
    return {
      key: `${SEARCH_VERSION}-city-${cc}-${at2(lat)}_${at2(lon)}`,
      label: name,
      queries: [aroundQuery(lat, lon, r, 'en', 80, 5), aroundQuery(lat, lon, r / 2, 'en', 50, 12), aroundQuery(lat, lon, r / 4, 'en', 30, 25)],
      country: cc,
      forceCountry: false,
    };
  });
  for (const [cc, qid] of COUNTRIES) {
    natureClassGroups().forEach((classes, g) => {
      const limit = LARGE.has(cc) ? 120 : 40;
      list.push({
        key: `${SEARCH_VERSION}-nature-${cc}-${g}`,
        label: `${cc} nature`,
        queries: [countryQuery(qid, classes, 6, limit), countryQuery(qid, classes, 15, limit)],
        country: cc,
        forceCountry: true,
      });
    });
  }
  return list;
}

function memoryStore(): SearchStore {
  const m = new Map<string, SavedSearch>();
  return { loadAll: async () => new Map(m), save: async (k, v) => void m.set(k, v) };
}

/** Saved answers in Firestore (`attractionSearches/{key}`); works with the admin SDK of the app or the functions. */
export interface DocsLike {
  collection(name: string): {
    get(): Promise<{ docs: Array<{ id: string; data(): unknown }> }>;
    doc(id: string): { set(data: Record<string, unknown>): Promise<unknown> };
  };
}
export function firestoreSearchStore(db: DocsLike, collection = 'attractionSearches'): SearchStore {
  return {
    async loadAll() {
      const snap = await db.collection(collection).get();
      const out = new Map<string, SavedSearch>();
      for (const d of snap.docs) {
        const v = d.data() as Partial<SavedSearch> | undefined;
        if (v && typeof v.at === 'number' && Array.isArray(v.places)) out.set(d.id, { at: v.at, places: v.places });
      }
      return out;
    },
    async save(key, value) {
      // JSON round trip: Firestore refuses `undefined` fields.
      await db.collection(collection).doc(key).set(JSON.parse(JSON.stringify(value)) as Record<string, unknown>);
    },
  };
}

const minutes = (ms: number) => Math.max(0, Math.round(ms / 60_000));

export async function buildEuropeCache(deps: BuildDeps, opts: BuildOptions = {}): Promise<BuildResult> {
  const { target = CACHE_TARGET, cities = EUROPE_CITIES, budgetMs = Infinity, maxAgeMs = SEARCH_MAX_AGE_MS, onlyIfChanged = false } = opts;
  const pause = deps.pause ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const store = deps.store ?? memoryStore();
  const started = now();

  const searches = plannedSearches(cities);
  let saved: Map<string, SavedSearch>;
  try {
    saved = await store.loadAll();
  } catch (e) {
    deps.log(`could not read earlier answers (${(e as Error).message}); starting from scratch`);
    saved = new Map();
  }
  const missing = searches.filter((s) => !saved.has(s.key));
  const stale = searches
    .filter((s) => saved.has(s.key) && now() - saved.get(s.key)!.at >= maxAgeMs)
    .sort((a, b) => saved.get(a.key)!.at - saved.get(b.key)!.at);
  const todo = [...missing, ...stale];
  deps.log(`${searches.length} searches: ${searches.length - todo.length} already saved from earlier runs, ${todo.length} to run`);

  let ran = 0;
  let failed = 0;
  let inARow = 0;
  for (let i = 0; i < todo.length; i++) {
    if (now() - started > budgetMs) {
      deps.log(`time is up for this run: ${todo.length - i} searches left for the next one`);
      break;
    }
    if (inARow >= GIVE_UP_AFTER) {
      deps.log(`Wikidata is not answering right now (${inARow} searches in a row failed). Stopping here; what was found is kept, and the next run carries on.`);
      break;
    }
    const s = todo[i];
    const rows = await ask(deps, pause, s.label, s.queries);
    if (rows) {
      for (const p of rows) {
        if (s.forceCountry) p.country = s.country;
        else p.country ||= s.country;
      }
      const value = { at: now(), places: rows };
      saved.set(s.key, value);
      try {
        await store.save(s.key, value);
      } catch (e) {
        deps.log(`could not save ${s.label}: ${(e as Error).message}`);
      }
      ran++;
      inARow = 0;
    } else {
      failed++;
      inARow++;
    }
    const done = i + 1;
    if (done % 10 === 0 || done === todo.length) {
      const per = (now() - started) / done;
      deps.log(`${done}/${todo.length} searches · ${minutes(now() - started)} min so far · about ${minutes(per * (todo.length - done))} min left`);
    }
    await pause(s.forceCountry ? 500 : 300);
  }

  const stillMissing = searches.filter((s) => !saved.has(s.key)).length;
  const answers = searches.map((s) => saved.get(s.key)).filter((v): v is SavedSearch => !!v);
  const oldestAt = answers.reduce((m, v) => Math.min(m, v.at), Infinity);
  const result = { total: searches.length, ran, failed, missing: stillMissing, oldestAt: Number.isFinite(oldestAt) ? oldestAt : 0, changed: ran > 0 };
  if (onlyIfChanged && ran === 0) return { ...result, places: [] };

  // Copies, so the saved answers are not changed by the steps below.
  const all: WdPlace[] = answers.flatMap((v) => v.places.map((p) => ({ ...p })));
  deps.log(`${all.length} candidates from ${answers.length} of ${searches.length} searches`);
  const chosen: CachedPlace[] = selectForCache(all, target);
  deps.log(`chose ${chosen.length} of ${all.length} candidates; adding Hebrew and Russian names and photo credits…`);

  // Hebrew and Russian names and articles.
  for (let i = 0; i < chosen.length; i += 250) {
    const slice = chosen.slice(i, i + 250);
    try {
      const j = await deps.sparql(labelsQuery(slice.map((p) => p.qid)));
      const byQid = new Map(slice.map((p) => [p.qid, p]));
      for (const b of j.results?.bindings ?? []) {
        const uri = b.item?.value ?? '';
        const p = byQid.get(uri.slice(uri.lastIndexOf('/') + 1));
        if (!p) continue;
        p.names = { ...p.names, en: p.name, ...(b.he?.value ? { he: b.he.value } : {}), ...(b.ru?.value ? { ru: b.ru.value } : {}) };
        p.articles = {
          ...p.articles,
          ...(p.article ? { en: p.article } : {}),
          ...(b.heArticle?.value ? { he: b.heArticle.value } : {}),
          ...(b.ruArticle?.value ? { ru: b.ruArticle.value } : {}),
        };
      }
    } catch (e) {
      deps.log(`labels ${i}: ${(e as Error).message}`);
    }
    await pause(800);
  }

  // Photo authors and licences from Commons (50 files per request).
  const withPhoto = chosen.filter((p) => p.imageFile);
  for (let i = 0; i < withPhoto.length; i += 50) {
    const slice = withPhoto.slice(i, i + 50);
    try {
      const credits = parseCommonsCredits(await deps.commons(commonsCreditsUrl(slice.map((p) => p.imageFile!))));
      for (const p of slice) p.credit = credits.get(p.imageFile!);
    } catch (e) {
      deps.log(`credits ${i}: ${(e as Error).message}`);
    }
    await pause(300);
  }
  return { ...result, places: chosen };
}

/** One search: tried again with a lighter version when it fails (e.g. a timeout). */
async function ask(deps: BuildDeps, pause: (ms: number) => Promise<void>, label: string, queries: string[]): Promise<WdPlace[] | null> {
  for (let i = 0; i < queries.length; i++) {
    try {
      return parsePlaces(await deps.sparql(queries[i]));
    } catch (e) {
      const msg = (e as Error).message;
      const last = i === queries.length - 1;
      deps.log(`${label}: ${msg}${last ? ' — skipped for now' : ' — trying a lighter search'}`);
      // "429" = Wikidata asks us to slow down: wait half a minute before the next try.
      if (!last || /429/.test(msg)) await pause(/429/.test(msg) ? 30_000 : 2000);
    }
  }
  return null;
}

/** Firestore layout: attractionCache/meta + attractionCache/part-N (400 places each, well under 1 MiB). */
export const CACHE_PART = 400;

export function cacheDocs(
  places: CachedPlace[],
  builtAt = Date.now(),
  extra: { missing?: number; oldestSearchAt?: number } = {},
): Array<{ id: string; data: Record<string, unknown> }> {
  const parts = Math.ceil(places.length / CACHE_PART);
  const docs = Array.from({ length: parts }, (_, i) => ({
    id: `part-${i}`,
    data: { places: JSON.parse(JSON.stringify(places.slice(i * CACHE_PART, (i + 1) * CACHE_PART))) },
  }));
  return [
    ...docs,
    { id: 'meta', data: { parts, count: places.length, builtAt, source: 'Wikidata (CC0) + Wikimedia Commons', ...JSON.parse(JSON.stringify(extra)) } },
  ];
}
