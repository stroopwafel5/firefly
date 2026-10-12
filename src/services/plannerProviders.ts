import { Attraction, Event, Hotel, Location, Restaurant, isoDay, popularityOf } from '../models';
import { seedEvents } from '../data/seedEvents';
import { haversineKm } from '../planner/geo';
import { mergeWithBackup } from '../planner/backupAttractions';
import { backupNear } from './attractionBackup';
import type { PlannerProviders } from '../planner/generator';
import { api } from './api';
import { searchEvents } from './eventService';
import { describeAttraction, kidContent, wikipediaSightsNear } from './wikipedia';

const ll = (l: Location) => ({ lat: l.locLat, lon: l.locLon });

/** What the sources said while the current trip was planned (reset at the start of each plan). */
const notes = new Set<string>();
/** How many attractions each source gave for this trip (shown on the plan as one line). */
let counts: Record<string, number> = {};
let tripadvisorHttp = new Set<number>();
/** The server's error the last time it couldn't answer (e.g. "deadline-exceeded", "unauthenticated"). */
let serverError = '';
export function resetSourceNotes() {
  notes.clear();
  counts = {};
  tripadvisorHttp = new Set();
  serverError = '';
}

/**
 * One line for the "no sights" message, so a screenshot says what happened:
 * "server: deadline-exceeded · Tripadvisor 0 (HTTP 429) · Google 0 · Wikidata 0 · Wikipedia 0".
 */
export function sourcesSummary(): string {
  const n = (k: string) => counts[k] ?? 0;
  const http = [...tripadvisorHttp].filter((h) => h !== 200);
  return [
    serverError ? `server: ${serverError}` : '',
    `Tripadvisor ${n('tripadvisor')}${http.length ? ` (HTTP ${http.join(', ')})` : ''}`,
    `Google ${n('google')}`,
    `Wikidata ${n('wikidata')}`,
    `OSM ${n('osm')}`,
    `list ${n('backup') + n('phone')}`,
    `Wikipedia ${n('wikipedia')}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
const noteTripadvisor = (state?: string) => {
  if (state === 'busy' || state === 'error') notes.add('tripadvisorBusy');
};
const add = (k: string, n: number) => (counts[k] = (counts[k] ?? 0) + n);

/** "sources:{…}" — the plan's line saying where its attractions came from. */
function sourcesNote(): string {
  return `sources:${JSON.stringify({ ...counts, http: [...tripadvisorHttp].sort() })}`;
}

/** The planner's data sources in the app: our Cloud Functions + Wikipedia. */
export const appProviders: PlannerProviders = {
  async geocode(query, lang) {
    const r = await api.geocode({ query, lang });
    return r ? { location: new Location(r.lat, r.lon), name: r.name, country: r.country } : null;
  },
  async route(a, b) {
    const r = await api.routeLine({ from: ll(a), to: ll(b) });
    return r ? r.points.map(([lat, lon]) => new Location(lat, lon)) : null;
  },
  async placeName(loc, lang) {
    return (await api.reverseGeocode({ ...ll(loc), lang })).name;
  },
  /**
   * The server's attractions (Tripadvisor + the free sources), completed from the backup list on
   * the phone; when the server doesn't answer at all, the phone's list alone — a trip always has
   * sights where the list has them.
   */
  async attractionsNear(loc, lang, radiusKm, want, needs, opts) {
    let server: Attraction[] = [];
    try {
      const types = opts?.types?.length ? opts.types : undefined;
      const r = needs?.length
        ? await api.attractionsNearAccessible({ ...ll(loc), lang, radiusKm, want, needs, types })
        : await api.attractionsNear({ ...ll(loc), lang, radiusKm, want, landmarks: opts?.landmarks || undefined, types });
      server = r.items.map(Attraction.fromJSON);
      if (!opts?.landmarks) {
        noteTripadvisor(r.tripadvisor);
        const s = r.sources;
        if (s) {
          add('tripadvisor', s.tripadvisor ?? 0);
          add('google', s.google ?? 0);
          add('wikidata', s.wikidata ?? 0);
          add('osm', s.osm ?? 0);
          add('backup', s.backup ?? 0);
          add('wikipedia', s.wikipedia ?? 0);
          (s.tripadvisorHttp ?? []).forEach((h) => tripadvisorHttp.add(h));
        }
      }
    } catch (e) {
      notes.add('serverAttractionsFailed');
      add('serverFailed', 1);
      const err = e as { code?: string; message?: string };
      serverError = String(err.code ?? err.message ?? e).replace(/^functions\//, '');
    }
    const local = await backupNear(loc, Math.max(radiusKm, opts?.landmarks ? radiusKm : 12), lang, 80).catch(() => [] as Attraction[]);
    const extra = opts?.landmarks ? local.filter((a) => isLandmarkKind(a)) : local;
    let merged = mergeWithBackup(server, extra);
    if (!opts?.landmarks) add('phone', merged.length - server.length);
    // Hardly anything (the server didn't answer, or answered nearly empty): Wikipedia's articles
    // around the place, straight from the phone.
    if (!opts?.landmarks && merged.length < 10) {
      const wiki = await wikipediaSightsNear(loc.locLat, loc.locLon, lang).catch(() => [] as Attraction[]);
      const before = merged.length;
      merged = mergeWithBackup(merged, wiki);
      add('wikipedia', merged.length - before);
    }
    return merged.slice(0, Math.max(want ?? 60, server.length));
  },
  async restaurantsNear(loc, lang, want) {
    const r = await api.restaurantsNear({ ...ll(loc), lang, want });
    noteTripadvisor(r.tripadvisor);
    return r.items.map(Restaurant.fromJSON);
  },
  async hotelsNear(loc, lang, stay) {
    const r = await api.hotelsNear({
      ...ll(loc),
      lang,
      checkIn: isoDay(stay.checkIn),
      checkOut: isoDay(stay.checkOut),
      adults: stay.adults,
      kids: stay.kids,
    });
    return r.items.map(Hotel.fromJSON);
  },
  /**
   * Events around a place during the trip: the live search (which includes the events admins
   * uploaded), plus the curated events that ship with the app — so a trip has its events even
   * when the search is slow or misses some.
   */
  async eventsNear(loc, from, to, lang, radiusKm): Promise<Event[]> {
    const live = await searchEvents({ center: loc, radiusKm, from, to, lang })
      .then((r) => r.events)
      .catch(() => [] as Event[]);
    const byId = new Map<string, Event>(live.map((e) => [e.id, e]));
    for (const e of seedEvents(lang)) {
      if (!byId.has(e.id) && e.overlaps(from, to) && haversineKm(loc, e.location) <= radiusKm) byId.set(e.id, e);
    }
    return [...byId.values()];
  },
  async travelMatrix(points, mode, departure) {
    const r = await api.travelMatrix({
      points: points.map((p) => ({ id: p.id, ...ll(p.location) })),
      mode,
      departure: departure && departure.getTime() > Date.now() ? departure.toISOString() : undefined,
    });
    return r.entries;
  },
  kidContent,
  describe: describeAttraction,
  sourceNotes: () => [...notes, sourcesNote()],
};

/** World-class nature and heritage only (for stops between two cities, like Plitvice). */
function isLandmarkKind(a: Attraction): boolean {
  return popularityOf(a) >= 9.0 && LANDMARK_KINDS.has(a.kind);
}
const LANDMARK_KINDS = new Set(['nationalpark', 'reserve', 'waterfall', 'cave', 'canyon', 'lake', 'castle', 'palace', 'fortress', 'ruins', 'oldtown', 'monastery', 'beach', 'viewpoint']);
