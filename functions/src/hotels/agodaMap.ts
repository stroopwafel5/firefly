import { bookingUrl } from './bookingCom';
import { HotelOut, Lang, Stay } from './types';

/**
 * Agoda Affiliate Lite API ("Long Tail Search", lt_v1): hotel prices for a city and dates, with
 * an affiliate landing URL for each hotel. Needs an Agoda affiliate Site ID + API key
 * (HOW_TO_TEST.md §2 → "Agoda") and Agoda's numeric city id for each destination
 * (Firestore agodaCities, filled with scripts/agodaCity.ts). Pure, unit-tested.
 * Reference: https://partners.agoda.com/Content/Documents/AffiliateLiteApi/Affiliate_Lite_API_V2.0.pdf
 */

/** Agoda's documented endpoint is plain HTTP; ask the account manager for HTTPS (AGODA_ENDPOINT). */
export const AGODA_LITE_URL = 'http://affiliateapi7643.agoda.com/affiliateservice/lt_v1';

const LANGUAGE: Record<Lang, string> = { en: 'en-us', he: 'he-il', ru: 'ru-ru' };

export function agodaHeaders(siteId: string, apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip,deflate', Authorization: `${siteId}:${apiKey}` };
}

export function agodaCityRequest(cityId: number, stay: Stay, lang: Lang, opts: { currency?: string; family?: boolean; maxResult?: number } = {}) {
  return {
    criteria: {
      additional: {
        currency: opts.currency ?? 'EUR',
        dailyRate: { minimum: 1, maximum: 100000 },
        discountOnly: false,
        language: LANGUAGE[lang],
        maxResult: Math.min(30, Math.max(1, opts.maxResult ?? 10)),
        minimumReviewScore: 0,
        minimumStarRating: 0,
        occupancy: {
          numberOfAdult: Math.max(1, stay.adults),
          numberOfChildren: stay.kids,
          ...(stay.kids > 0 ? { childrenAges: Array.from({ length: stay.kids }, () => 10) } : {}),
        },
        sortBy: opts.family ? 'FamiliesWithYoungReviewScore' : 'AllGuestsReviewScore',
      },
      checkInDate: stay.checkIn,
      checkOutDate: stay.checkOut,
      cityId,
    },
  };
}

export interface AgodaResult {
  hotelId?: number;
  hotelName?: string;
  starRating?: number;
  reviewScore?: number;
  reviewCount?: number;
  currency?: string;
  dailyRate?: number;
  imageURL?: string;
  landingURL?: string;
  includeBreakfast?: boolean;
  freeWifi?: boolean;
  latitude?: number;
  longitude?: number;
}

export interface AgodaResponse {
  results?: AgodaResult[];
  error?: { id?: number; message?: string };
}

/**
 * Agoda results → hotels. The Lite API doesn't always return coordinates; `locate` supplies them
 * (geocoding "hotel name, city"), and hotels that can't be placed on the map are skipped.
 */
export function mapAgoda(
  j: AgodaResponse,
  stay: Stay,
  lang: Lang,
  city: string,
  locate: (r: AgodaResult) => { lat: number; lon: number } | null,
  aid = '',
): HotelOut[] {
  const out: HotelOut[] = [];
  for (const r of j.results ?? []) {
    if (!r.hotelId || !r.hotelName || !r.landingURL) continue;
    const pos = typeof r.latitude === 'number' && typeof r.longitude === 'number' ? { lat: r.latitude, lon: r.longitude } : locate(r);
    if (!pos) continue;
    const photos = r.imageURL ? [r.imageURL] : [];
    const extras = [r.includeBreakfast ? 'breakfast included' : '', r.freeWifi ? 'free Wi-Fi' : ''].filter(Boolean).join(' · ');
    out.push({
      id: `agoda-${r.hotelId}`,
      name: r.hotelName,
      description: [r.starRating ? `${r.starRating}★` : '', extras].filter(Boolean).join(' · '),
      photos,
      photoSources: photos.map((url) => ({ url, sourcePage: r.landingURL!, credit: 'Agoda' })),
      price: typeof r.dailyRate === 'number' ? Math.round(r.dailyRate) : null,
      currency: r.currency,
      linkToBooking: r.landingURL,
      bookingVia: 'agoda',
      linkToBookingCom: bookingUrl(r.hotelName, city, stay.checkIn, stay.checkOut, stay.adults, stay.kids, lang, aid),
      linkToListing: '',
      locLat: pos.lat,
      locLon: pos.lon,
      rating: typeof r.reviewScore === 'number' ? Math.round((r.reviewScore / 2) * 10) / 10 : undefined,
      source: 'agoda',
    });
  }
  return out;
}

/** Key for agodaCities/{key}: country code + city name, lower-case, no accents. */
export function agodaCityKey(country: string, city: string): string {
  const norm = city
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
  return `${country.toLowerCase()}_${norm}`;
}
