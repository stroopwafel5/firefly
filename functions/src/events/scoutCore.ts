import type { Region } from './plan';
import { REGION_CITIES } from './plan';
import { ProcessDeps, UploadedEvent, processListedEvent } from './upload/process';
import { ListedEvent, sameLinkKey } from './upload/parse';

/**
 * The weekly event scout: Claude searches the web for in-person events in each region's cities
 * for the next four weeks — outdoor and family ones first (festivals, Christmas and seasonal
 * markets, fairs, parades, light festivals, open-air shows, children's tours and activities) —
 * and lists each event's own page. Every page then goes through exactly the same steps as an
 * admin's upload (upload/process.ts): Claude reads the page, the place is found on the map, a
 * real photo is picked, the texts are written in English, Hebrew and Russian, and the record must
 * pass the same checks as every other event. Accepted events are kept in scoutEvents/* until
 * they end and are found by every event search near them (the weekly list, the Events tab, trips).
 *
 * Request building and answer reading are pure and unit-tested; the cost is bounded by
 * EVENTS_SCOUT_MAX pages read per week (pages already read are not read again).
 */

export interface ScoutListing {
  title: string;
  url: string;
  city: string;
  countryCode: string;
  startDate: string;
  endDate: string;
  outdoor: boolean;
  family: boolean;
}

export const REPORT_TOOL = {
  name: 'report_events',
  description: 'Report the events found, each with the page it was found on.',
  input_schema: {
    type: 'object',
    properties: {
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Event name in English (the official English name if there is one).' },
            url: { type: 'string', description: "The event's own page (organiser, venue, festival site or city tourism board) exactly as found." },
            city: { type: 'string', description: 'Town or city, in English.' },
            countryCode: { type: 'string', description: 'ISO 3166-1 alpha-2.' },
            startDate: { type: 'string', description: 'YYYY-MM-DD.' },
            endDate: { type: 'string', description: 'YYYY-MM-DD (same as startDate for one day).' },
            outdoor: { type: 'boolean', description: 'true if it takes place mostly outdoors.' },
            family: { type: 'boolean', description: 'true if it suits children.' },
          },
          required: ['title', 'url', 'city', 'countryCode', 'startDate', 'endDate', 'outdoor', 'family'],
        },
      },
    },
    required: ['events'],
  },
} as const;

const REGION_NAME: Record<Region, string> = {
  israel: 'Israel',
  europe: 'Europe',
  japan: 'Japan',
  seasia: 'South-East Asia',
  africa: 'Africa',
  world: 'the world',
};

export function scoutSystem(): string {
  return [
    'You find real, in-person events for Firefly, a travel app for families from Israel who travel abroad.',
    'Search the web, then call report_events once with what you found.',
    'Wanted, in this order: outdoor events (festivals, Christmas and seasonal markets, fairs, parades, light festivals, open-air theatre and shows, food and cultural festivals),',
    "then family events and activities (children's tours, workshops, shows for kids, zoo and garden events), then other notable concerts, exhibitions and shows.",
    'Rules:',
    '- Only events you saw on a web page during this search, taking place (at least partly) in the dates given. Never invent an event, a date or a link.',
    "- url must be the event's own page: the organiser, venue, festival site or the city's tourism board. Avoid ticket resellers, aggregators and social media when an own page exists.",
    '- Not wanted: online events, conferences and trade fairs, nightclub parties, adults-only events, sports matches, guided-tour companies and products for sale.',
    '- Spread the events over all the cities given, the bigger ones first.',
  ].join('\n');
}

export function scoutRequest(o: { region: Region; cities: string[]; from: string; to: string; max: number; model: string; searches?: number }) {
  return {
    model: o.model,
    max_tokens: 6000,
    system: scoutSystem(),
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: o.searches ?? 4 }, REPORT_TOOL],
    messages: [
      {
        role: 'user',
        content:
          `Find up to ${o.max} in-person events between ${o.from} and ${o.to} in these cities of ${REGION_NAME[o.region]}: ${o.cities.join('; ')}.` +
          ' Search in the local language too (e.g. "Weihnachtsmarkt", "kerstmarkt", "jarmark", "vánoční trhy", "祭り", "festival"). Then call report_events.',
      },
    ],
  };
}

const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : '');
const SOCIAL = /(^|\.)(facebook|instagram|tiktok|x|twitter|linkedin|youtube)\.com$/i;

/** The reported events, checked: a real http(s) link (not social media), dates, a city. */
export function readScoutReport(j: { content?: Array<{ type: string; name?: string; input?: unknown }> }): ScoutListing[] | null {
  const call = j.content?.find((c) => c.type === 'tool_use' && c.name === REPORT_TOOL.name);
  if (!call || !call.input || typeof call.input !== 'object') return null;
  const list = (call.input as { events?: unknown }).events;
  if (!Array.isArray(list)) return [];
  const out: ScoutListing[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const url = typeof o.url === 'string' ? o.url.trim() : '';
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(url) || SOCIAL.test(host)) continue;
    const startDate = day(o.startDate);
    const endDate = day(o.endDate) || startDate;
    const title = typeof o.title === 'string' ? o.title.trim().slice(0, 200) : '';
    const city = typeof o.city === 'string' ? o.city.trim().slice(0, 100) : '';
    const key = sameLinkKey(url);
    if (!title || !startDate || !city || seen.has(key)) continue;
    seen.add(key);
    out.push({
      title,
      url,
      city,
      countryCode: typeof o.countryCode === 'string' && /^[A-Za-z]{2}$/.test(o.countryCode.trim()) ? o.countryCode.trim().toUpperCase() : '',
      startDate,
      endDate: endDate < startDate ? startDate : endDate,
      outdoor: o.outdoor === true,
      family: o.family === true,
    });
  }
  return out;
}

/** Cities in groups of `size` for one search each (bigger cities are listed first in each region). */
export function cityGroups(cities: string[], size = 4): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < cities.length; i += size) out.push(cities.slice(i, i + size));
  return out;
}

/** Outdoor and family events first, then by date. */
export function rankListings(list: ScoutListing[]): ScoutListing[] {
  return [...list].sort((a, b) => Number(b.outdoor) + Number(b.family) - (Number(a.outdoor) + Number(a.family)) || a.startDate.localeCompare(b.startDate));
}

/* ---------------- where scout events are kept ---------------- */

/** A 1°×1° map cell, so events near a point are found with a few document reads. */
export const cellOf = (lat: number, lon: number) => `${Math.floor(lat)}:${Math.floor(lon)}`;

/** The cells a circle touches. */
export function cellsAround(lat: number, lon: number, radiusKm: number): string[] {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const out: string[] = [];
  for (let y = Math.floor(lat - dLat); y <= Math.floor(lat + dLat); y++) {
    for (let x = Math.floor(lon - dLon); x <= Math.floor(lon + dLon); x++) out.push(`${y}:${((((x + 180) % 360) + 360) % 360) - 180}`);
  }
  return [...new Set(out)];
}

/* ---------------- the weekly run ---------------- */

type ScoutBody = Omit<ReturnType<typeof scoutRequest>, 'messages'> & { messages: unknown[] };

export interface ScoutDeps {
  /** One Messages API call (with web search); returns the answer JSON. */
  ask(body: ScoutBody): Promise<{ content?: Array<{ type: string; name?: string; input?: unknown }>; stop_reason?: string }>;
  process: ProcessDeps;
  /** Pages already read: true to skip. */
  seen(url: string): Promise<boolean>;
  remember(url: string, status: 'published' | 'held' | 'failed', until: string): Promise<void>;
  save(e: UploadedEvent & { region: Region; cell: string; scout: true }): Promise<void>;
  log(m: string, extra?: unknown): void;
}

/** One search: Claude may pause between web searches ("pause_turn"); then it reports. */
export async function scoutOnce(deps: ScoutDeps, req: ReturnType<typeof scoutRequest>): Promise<ScoutListing[]> {
  let messages: unknown[] = [...req.messages];
  for (let turn = 0; turn < 4; turn++) {
    const j = await deps.ask({ ...req, messages });
    const report = readScoutReport(j);
    if (report) return report;
    messages = [...messages, { role: 'assistant', content: j.content ?? [] }];
    if (j.stop_reason !== 'pause_turn') messages.push({ role: 'user', content: 'Now call report_events with the events you found (only ones whose page you saw).' });
  }
  return [];
}

export interface ScoutResult {
  searched: number;
  listed: number;
  read: number;
  published: number;
  byRegion: Partial<Record<Region, number>>;
}

/**
 * Every region's cities, a few at a time: find events, read each new page (up to `maxPages` this
 * run, in region order Europe → Japan → South-East Asia → Africa → the rest) and keep those that
 * pass the checks. Stops early when `deadline` is near; the next week carries on.
 */
export async function runScout(
  deps: ScoutDeps,
  o: { from: string; to: string; today: string; model: string; maxPages: number; deadline: number; now?: () => number; /** Rotates where each region's search starts (day number). */ offset?: number },
): Promise<ScoutResult> {
  const now = o.now ?? (() => Date.now());
  const result: ScoutResult = { searched: 0, listed: 0, read: 0, published: 0, byRegion: {} };
  const regions: Region[] = ['europe', 'japan', 'seasia', 'africa', 'world'];
  // Pages per region this week, in proportion to the region's share of the list.
  const share: Record<Region, number> = { israel: 0, europe: 0.45, japan: 0.15, seasia: 0.15, africa: 0.15, world: 0.1 };
  let left = o.maxPages; // never more than this in one run, whatever the shares add up to
  for (const region of regions) {
    let budget = Math.ceil(o.maxPages * share[region]);
    // Each run starts at a different group of cities, so every city's turn comes round.
    const groups = cityGroups(REGION_CITIES[region]);
    const start = (o.offset ?? 0) % Math.max(1, groups.length);
    for (const cities of [...groups.slice(start), ...groups.slice(0, start)]) {
      if (budget <= 0 || left <= 0 || now() > o.deadline - 120_000) break;
      let listings: ScoutListing[] = [];
      try {
        listings = rankListings(await scoutOnce(deps, scoutRequest({ region, cities, from: o.from, to: o.to, max: 12, model: o.model, searches: 4 })));
      } catch (e) {
        deps.log('scout search failed', { region, cities, error: (e as Error).message });
        if (/credit balance|authentication|api key|permission/i.test((e as Error).message)) return result; // repeats for every call
        continue;
      }
      result.searched++;
      result.listed += listings.length;
      const fresh: ScoutListing[] = [];
      for (const l of listings) if (l.endDate >= o.today && !(await deps.seen(l.url))) fresh.push(l);
      const take = fresh.slice(0, Math.min(budget, left));
      budget -= take.length;
      left -= take.length;
      await mapLimit(take, 4, async (l, i) => {
        if (now() > o.deadline - 60_000) return;
        const listed: ListedEvent = { title: l.title, url: l.url, notes: `${l.city}${l.countryCode ? `, ${l.countryCode}` : ''}. Found by the weekly search for ${o.from}–${o.to}.`, days: [], line: i + 1 };
        const r = await processListedEvent(listed, i, { uploadId: `scout-${o.from}`, admin: 'Firefly weekly event search', listLang: 'en', weekStart: o.from }, deps.process).catch((e: Error) => ({
          result: { status: 'failed' as const, reasons: [e.message] },
          event: undefined,
        }));
        result.read++;
        if (r.event && r.event.location.locLat) {
          await deps.save({ ...r.event, region, cell: cellOf(r.event.location.locLat, r.event.location.locLon), scout: true });
          result.published++;
          result.byRegion[region] = (result.byRegion[region] ?? 0) + 1;
          await deps.remember(l.url, 'published', r.event.endDate);
        } else {
          // Held back (no photo, no place on the map…): try that page again in two weeks.
          const retry = new Date(Date.parse(`${o.today}T00:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10);
          await deps.remember(l.url, r.result.status === 'failed' ? 'failed' : 'held', retry);
        }
      });
    }
  }
  return result;
}

/** Runs `fn` over `items`, `limit` at a time. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
