import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, getDoc, getDocs, query, where, addDoc } from 'firebase/firestore';
import { seedEvents } from '../data/seedEvents';
import type { Lang } from '../i18n/localized';
import { Event, EventJSON, EventType, Location, isoDay, validateEvent } from '../models';
import { haversineKm } from '../planner/geo';
import { api, SearchEventsRequest } from './api';
import { db, serverConfigured } from './firebase';

/**
 * Where Weekend events come from (in this order):
 *  1. LIVE — the `searchEvents` Cloud Function polls the web on demand for the requested
 *     area and dates (Google Events via SerpApi, Ticketmaster, admin events in Firestore),
 *     keeps only physical, sourced events with real photos, and caches per area for 6 h.
 *  2. OFFLINE SNAPSHOT — the 150 events (50 in Israel) the weekly `refreshFallbackEvents`
 *     job collected for the next two weekends; downloaded whenever online, kept on the phone.
 *  3. BUNDLED — the hand-verified events in data/seedEvents.ts, always available.
 * With no place typed, the search is 100 km around the user's current location.
 */

const SNAPSHOT_KEY = 'firefly.fallbackEvents.v1';
const LAST_RESULTS_KEY = 'firefly.lastEventSearch.v1';

export interface EventSearch {
  center?: Location;
  place?: string;
  query?: string;
  radiusKm: number;
  from: Date;
  to: Date;
  types?: EventType[];
  lang: Lang;
}

export interface EventSearchResult {
  events: Event[];
  mode: 'live' | 'offline';
  sources: string[];
  center?: Location;
  centerName?: string;
}

const toEvents = (list: EventJSON[]) =>
  list
    .filter((e) => validateEvent(e).length === 0)
    .map((e) => {
      try {
        return Event.fromJSON(e);
      } catch {
        return null;
      }
    })
    .filter((e): e is Event => !!e);

export async function searchEvents(s: EventSearch): Promise<EventSearchResult> {
  const req: SearchEventsRequest = {
    lat: s.center?.locLat,
    lon: s.center?.locLon,
    place: s.place?.trim() || undefined,
    query: s.query?.trim() || undefined,
    radiusKm: s.radiusKm,
    from: isoDay(s.from),
    to: isoDay(s.to),
    types: s.types?.length ? s.types : undefined,
    lang: s.lang,
  };
  try {
    const res = await api.searchEvents(req);
    const events = toEvents(res.events);
    AsyncStorage.setItem(LAST_RESULTS_KEY, JSON.stringify(res.events)).catch(() => undefined);
    return {
      events,
      mode: 'live',
      sources: res.sources,
      center: new Location(res.center.lat, res.center.lon),
      centerName: res.center.name,
    };
  } catch {
    return offlineEvents(s);
  }
}

/** Downloads the weekly 150-event snapshot so it is there when the phone is offline. */
export async function syncFallbackSnapshot(): Promise<number> {
  if (!serverConfigured) return 0;
  try {
    const meta = await getDoc(doc(db, 'fallback', 'events'));
    const parts = (meta.data()?.parts as number | undefined) ?? 0;
    const all: EventJSON[] = [];
    for (let i = 0; i < parts; i++) {
      const p = await getDoc(doc(db, 'fallback', `events-${i}`));
      all.push(...((p.data()?.events as EventJSON[] | undefined) ?? []));
    }
    if (all.length) await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(all));
    return all.length;
  } catch {
    return 0;
  }
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function offlineEvents(s: EventSearch): Promise<EventSearchResult> {
  const snapshot = toEvents((await readJson<EventJSON[]>(SNAPSHOT_KEY)) ?? []);
  const lastSearch = toEvents((await readJson<EventJSON[]>(LAST_RESULTS_KEY)) ?? []);
  const byId = new Map<string, Event>();
  [...seedEvents(s.lang), ...snapshot, ...lastSearch].forEach((e) => byId.set(e.id, e));
  let events = [...byId.values()].filter((e) => e.overlaps(s.from, s.to));
  if (s.query) {
    const q = s.query.toLowerCase();
    events = events.filter((e) => e.name.toLowerCase().includes(q));
  }
  if (s.types?.length) events = events.filter((e) => e.types.some((t) => s.types!.includes(t)));
  if (s.center) {
    const near = events.filter((e) => haversineKm(s.center!, e.location) <= s.radiusKm);
    // Nothing within the radius offline: show everything, nearest first, rather than an empty screen.
    events = (near.length ? near : events).sort(
      (a, b) => haversineKm(s.center!, a.location) - haversineKm(s.center!, b.location),
    );
  }
  return { events, mode: 'offline', sources: ['offline'], center: s.center };
}

let snapshotSynced = false;

/**
 * This week's collected events (the weekly snapshot + Firefly's hand-checked events), wherever
 * the user is: Israel (where most of Firefly's travellers live) or the rest of the world.
 * Downloads the latest snapshot first (once per app start), then works offline.
 */
export async function weeklyPicks(scope: 'israel' | 'world', lang: Lang): Promise<Event[]> {
  if (!snapshotSynced) {
    snapshotSynced = (await syncFallbackSnapshot().catch(() => 0)) > 0;
  }
  const byId = new Map<string, Event>();
  [...seedEvents(lang), ...toEvents((await readJson<EventJSON[]>(SNAPSHOT_KEY)) ?? [])].forEach((e) => byId.set(e.id, e));
  const today = isoDay(new Date());
  return [...byId.values()]
    .filter((e) => isoDay(e.endDate) >= today && (scope === 'israel' ? e.country === 'IL' : e.country !== 'IL'))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

/** Admin-only (enforced by Firestore rules): publish a validated event. */
export async function publishEvent(e: EventJSON, uid: string): Promise<string> {
  const problems = validateEvent(e);
  if (problems.length) throw Object.assign(new Error('invalid'), { problems });
  const ref = await addDoc(collection(db, 'events'), { ...e, origin: 'admin', createdBy: uid, createdAt: Date.now() });
  return ref.id;
}

export async function eventsByIds(ids: string[], lang: Lang): Promise<Event[]> {
  if (!ids.length) return [];
  const known = new Map<string, Event>();
  seedEvents(lang).forEach((e) => known.set(e.id, e));
  toEvents((await readJson<EventJSON[]>(SNAPSHOT_KEY)) ?? []).forEach((e) => known.set(e.id, e));
  toEvents((await readJson<EventJSON[]>(LAST_RESULTS_KEY)) ?? []).forEach((e) => known.set(e.id, e));
  const missing = serverConfigured ? ids.filter((id) => !known.has(id)) : [];
  // Events a user saved are copied to savedEvents/{id} by setGoing / favourites, so they never vanish.
  for (let i = 0; i < missing.length; i += 10) {
    try {
      const snap = await getDocs(query(collection(db, 'savedEvents'), where('id', 'in', missing.slice(i, i + 10))));
      snap.docs.forEach((d) => {
        const e = toEvents([d.data() as EventJSON])[0];
        if (e) known.set(e.id, e);
      });
    } catch {
      /* offline */
    }
  }
  return ids.map((id) => known.get(id)).filter((e): e is Event => !!e);
}

export interface EventFilter {
  name: string;
  from?: Date;
  to?: Date;
  types: EventType[];
  country?: string;
  minPrice?: number;
  maxPrice?: number;
}

export function filterEvents(events: Event[], f: EventFilter): Event[] {
  const q = f.name.trim().toLowerCase();
  return events.filter((e) => {
    if (q && !e.name.toLowerCase().includes(q)) return false;
    if (f.from && f.to && !e.overlaps(f.from, f.to)) return false;
    if (f.from && !f.to && isoDay(e.endDate) < isoDay(f.from)) return false;
    if (f.types.length && !e.types.some((t) => f.types.includes(t))) return false;
    if (f.country && e.country !== f.country) return false;
    if (f.minPrice != null && (e.price == null || e.price < f.minPrice)) return false;
    if (f.maxPrice != null && (e.price == null || e.price > f.maxPrice)) return false;
    return true;
  });
}
