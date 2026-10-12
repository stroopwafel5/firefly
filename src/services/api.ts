import { httpsCallable } from 'firebase/functions';
import type { Lang } from '../i18n/localized';
import type { AccessibilitySource, AttractionJSON, EventJSON, EventType, HotelJSON, RestaurantJSON } from '../models';
import { functions, serverConfigured } from './firebase';

/** Thrown by every server call while no Firebase project is configured. */
export class NotConfiguredError extends Error {
  constructor() {
    super('Firefly server not configured');
  }
}

/**
 * Typed wrappers around the Cloud Functions (functions/src). Every third-party key —
 * TripAdvisor, Google Routes/Geocoding, Ticketmaster, SerpApi, PayPal, SMTP — lives on the
 * server; the app never sees it. HOW_TO_TEST.md shows how to call each one directly.
 */

function callable<Req, Res>(name: string, timeout = 60_000) {
  const fn = httpsCallable<Req, Res>(functions, name, { timeout });
  return async (data: Req): Promise<Res> => {
    if (!serverConfigured) throw new NotConfiguredError();
    return (await fn(data)).data;
  };
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface GeocodeResult extends LatLon {
  name: string;
  country: string;
  formatted: string;
}

export interface ReviewJSON {
  id: string;
  title: string;
  text: string;
  rating: number;
  publishedDate: string;
  /** Link to this exact review on TripAdvisor. */
  url: string;
  user: string;
  tripType?: string;
}

export interface SearchEventsRequest extends Partial<LatLon> {
  /** Free text place ("Accra", "Granada, Nicaragua"); geocoded server-side when lat/lon are absent. */
  place?: string;
  /** Free text filter on the event name. */
  query?: string;
  radiusKm: number;
  from: string;
  to: string;
  types?: EventType[];
  lang: Lang;
}

/** How many attractions each source gave (the server's attractionsNear). */
export interface AttractionSources {
  tripadvisor?: number;
  tripadvisorHttp?: number[];
  google?: number;
  wikidata?: number;
  osm?: number;
  backup?: number;
  /** Wikipedia's articles about places to visit (the server's search). */
  wikipedia?: number;
  /** The search looked wider than the town (a quiet area). */
  widened?: boolean;
}

export interface SearchEventsResponse {
  events: EventJSON[];
  /** Which providers answered, e.g. ["firestore", "ticketmaster", "google-events"]. */
  sources: string[];
  center: LatLon & { name?: string };
  cached: boolean;
}

/** The functions the Weekend tab and the trip builder call; see warmUp(). */
const WARM_FUNCTIONS = [
  'geocode', 'placeSuggest', 'reverseGeocode', 'routeLine', 'travelMatrix', 'attractionsNear', 'restaurantsNear',
  'hotelsNear', 'placeSearch', 'searchEvents',
];
let warmedAt = 0;

/**
 * Each server function starts its own small server, which takes a few seconds the first time
 * after a quiet spell ("cold start"). Building a trip calls seven of them one after another, so
 * those waits added up. The app pings them when it opens and when the trip tab is shown; the
 * server answers a ping at once without calling any outside service. At most every 10 minutes.
 */
export function warmUp(): void {
  if (!serverConfigured || Date.now() - warmedAt < 10 * 60_000) return;
  warmedAt = Date.now();
  for (const name of WARM_FUNCTIONS) {
    httpsCallable(functions, name, { timeout: 30_000 })({ warmup: true }).catch(() => undefined);
  }
}

export const api = {
  geocode: callable<{ query: string; lang: Lang }, GeocodeResult | null>('geocode', 20_000),
  reverseGeocode: callable<LatLon & { lang: Lang }, { name: string }>('reverseGeocode', 15_000),
  routeLine: callable<{ from: LatLon; to: LatLon }, { points: Array<[number, number]> } | null>('routeLine', 30_000),
  travelMatrix: callable<
    { points: Array<{ id: string } & LatLon>; mode: 0 | 1; departure?: string },
    { entries: Array<{ from: string; to: string; minutes: number; meters: number }> }
  >('travelMatrix', 60_000),

  /**
   * Tripadvisor + Wikidata, merged on the server. `tripadvisor` says whether Tripadvisor answered
   * ("busy" = over its rate limit, so the list came from the free sources).
   */
  attractionsNear: callable<
    LatLon & { lang: Lang; radiusKm: number; want?: number; landmarks?: boolean; types?: string[] },
    { items: AttractionJSON[]; tripadvisor?: 'ok' | 'busy' | 'off' | 'error'; sources?: AttractionSources }
  >('attractionsNear', 90_000),
  /** Same search, also checking each place for the chosen accessibility needs (answers within ~100 s). */
  attractionsNearAccessible: callable<
    LatLon & { lang: Lang; radiusKm: number; want?: number; needs: string[]; types?: string[] },
    { items: AttractionJSON[]; tripadvisor?: 'ok' | 'busy' | 'off' | 'error'; sources?: AttractionSources }
  >('attractionsNear', 150_000),
  attractionAccessibility: callable<{ id: string; website: string; name?: string; lat?: number; lon?: number }, { needs: string[]; sources: AccessibilitySource[] }>(
    'attractionAccessibility',
  ),
  restaurantsNear: callable<LatLon & { lang: Lang; want?: number }, { items: RestaurantJSON[]; tripadvisor?: 'ok' | 'busy' | 'off' | 'error' }>(
    'restaurantsNear',
    60_000,
  ),
  hotelsNear: callable<
    LatLon & { lang: Lang; checkIn: string; checkOut: string; adults: number; kids: number },
    { items: HotelJSON[] }
  >('hotelsNear'),
  /** Places matching what is typed in the trip form (Hebrew, Russian or English). */
  placeSuggest: callable<{ query: string; lang: Lang; typing?: boolean }, { items: Array<{ name: string; detail: string; lat: number; lon: number; country: string }> }>(
    'placeSuggest',
    15_000,
  ),
  placeSearch: callable<{ query: string; lang: Lang } & Partial<LatLon>, { items: AttractionJSON[] }>('placeSearch'),
  attractionDetails: callable<{ id: string; lang: Lang }, { attraction: AttractionJSON; reviews: ReviewJSON[] }>(
    'attractionDetails',
  ),

  // The screen already shows saved events while this runs; past 45 s it keeps those.
  searchEvents: callable<SearchEventsRequest, SearchEventsResponse>('searchEvents', 45_000),
  setGoing: callable<{ eventId: string; going: boolean; event?: EventJSON }, { ok: true }>('setGoing'),
  /** Keeps a copy of an event the user favourited, so it stays in their profile after it leaves search. */
  saveEvent: callable<{ event: EventJSON }, { ok: true }>('saveEvent'),
  /** "Take me anywhere": Ticketmaster's events within 1,500 km on the dates (functions/src/events/around.ts). */
  eventsAround: callable<LatLon & { from: string; to: string; lang: Lang }, { events: EventJSON[] }>('eventsAround', 45_000),
  reportPhoto: callable<{ url: string; sourcePage: string; itemId: string; reason: string }, { ok: true }>('reportPhoto'),

  createPaypalOrder: callable<{ bookingId: string }, { orderId: string; approveUrl: string }>('createPaypalOrder'),
  /** Grow card payment page for a booking (amount in shekels from the catalogue). */
  createGrowPayment: callable<{ bookingId: string }, { url: string; amountIls: number }>('createGrowPayment'),
  capturePaypalOrder: callable<{ bookingId: string; orderId: string }, { status: string }>('capturePaypalOrder'),

  sendFriendRequest: callable<{ toUid: string }, { ok: true }>('sendFriendRequest'),
  respondFriendRequest: callable<{ fromUid: string; accept: boolean }, { ok: true }>('respondFriendRequest'),
  addTripPeople: callable<{ tripId: string; uids: string[] }, { ok: true }>('addTripPeople'),

  kidify: callable<{ text: string; lang: Lang; title: string }, { text: string | null }>('kidify'),
};
