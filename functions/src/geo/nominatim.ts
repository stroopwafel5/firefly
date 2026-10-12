/**
 * OpenStreetMap Nominatim: the free fallback geocoder, used only when no Google server key is
 * configured (or Google refuses the request). Pure URL building and parsing, unit-tested.
 * Usage policy (https://operations.osmfoundation.org/policies/nominatim/): at most 1 request
 * per second, an identifying User-Agent, and results cached — all done in google.ts.
 */

export const NOMINATIM_UA = 'Firefly/1.0 (+https://www.differentroute.net)';
const LANG = { en: 'en', he: 'he', ru: 'ru' } as const;

export function nominatimSearchUrl(query: string, lang: keyof typeof LANG): string {
  const p = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1', addressdetails: '1', 'accept-language': LANG[lang] });
  return `https://nominatim.openstreetmap.org/search?${p}`;
}

export function nominatimReverseUrl(lat: number, lon: number, lang: keyof typeof LANG): string {
  const p = new URLSearchParams({ lat: String(lat), lon: String(lon), format: 'jsonv2', zoom: '10', addressdetails: '1', 'accept-language': LANG[lang] });
  return `https://nominatim.openstreetmap.org/reverse?${p}`;
}

export interface NominatimPlace {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

const placeName = (p: NominatimPlace) =>
  p.address?.city ?? p.address?.town ?? p.address?.village ?? p.address?.municipality ?? p.name ?? p.address?.county ?? p.address?.state ?? '';

export function parseNominatimSearch(j: NominatimPlace[] | null) {
  const r = j?.[0];
  const lat = Number(r?.lat);
  const lon = Number(r?.lon);
  if (!r || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    lat,
    lon,
    name: placeName(r) || (r.display_name ?? '').split(',')[0],
    country: (r.address?.country_code ?? '').toUpperCase(),
    formatted: r.display_name ?? '',
  };
}

export function parseNominatimReverse(j: NominatimPlace | null): { name: string; country: string } {
  return { name: j ? placeName(j) : '', country: (j?.address?.country_code ?? '').toUpperCase() };
}

/* ---------------- place suggestions (the trip form's start / end field) ---------------- */

export interface PlaceSuggestion {
  name: string;
  /** Region and country, to tell places with the same name apart. */
  detail: string;
  lat: number;
  lon: number;
  country: string;
}

export function nominatimSuggestUrl(query: string, lang: keyof typeof LANG, limit = 6): string {
  const p = new URLSearchParams({ q: query, format: 'jsonv2', limit: String(limit), addressdetails: '1', 'accept-language': LANG[lang] });
  return `https://nominatim.openstreetmap.org/search?${p}`;
}

type NominatimHit = NominatimPlace & { category?: string; type?: string; addresstype?: string; importance?: number };

/** Towns and cities first, then other places (a park, an airport…), most important first. */
export function parseNominatimSuggestions(j: NominatimHit[] | null): PlaceSuggestion[] {
  const settlement = (h: NominatimHit) => (['city', 'town', 'village', 'municipality', 'hamlet'].includes(h.addresstype ?? h.type ?? '') ? 1 : 0);
  return (j ?? [])
    .filter((h) => Number.isFinite(Number(h.lat)) && Number.isFinite(Number(h.lon)))
    .sort((a, b) => settlement(b) - settlement(a) || (b.importance ?? 0) - (a.importance ?? 0))
    .map((h) => {
      const name = h.name || placeName(h) || (h.display_name ?? '').split(',')[0];
      const detail = [h.address?.state, h.address?.country].filter((x) => x && x !== name).join(', ');
      return { name, detail, lat: Number(h.lat), lon: Number(h.lon), country: (h.address?.country_code ?? '').toUpperCase() };
    })
    .filter((s) => !!s.name);
}

/** One list without repeats: the same name within 3 km, or anything within 500 m, is the same place. */
export function mergeSuggestions(lists: PlaceSuggestion[][], max = 6): PlaceSuggestion[] {
  const out: PlaceSuggestion[] = [];
  const within = (a: PlaceSuggestion, b: PlaceSuggestion, deg: number) => Math.abs(a.lat - b.lat) < deg && Math.abs(a.lon - b.lon) < deg * 1.4;
  for (const s of lists.flat()) {
    if (out.some((o) => within(o, s, 0.005) || (within(o, s, 0.03) && o.name.toLowerCase() === s.name.toLowerCase()))) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}
