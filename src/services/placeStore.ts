import AsyncStorage from '@react-native-async-storage/async-storage';
import { Attraction, AttractionJSON } from '../models';

/**
 * Places the user hearted, kept on the phone (up to 300), so the profile can show every favourite:
 * only Tripadvisor places can be looked up again by their id; places from Google, Wikidata,
 * Wikipedia or the map could not, and so never appeared on the profile.
 */
const KEY = 'firefly.likedPlaces.v1';

async function readAll(): Promise<AttractionJSON[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as AttractionJSON[];
  } catch {
    return [];
  }
}

export async function rememberPlace(a: Attraction): Promise<void> {
  try {
    const all = (await readAll()).filter((x) => x.id !== a.id);
    all.unshift(a.toJSON());
    await AsyncStorage.setItem(KEY, JSON.stringify(all.slice(0, 300)));
  } catch {
    /* best effort */
  }
}

export async function placeFromPhone(id: string): Promise<Attraction | null> {
  const j = (await readAll()).find((x) => x.id === id);
  return j ? Attraction.fromJSON(j) : null;
}

export async function placesFromPhone(ids: string[]): Promise<Map<string, Attraction>> {
  const want = new Set(ids);
  const out = new Map<string, Attraction>();
  for (const j of await readAll()) if (want.has(j.id)) out.set(j.id, Attraction.fromJSON(j));
  return out;
}
