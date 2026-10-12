import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import bundled from '../data/attractions-europe.json';
import type { Lang } from '../i18n/localized';
import type { Attraction, Location } from '../models';
import { BackupRow, CachedPlaceJSON, isRow, rowsNear, toRow } from '../planner/backupAttractions';
import { db, serverConfigured } from './firebase';

/**
 * The backup list of attractions on the phone, so a trip always has sights even when
 * Tripadvisor, Wikidata and the server don't answer:
 *  - the copy bundled with the app (`npm run attractions:build` writes src/data/attractions-europe.json
 *    before the app is built),
 *  - replaced by the newest list from Firestore (attractionCache/*, rebuilt by the server), downloaded
 *    at most twice a day and kept on the phone for offline use.
 */

const META_KEY = 'firefly.attractions.meta.v1';
const partKey = (i: number) => `firefly.attractions.part.v1.${i}`;
let rows: BackupRow[] | null = null;
let checkedAt = 0;
let syncing: Promise<BackupRow[] | null> | null = null;

const bundledRows = (): BackupRow[] => (Array.isArray(bundled) ? (bundled as unknown[]).filter(isRow) : []);

async function stored(): Promise<BackupRow[]> {
  try {
    const meta = JSON.parse((await AsyncStorage.getItem(META_KEY)) ?? 'null') as { parts?: number } | null;
    const out: BackupRow[] = [];
    for (let i = 0; i < (meta?.parts ?? 0); i++) {
      const part = JSON.parse((await AsyncStorage.getItem(partKey(i))) ?? '[]') as unknown[];
      out.push(...part.filter(isRow));
    }
    return out;
  } catch {
    return [];
  }
}

/** The newest list from Firestore, or null when the phone already has it (or it isn't there). */
async function download(): Promise<BackupRow[] | null> {
  const metaSnap = await getDoc(doc(db, 'attractionCache', 'meta'));
  const meta = metaSnap.data() as { parts?: number; builtAt?: number } | undefined;
  if (!meta?.parts || !meta.builtAt) return null;
  const mine = JSON.parse((await AsyncStorage.getItem(META_KEY).catch(() => null)) ?? 'null') as { builtAt?: number } | null;
  if (mine?.builtAt === meta.builtAt && rows?.length) return null;
  const parts: BackupRow[][] = [];
  for (let i = 0; i < meta.parts; i++) {
    const snap = await getDoc(doc(db, 'attractionCache', `part-${i}`));
    const places = ((snap.data() as { places?: CachedPlaceJSON[] } | undefined)?.places ?? []).filter((p) => p && typeof p.lat === 'number');
    parts.push(places.map(toRow));
  }
  // One key per part: Android keeps each stored value under 2 MB.
  await Promise.all(parts.map((p, i) => AsyncStorage.setItem(partKey(i), JSON.stringify(p))));
  await AsyncStorage.setItem(META_KEY, JSON.stringify({ parts: parts.length, builtAt: meta.builtAt }));
  return parts.flat();
}

function sync(): Promise<BackupRow[] | null> {
  if (!serverConfigured) return Promise.resolve(null);
  checkedAt = Date.now();
  syncing ??= download()
    .catch(() => null)
    .finally(() => {
      syncing = null;
    });
  return syncing;
}

/** The list (bundled, stored or freshly downloaded). Waits for the download only when the phone has none. */
export async function backupRows(): Promise<BackupRow[]> {
  if (!rows) {
    const mine = await stored();
    rows = mine.length ? mine : bundledRows();
  }
  if (Date.now() - checkedAt > 12 * 3_600_000) {
    const job = sync().then((fresh) => {
      if (fresh?.length) rows = fresh;
      return rows!;
    });
    if (!rows.length) await Promise.race([job, new Promise((r) => setTimeout(r, 30_000))]);
  }
  return rows;
}

export async function backupNear(at: Location, radiusKm: number, lang: Lang, limit = 80): Promise<Attraction[]> {
  return rowsNear(await backupRows(), at, radiusKm, lang, limit);
}

/** Start loading the list early (the trip form calls this when it opens). */
export function prefetchBackup(): void {
  backupRows().catch(() => undefined);
}
