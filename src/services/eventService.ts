import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, getDoc, getDocs, query, where, addDoc, limit } from 'firebase/firestore';
import { seedEvents } from '../data/seedEvents';
import type { Lang } from '../i18n/localized';
import { Event, EventJSON, EventType, Location, isoDay, localizeEventJSON, validateEvent } from '../models';
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

const toEvents = (list: EventJSON[], lang: Lang) =>
  list
    .filter((e) => validateEvent(e).length === 0)
    .map((e) => {
      try {
        return Event.fromJSON(localizeEventJSON(e, lang));
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
    const events = toEvents(res.events, s.lang);
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

/**
 * The weekly list (about 950 events worldwide since 12 Oct 2026) is kept on the phone in pieces of
 * 100 events: Android can't read back a single stored value over 2 MB, so the whole list in one
 * value was lost (and downloaded again and again). Read once per app run and kept in memory.
 */
const SNAPSHOT_META_KEY = 'firefly.fallbackEvents.v2.meta';
const snapshotPartKey = (i: number) => `firefly.fallbackEvents.v2.${i}`;
const SNAPSHOT_PART = 100;
let snapshotMemory: EventJSON[] | null = null;
let snapshotDownload: Promise<number> | null = null;
let snapshotDownloadedAt = 0;

async function readSnapshot(): Promise<EventJSON[]> {
  if (snapshotMemory) return snapshotMemory;
  try {
    const meta = JSON.parse((await AsyncStorage.getItem(SNAPSHOT_META_KEY)) ?? 'null') as { parts?: number } | null;
    const out: EventJSON[] = [];
    for (let i = 0; i < (meta?.parts ?? 0); i++) {
      out.push(...((JSON.parse((await AsyncStorage.getItem(snapshotPartKey(i))) ?? '[]') as EventJSON[]) ?? []));
    }
    if (out.length) snapshotMemory = out;
    return out;
  } catch {
    return [];
  }
}

/** Downloads the weekly list so it is there when the phone is offline (at most every 30 minutes). */
export function syncFallbackSnapshot(): Promise<number> {
  if (!serverConfigured) return Promise.resolve(0);
  if (snapshotDownload) return snapshotDownload;
  if (snapshotMemory && Date.now() - snapshotDownloadedAt < 30 * 60_000) return Promise.resolve(snapshotMemory.length);
  snapshotDownload = (async () => {
    try {
      const meta = await getDoc(doc(db, 'fallback', 'events'));
      const parts = (meta.data()?.parts as number | undefined) ?? 0;
      const docs = await Promise.all(Array.from({ length: parts }, (_, i) => getDoc(doc(db, 'fallback', `events-${i}`))));
      const all = docs.flatMap((p) => (p.data()?.events as EventJSON[] | undefined) ?? []);
      if (!all.length) return 0;
      snapshotMemory = all;
      snapshotDownloadedAt = Date.now();
      const pieces = Math.ceil(all.length / SNAPSHOT_PART);
      await Promise.all(Array.from({ length: pieces }, (_, i) => AsyncStorage.setItem(snapshotPartKey(i), JSON.stringify(all.slice(i * SNAPSHOT_PART, (i + 1) * SNAPSHOT_PART)))));
      await AsyncStorage.setItem(SNAPSHOT_META_KEY, JSON.stringify({ parts: pieces, at: Date.now() }));
      await AsyncStorage.removeItem(SNAPSHOT_KEY).catch(() => undefined); // the old single value
      return all.length;
    } catch {
      return 0;
    } finally {
      snapshotDownload = null;
    }
  })();
  return snapshotDownload;
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
  const snapshot = toEvents(await readSnapshot(), s.lang);
  const lastSearch = toEvents((await readJson<EventJSON[]>(LAST_RESULTS_KEY)) ?? [], s.lang);
  const uploaded = toEvents((await readJson<EventJSON[]>(UPLOADED_KEY)) ?? [], s.lang);
  const byId = new Map<string, Event>();
  [...seedEvents(s.lang), ...snapshot, ...uploaded, ...lastSearch].forEach((e) => byId.set(e.id, e));
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

const UPLOADED_KEY = 'firefly.uploadedEvents.v1';
let uploadedAt = 0;

/**
 * Events admins uploaded on the upload page (Firestore `events`, still upcoming). Read straight
 * from Firestore — at most every 10 minutes — so a new list shows up at once, not only after the
 * weekly snapshot; kept on the phone for offline use.
 */
async function uploadedEvents(): Promise<EventJSON[]> {
  if (serverConfigured && Date.now() - uploadedAt > 10 * 60_000) {
    try {
      const snap = await getDocs(query(collection(db, 'events'), where('endDate', '>=', isoDay(new Date())), limit(300)));
      const list = snap.docs.map((d) => ({ ...(d.data() as EventJSON), id: d.id }));
      uploadedAt = Date.now();
      await AsyncStorage.setItem(UPLOADED_KEY, JSON.stringify(list)).catch(() => undefined);
      return list;
    } catch {
      /* offline: the copy on the phone */
    }
  }
  return (await readJson<EventJSON[]>(UPLOADED_KEY)) ?? [];
}

/**
 * This week's collected events (the weekly snapshot + Firefly's hand-checked events), wherever
 * the user is: Israel (where most of Firefly's travellers live) or the rest of the world.
 * Downloads the latest snapshot first (once per app start), then works offline.
 */
/** Every event the phone knows about: the hand-checked ones, the weekly list and admins' uploads. */
export async function knownEvents(lang: Lang): Promise<Event[]> {
  if (!snapshotSynced) {
    snapshotSynced = (await syncFallbackSnapshot().catch(() => 0)) > 0;
  }
  const byId = new Map<string, Event>();
  const uploaded = await uploadedEvents();
  [...seedEvents(lang), ...toEvents(await readSnapshot(), lang), ...toEvents(uploaded, lang)].forEach((e) =>
    byId.set(e.id, e),
  );
  return [...byId.values()];
}

export async function weeklyPicks(scope: 'israel' | 'world', lang: Lang): Promise<Event[]> {
  const known = await knownEvents(lang);
  const today = isoDay(new Date());
  return known
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

/**
 * Events the user hearted or marked "I'm going", kept on the phone too (up to 300), so the profile
 * shows them even when the server's copy (savedEvents) couldn't be made.
 */
const LIKED_KEY = 'firefly.likedEvents.v1';
export async function rememberEvent(e: EventJSON): Promise<void> {
  try {
    const all = (JSON.parse((await AsyncStorage.getItem(LIKED_KEY)) ?? '[]') as EventJSON[]).filter((x) => x.id !== e.id);
    all.unshift(e);
    await AsyncStorage.setItem(LIKED_KEY, JSON.stringify(all.slice(0, 300)));
  } catch {
    /* best effort */
  }
}

export async function eventsByIds(ids: string[], lang: Lang): Promise<Event[]> {
  if (!ids.length) return [];
  const known = new Map<string, Event>();
  toEvents((await readJson<EventJSON[]>(LIKED_KEY)) ?? [], lang).forEach((e) => known.set(e.id, e));
  seedEvents(lang).forEach((e) => known.set(e.id, e));
  toEvents(await readSnapshot(), lang).forEach((e) => known.set(e.id, e));
  toEvents((await readJson<EventJSON[]>(UPLOADED_KEY)) ?? [], lang).forEach((e) => known.set(e.id, e));
  toEvents((await readJson<EventJSON[]>(LAST_RESULTS_KEY)) ?? [], lang).forEach((e) => known.set(e.id, e));
  const missing = serverConfigured ? ids.filter((id) => !known.has(id)) : [];
  // Events a user saved are copied to savedEvents/{id} by setGoing / favourites, so they never vanish.
  for (let i = 0; i < missing.length; i += 10) {
    try {
      const snap = await getDocs(query(collection(db, 'savedEvents'), where('id', 'in', missing.slice(i, i + 10))));
      snap.docs.forEach((d) => {
        const e = toEvents([d.data() as EventJSON], lang)[0];
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
