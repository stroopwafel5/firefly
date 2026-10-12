import { KIND_TYPES, Kind, kindFromText, NOT_A_SIGHT, isOrganization } from './kinds';
import { AttractionOut, WeeklyHours, taPopularity, typicalHours } from './merge';
import { visitMinutesFor } from './wikidata';

/**
 * Google Places API (New) — sights anywhere in the world, the countryside included, with their
 * rating, opening hours (Google's, kept up to date by the places themselves) and a short
 * description. Uses the server key (GOOGLE_SERVER_KEY) with "Places API (New)" enabled in Google
 * Cloud; without it the server simply skips this source. Google's terms don't allow storing its
 * content, so nothing from here is cached in Firestore. Pure (request building and mapping),
 * unit-tested.
 */

export const PLACES_NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';

/** Place types of sights (Places API "Table A"). */
export const SIGHT_TYPES = ['tourist_attraction', 'museum', 'art_gallery', 'park', 'zoo', 'aquarium', 'amusement_park', 'national_park'];

/** Google types of businesses that sell trips or rooms rather than being a place to visit. */
const SELLER_TYPES: ReadonlySet<string> = new Set([
  'travel_agency', 'tour_agency', 'lodging', 'hotel', 'motel', 'hostel', 'guest_house', 'bed_and_breakfast', 'resort_hotel',
  'cottage', 'farmstay', 'private_guest_room', 'campground', 'car_rental', 'taxi_stand', 'transit_station',
]);

export const PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.primaryType',
  'places.types',
  'places.editorialSummary',
  'places.regularOpeningHours',
  'places.googleMapsUri',
  'places.websiteUri',
  'places.formattedAddress',
  'places.photos',
  'places.businessStatus',
  'places.addressComponents',
  // Same price tier as the website field above (Pro ≤ Enterprise): wheelchair access, for travellers who need it.
  'places.accessibilityOptions',
].join(',');

const GOOGLE_LANG = { en: 'en', he: 'he', ru: 'ru' } as const;
export type Lang = keyof typeof GOOGLE_LANG;

/** The best-known sights within `radiusKm` (at most 20, Google's page size; 50 km at most). */
export function nearbyBody(lat: number, lon: number, radiusKm: number, lang: Lang, types: string[] = SIGHT_TYPES, rank: 'POPULARITY' | 'DISTANCE' = 'POPULARITY') {
  return {
    includedTypes: types,
    maxResultCount: 20,
    rankPreference: rank,
    languageCode: GOOGLE_LANG[lang],
    locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: Math.round(Math.max(0.5, Math.min(50, radiusKm)) * 1000) } },
  };
}

interface Point {
  day: number;
  hour: number;
  minute?: number;
}
export interface GPlace {
  id: string;
  displayName?: { text: string; languageCode?: string };
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  types?: string[];
  editorialSummary?: { text: string };
  regularOpeningHours?: { periods?: Array<{ open: Point; close?: Point }>; weekdayDescriptions?: string[] };
  googleMapsUri?: string;
  websiteUri?: string;
  accessibilityOptions?: {
    wheelchairAccessibleEntrance?: boolean;
    wheelchairAccessibleParking?: boolean;
    wheelchairAccessibleRestroom?: boolean;
    wheelchairAccessibleSeating?: boolean;
  };
  formattedAddress?: string;
  photos?: Array<{ name: string; authorAttributions?: Array<{ displayName?: string; uri?: string }> }>;
  businessStatus?: string;
  addressComponents?: Array<{ shortText?: string; types?: string[] }>;
}

/** Google's periods (day 0 = Sunday) → the week Firefly plans with. Open without a close = open all the time. */
export function weeklyFromGoogle(h: GPlace['regularOpeningHours']): WeeklyHours | undefined {
  const periods = h?.periods ?? [];
  if (!periods.length) return undefined;
  const week: WeeklyHours = [[], [], [], [], [], [], []];
  for (const p of periods) {
    if (!p.open || p.open.day == null) continue;
    if (!p.close) return week.map(() => [{ open: 0, close: 1440 }]); // 24/7
    const open = p.open.hour * 60 + (p.open.minute ?? 0);
    let close = p.close.hour * 60 + (p.close.minute ?? 0) + ((p.close.day - p.open.day + 7) % 7) * 1440;
    if (close <= open) close += 1440;
    week[p.open.day].push({ open, close });
  }
  return week.some((d) => d.length) ? week : undefined;
}

const TYPE_KIND: Array<[string, Kind]> = [
  ['national_park', 'nationalpark'],
  ['amusement_park', 'themepark'],
  ['water_park', 'themepark'],
  ['zoo', 'zoo'],
  ['aquarium', 'aquarium'],
  ['art_gallery', 'gallery'],
  ['museum', 'museum'],
  ['church', 'church'],
  ['synagogue', 'synagogue'],
  ['mosque', 'mosque'],
  ['hindu_temple', 'church'],
  ['botanical_garden', 'garden'],
  ['garden', 'garden'],
  ['beach', 'beach'],
  ['hiking_area', 'reserve'],
  ['park', 'park'],
  ['historical_landmark', 'monument'],
  ['monument', 'monument'],
  ['castle', 'castle'],
  ['observation_deck', 'viewpoint'],
  // Asked for only when the traveller chose these types (EXTRA_TYPES).
  ['adventure_sports_center', 'adventure'],
  ['ski_resort', 'adventure'],
  ['go_karting_venue', 'adventure'],
  ['paintball_center', 'adventure'],
  ['off_roading_area', 'adventure'],
  ['night_club', 'nightlife'],
  ['shopping_mall', 'shopping'],
  ['department_store', 'shopping'],
  ['market', 'market'],
  ['flea_market', 'market'],
  ['coffee_shop', 'food'],
  ['cafe', 'food'],
  ['dessert_shop', 'food'],
  ['ice_cream_shop', 'food'],
  ['bakery', 'food'],
  ['chocolate_shop', 'food'],
  ['confectionery', 'food'],
  ['tea_house', 'food'],
];

/**
 * Google types searched besides the sights when the traveller chose one of these trip types
 * (one extra search for all of them together, up to 20 places).
 */
export const EXTRA_TYPES: Record<string, string[]> = {
  Shopping: ['shopping_mall', 'market', 'flea_market', 'department_store'],
  Beaches: ['beach'],
  'Extreme Sport': ['adventure_sports_center', 'ski_resort', 'go_karting_venue', 'paintball_center', 'off_roading_area'],
  'Night Clubs': ['night_club'],
  Food: ['coffee_shop', 'cafe', 'dessert_shop', 'ice_cream_shop', 'bakery', 'chocolate_shop', 'confectionery', 'tea_house', 'market'],
};

/** The extra Google types for the chosen trip types (none when nothing extra was chosen). */
export function extraTypesFor(types: readonly string[]): string[] {
  return [...new Set(types.flatMap((t) => EXTRA_TYPES[t] ?? []))].slice(0, 50);
}

/** The kind from Google's types, else from the name (castle, ruins, waterfall…). */
export function googleKind(p: GPlace): Kind {
  const types = [p.primaryType ?? '', ...(p.types ?? [])];
  for (const [t, k] of TYPE_KIND) if (types.includes(t)) return k === 'park' || k === 'monument' ? refine(k, p) : k;
  return refine('other', p);
}
function refine(k: Kind, p: GPlace): Kind {
  const byName = kindFromText(p.displayName?.text ?? '');
  return byName !== 'other' && byName !== 'food' ? byName : k;
}

/**
 * A Google place as Firefly's attraction JSON (same shape as the other sources). The photo is
 * fetched later, only for the places that end up in the answer without one (`googlePhoto`).
 */
/**
 * Google Maps' wheelchair information, as the words shown to the traveller ("wheelchair-accessible
 * entrance, toilet"), when the entrance is accessible; otherwise nothing (a toilet or parking
 * alone doesn't make a place usable).
 */
export function wheelchairNote(p: Pick<GPlace, 'accessibilityOptions'>): string | undefined {
  const o = p.accessibilityOptions;
  if (!o?.wheelchairAccessibleEntrance) return undefined;
  const extra = [o.wheelchairAccessibleRestroom && 'toilet', o.wheelchairAccessibleParking && 'parking', o.wheelchairAccessibleSeating && 'seating'].filter(Boolean);
  return `Wheelchair-accessible entrance${extra.length ? `, ${extra.join(', ')}` : ''}`;
}

export function googleToAttraction(p: GPlace, allow: ReadonlySet<Kind> = new Set()): AttractionOut | null {
  const name = p.displayName?.text?.trim();
  if (!name || !p.location || p.businessStatus === 'CLOSED_PERMANENTLY' || p.businessStatus === 'CLOSED_TEMPORARILY') return null;
  const kind = googleKind(p);
  // Shops and night clubs only when the traveller chose them (`allow`).
  if (NOT_A_SIGHT.has(kind) && !allow.has(kind)) return null;
  // Agencies, tour sellers and lodging that Google also tags as "tourist attraction".
  if ((p.types ?? []).some((t) => SELLER_TYPES.has(t)) && !SIGHT_TYPES.includes(p.primaryType ?? '')) return null;
  if (isOrganization({ name, category: (p.primaryType ?? '').replace(/_/g, ' '), description: p.editorialSummary?.text })) return null;
  const week = weeklyFromGoogle(p.regularOpeningHours);
  const summary = p.editorialSummary?.text?.trim() ?? '';
  return {
    id: `g-${p.id}`,
    name,
    description: summary,
    descriptionSource: summary ? 'google' : undefined,
    types: KIND_TYPES[kind],
    country: p.addressComponents?.find((c) => c.types?.includes('country'))?.shortText ?? '',
    price: null,
    link: p.googleMapsUri ?? `https://www.google.com/maps/place/?q=place_id:${p.id}`,
    photo_urls: [],
    photoSources: [],
    location: { locLat: p.location.latitude, locLon: p.location.longitude },
    openingHours: typicalHours(week),
    weeklyHours: week,
    hoursSource: week ? 'google' : undefined,
    rating: p.rating,
    numReviews: p.userRatingCount,
    provider: 'google',
    category: (p.primaryType ?? '').replace(/_/g, ' '),
    kind,
    popularity: taPopularity(p.rating, p.userRatingCount),
    suggestedMinutes: visitMinutesFor(kind),
    address: p.formattedAddress ?? '',
    website: p.websiteUri ?? '',
    /** What Google Maps says about wheelchair access (only with an accessible entrance). */
    wheelchair: wheelchairNote(p),
    googlePhoto: p.photos?.[0]?.name,
    googlePhotoCredit: p.photos?.[0] ? photoCredit(p) : undefined,
  };
}

/** The URL that turns a photo's name into a link that needs no key (one request per photo). */
export function photoMediaUrl(photoName: string, key: string, width = 800): string {
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${width}&skipHttpRedirect=true&key=${encodeURIComponent(key)}`;
}

/** Credit line for a Google photo: its author, as Google asks. */
export function photoCredit(p: GPlace): { credit: string; sourcePage: string } {
  const a = p.photos?.[0]?.authorAttributions?.[0];
  return { credit: [a?.displayName, 'Google Maps'].filter(Boolean).join(' · '), sourcePage: a?.uri || p.googleMapsUri || 'https://maps.google.com' };
}

/* ---------------- restaurants: only what Google Maps itself calls a restaurant ---------------- */

/** Google's own place types of somewhere to sit down for a meal (besides every "…_restaurant"). */
const MEAL_TYPES = new Set(['restaurant', 'bistro', 'brasserie', 'diner', 'gastropub', 'steak_house', 'bar_and_grill', 'cafeteria', 'food_court', 'pub', 'tavern', 'canteen']);
/** Google types that make a place something else first: lodging, tours, transport, shops. */
const NOT_MEAL_TYPES = /^(lodging|hotel|motel|hostel|resort_hotel|extended_stay_hotel|bed_and_breakfast|guest_house|inn|cottage|budget_japanese_inn|private_guest_room|campground|farmstay|apartment_building|travel_agency|tour_agency|tourist_information_center|taxi_stand|car_rental|transit_station|bus_station|train_station|airport|museum|art_gallery|church|night_club|store|shopping_mall|supermarket|grocery_store)$/;

/**
 * Does Google Maps say this is a restaurant? Its main type must be a restaurant type ("restaurant",
 * "italian_restaurant", "bistro"…); a hotel, tour agency, chauffeur or shop is not one, even when
 * another source lists it among restaurants. Without a main type, "restaurant" must be among its
 * types and nothing above.
 */
export function isGoogleRestaurant(p: GPlace): boolean {
  if (p.businessStatus === 'CLOSED_PERMANENTLY' || p.businessStatus === 'CLOSED_TEMPORARILY') return false;
  const primary = p.primaryType ?? '';
  if (primary) return MEAL_TYPES.has(primary) || primary.endsWith('_restaurant');
  const types = p.types ?? [];
  return types.includes('restaurant') && !types.some((t) => NOT_MEAL_TYPES.test(t));
}

/** "italian_restaurant" → "Italian". */
function cuisineOf(p: GPlace): string[] {
  const m = /^(.+)_restaurant$/.exec(p.primaryType ?? '');
  if (!m || /^(fine_dining|brunch|buffet|fast_food|family)$/.test(m[1])) return [];
  return [m[1].replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())];
}

/** A Google Maps restaurant → Firefly's restaurant JSON (link: its Google Maps page). */
export function googleToRestaurant(p: GPlace) {
  const week = weeklyFromGoogle(p.regularOpeningHours);
  return {
    id: `g-${p.id}`,
    name: p.displayName?.text?.trim() ?? '',
    description: p.editorialSummary?.text?.trim() ?? '',
    photos: [] as string[],
    photoSources: [] as Array<{ url: string; sourcePage: string; credit: string }>,
    linkToPage: p.googleMapsUri ?? `https://www.google.com/maps/place/?q=place_id:${p.id}`,
    location: { locLat: p.location?.latitude ?? 0, locLon: p.location?.longitude ?? 0 },
    openingHours: typicalHours(week),
    weeklyHours: week,
    cuisine: cuisineOf(p),
    priceLevel: '',
    rating: p.rating,
  };
}
