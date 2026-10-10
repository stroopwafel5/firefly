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
