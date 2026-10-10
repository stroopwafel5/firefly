import { sha1 } from '../hash';
import { bookingUrl } from './bookingCom';
import { HotelOut, Lang, Stay } from './types';

/**
 * Google Hotels via SerpApi (engine=google_hotels): live prices for the exact dates and party,
 * compared across Agoda, Booking.com, Expedia and the hotels' own sites. Pure, unit-tested.
 * Docs: https://serpapi.com/google-hotels-api
 */

export interface GhProperty {
  type?: string;
  name?: string;
  description?: string;
  link?: string;
  property_token?: string;
  gps_coordinates?: { latitude?: number; longitude?: number };
  rate_per_night?: { lowest?: string; extracted_lowest?: number };
  total_rate?: { lowest?: string; extracted_lowest?: number };
  prices?: Array<{ source?: string; rate_per_night?: { extracted_lowest?: number } }>;
  hotel_class?: string;
  extracted_hotel_class?: number;
  images?: Array<{ thumbnail?: string; original_image?: string }>;
  overall_rating?: number;
  reviews?: number;
}

export interface GhResponse {
  properties?: GhProperty[];
  error?: string;
  search_metadata?: { status?: string; google_hotels_url?: string };
}

const HL: Record<Lang, string> = { en: 'en', he: 'iw', ru: 'ru' };

export function googleHotelsUrl(q: string, stay: Stay, lang: Lang, key: string, opts: { currency?: string; gl?: string } = {}): string {
  const p = new URLSearchParams({
    engine: 'google_hotels',
    q,
    check_in_date: stay.checkIn,
    check_out_date: stay.checkOut,
    adults: String(Math.max(1, stay.adults)),
    currency: opts.currency ?? 'EUR',
    hl: HL[lang],
    api_key: key,
  });
  if (stay.kids > 0) {
    p.set('children', String(stay.kids));
    // Ages aren't known when planning: 10 is used, as on the Booking.com link.
    p.set('children_ages', Array.from({ length: stay.kids }, () => '10').join(','));
  }
  if (opts.gl) p.set('gl', opts.gl.toLowerCase());
  return `https://serpapi.com/search.json?${p}`;
}

export function mapGoogleHotels(j: GhResponse, stay: Stay, lang: Lang, city: string, aid = '', currency = 'EUR'): HotelOut[] {
  const props = j.properties ?? [];
  const hotels = props.filter((p) => !p.type || p.type === 'hotel');
  const out: HotelOut[] = [];
  for (const p of hotels.length ? hotels : props) {
    const lat = p.gps_coordinates?.latitude;
    const lon = p.gps_coordinates?.longitude;
    if (!p.name || typeof lat !== 'number' || typeof lon !== 'number') continue;
    const bookingCom = bookingUrl(p.name, city, stay.checkIn, stay.checkOut, stay.adults, stay.kids, lang, aid);
    const photos = (p.images ?? []).map((i) => i.original_image ?? i.thumbnail).filter((u): u is string => !!u).slice(0, 3);
    out.push({
      id: `gh-${sha1(p.property_token ?? `${p.name}|${lat}|${lon}`).slice(0, 16)}`,
      name: p.name,
      description: p.description ?? p.hotel_class ?? '',
      photos,
      photoSources: photos.map((url) => ({ url, sourcePage: p.link ?? bookingCom, credit: 'Hotel photo via Google Hotels' })),
      price: p.rate_per_night?.extracted_lowest ?? null,
      currency: p.rate_per_night?.extracted_lowest != null ? currency : undefined,
      linkToBooking: p.link ?? bookingCom,
      bookingVia: p.link ? 'website' : 'booking.com',
      linkToBookingCom: bookingCom,
      linkToListing: '',
      locLat: lat,
      locLon: lon,
      rating: p.overall_rating,
      source: 'google-hotels',
    });
  }
  return out;
}
