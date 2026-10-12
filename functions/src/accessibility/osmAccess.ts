import { km, nameSimilarity } from '../attractions/merge';
import type { Need } from './phrases';

/**
 * Accessibility from OpenStreetMap: the tags mappers (often disability groups — Wheelmap,
 * local blind and deaf associations) put on museums, parks and monuments. Each tag is a
 * statement about one need only, shown with a link to the map feature so anyone can check it:
 *   physical  wheelchair=yes|designated
 *   blind     blind=yes|designated · tactile_paving=yes · braille=yes · blind:description=…
 *   hearing   hearing_loop=yes · deaf=yes|designated · deaf:description=…
 *   autism    sensory_friendly=yes · sensory_friendly:*=… · quiet_hours=…
 * Only the needs asked about are looked up. Pure (query, reading, matching), unit-tested.
 */

const NEED_KEYS: Record<Need, string[]> = {
  physical: ['wheelchair'],
  blind: ['blind', 'tactile_paving', 'braille', 'blind:description.*'],
  hearing: ['hearing_loop', 'deaf', 'deaf:description.*'],
  autism: ['sensory_friendly', 'sensory_friendly:.*', 'quiet_hours'],
};

/** Places to visit with any of the needs' tags, within `radiusKm` (at most 15). */
export function accessQuery(lat: number, lon: number, radiusKm: number, needs: readonly Need[], limit = 600): string {
  const m = Math.round(Math.max(1, Math.min(15, radiusKm)) * 1000);
  const a = `(around:${m},${lat.toFixed(5)},${lon.toFixed(5)})`;
  const keys = needs.flatMap((n) => NEED_KEYS[n]);
  const tag = `[~"^(${keys.join('|')})$"~"."]`;
  return `[out:json][timeout:20];
(
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|aquarium|theme_park)$"]["name"]${tag}${a};
  nwr["historic"]["name"]${tag}${a};
  nwr["leisure"~"^(park|garden|nature_reserve|water_park|beach_resort)$"]["name"]${tag}${a};
  nwr["amenity"~"^(theatre|arts_centre|planetarium|place_of_worship|library)$"]["name"]${tag}${a};
  nwr["natural"="beach"]["name"]${tag}${a};
);
out center tags ${limit};`;
}

export interface MapAccess {
  names: string[];
  wikidata?: string;
  location: { locLat: number; locLon: number };
  url: string;
  /** Per need: the tag that says so ("wheelchair=yes"). */
  found: Partial<Record<Need, string>>;
}

const YES = /^(yes|designated)$/i;

/** What a feature's tags say, need by need (only clear statements count; "limited" and "no" don't). */
export function needsFromTags(t: Record<string, string>, needs: readonly Need[]): Partial<Record<Need, string>> {
  const out: Partial<Record<Need, string>> = {};
  const has = (k: string) => (t[k] ? `${k}=${t[k]}` : undefined);
  const yes = (k: string) => (t[k] && YES.test(t[k]) ? `${k}=${t[k]}` : undefined);
  const prefixed = (p: string) => {
    const k = Object.keys(t).find((x) => x.startsWith(p) && t[x].trim() && !/^no$/i.test(t[x]));
    return k ? `${k}=${t[k].slice(0, 120)}` : undefined;
  };
  for (const n of needs) {
    const hit =
      n === 'physical'
        ? yes('wheelchair')
        : n === 'blind'
          ? (yes('blind') ?? yes('tactile_paving') ?? yes('braille') ?? prefixed('blind:description'))
          : n === 'hearing'
            ? (yes('hearing_loop') ?? yes('deaf') ?? prefixed('deaf:description'))
            : (yes('sensory_friendly') ?? prefixed('sensory_friendly:') ?? (t.quiet_hours && !/^no$/i.test(t.quiet_hours) ? has('quiet_hours') : undefined));
    if (hit) out[n] = hit;
  }
  return out;
}

export interface OverpassAccessJson {
  elements?: Array<{ type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }>;
}

export function readMapAccess(j: OverpassAccessJson, needs: readonly Need[]): MapAccess[] {
  const out: MapAccess[] = [];
  for (const e of j.elements ?? []) {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null || !t.name) continue;
    const found = needsFromTags(t, needs);
    if (!Object.keys(found).length) continue;
    const names = [...new Set(Object.entries(t).filter(([k, v]) => (k === 'name' || k.startsWith('name:') || k === 'int_name' || k === 'alt_name') && !!v).map(([, v]) => v))];
    out.push({
      names,
      wikidata: /^Q\d+$/.test(t.wikidata ?? '') ? t.wikidata : undefined,
      location: { locLat: lat, locLon: lon },
      url: `https://www.openstreetmap.org/${e.type}/${e.id}`,
      found,
    });
  }
  return out;
}

/**
 * The map feature that is this attraction: the same Wikidata item, or close by with a similar
 * name in any of the map's languages (the map's name may be Arabic or Hebrew, the attraction's
 * English), or practically on the same spot.
 */
export function mapFeatureFor(a: { name: string; location: { locLat: number; locLon: number }; wikidataId?: string }, list: MapAccess[]): MapAccess | undefined {
  const latin = (x: string) => /[a-z]/i.test(x);
  let best: MapAccess | undefined;
  let bestScore = 0;
  for (const f of list) {
    // Both linked to Wikidata: the same item or not the same place at all.
    if (a.wikidataId && f.wikidata) {
      if (a.wikidataId === f.wikidata) return f;
      continue;
    }
    const d = km(a.location, f.location);
    if (d > 1.5) continue;
    // Names in the same script can be compared; an Arabic-only map name and an English name can't.
    const comparable = f.names.some((n) => latin(n) === latin(a.name));
    const sim = Math.max(0, ...f.names.map((n) => nameSimilarity(a.name, n)));
    const ok = comparable ? (d < 0.4 && sim >= 0.5) || sim >= 0.8 || d < 0.015 : d < 0.025;
    const score = sim + (0.4 - Math.min(0.4, d));
    if (ok && score > bestScore) [best, bestScore] = [f, score];
  }
  return best;
}
