import { collection, getDocs } from 'firebase/firestore';
import { CAMPS, CampData, campFromData, campPageFromData } from '../data/camps';
import type { Lang } from '../i18n/localized';
import type { Camp, CampPage } from '../models';
import { db, serverConfigured } from './firebase';

/**
 * Camps come from differentroute.net. The bundled catalogue (data/camps.ts) is the source of
 * truth and works offline; admins can override or add camps in the Firestore `camps`
 * collection (same CampData shape) without shipping an app update.
 */
let catalogue: CampData[] = CAMPS;
let loaded = false;

export async function loadCampCatalogue(): Promise<CampData[]> {
  if (loaded) return catalogue;
  if (!serverConfigured) {
    loaded = true;
    return catalogue;
  }
  try {
    const snap = await getDocs(collection(db, 'camps'));
    if (!snap.empty) {
      const remote = snap.docs.map((d) => d.data() as CampData).filter((c) => c && c.id && c.name);
      const byId = new Map(CAMPS.map((c) => [c.id, c]));
      remote.forEach((c) => byId.set(c.id, c));
      catalogue = [...byId.values()];
    }
  } catch {
    /* offline or not configured: bundled data */
  }
  loaded = true;
  return catalogue;
}

export async function listCamps(lang: Lang): Promise<Camp[]> {
  const data = await loadCampCatalogue();
  return data.map((c) => campFromData(c, lang)).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

export async function getCampPage(id: number, lang: Lang): Promise<{ page: CampPage; data: CampData } | null> {
  const data = (await loadCampCatalogue()).find((c) => c.id === id);
  return data ? { page: campPageFromData(data, lang), data } : null;
}

export { filterCamps, providersOf } from './campFilters';
export type { CampFilter } from './campFilters';
