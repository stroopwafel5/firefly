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
