/** Mirrors src/models/Event.ts → EventJSON in the app (keep in sync). */
export const EVENT_TYPES = ['Family', 'Nature', 'History', 'Theatre', 'Festival', 'Food', 'Tour', 'Kid Friendly'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface PhotoSource {
  url: string;
  sourcePage: string;
  credit: string;
  license?: string;
}

export interface EventJSON {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  types: EventType[];
  country: string;
  price: number | null;
  link: string;
  photo_urls: string[];
  location: { locLat: number; locLon: number };
  photoSources: PhotoSource[];
  bookingLink?: string;
  venue: string;
  address: string;
  priceText?: string;
  currency?: string;
  startTime?: string;
  endTime?: string;
  datesConfirmed?: boolean;
  origin: 'curated' | 'admin' | 'ticketmaster' | 'google-events';
  sourceName: string;
}

export interface SearchArgs {
  lat: number;
  lon: number;
  placeName: string;
  country: string;
  radiusKm: number;
  from: string;
  to: string;
  query?: string;
  lang: 'en' | 'he' | 'ru';
}

/** Listings that are not physical: livestreams, webinars, virtual/online-only. */
export const ONLINE_PATTERN =
  /\b(online|virtual|livestream|live stream|live-stream|webinar|zoom|streaming only|stream)\b|אונליין|וירטואלי|онлайн|трансляци/i;

/** Same rules as the app's validateEvent (src/models/Event.ts). */
export function validateEvent(e: EventJSON): string[] {
  const p: string[] = [];
  const isHttp = (u?: string) => !!u && /^https?:\/\/[^\s]+\.[^\s]+/.test(u);
  if (!e.name?.trim()) p.push('missingName');
  if (!isHttp(e.link)) p.push('missingSourceLink');
  if (!e.venue?.trim() || !e.address?.trim()) p.push('missingVenue');
  const { locLat, locLon } = e.location ?? { locLat: NaN, locLon: NaN };
  if (!Number.isFinite(locLat) || !Number.isFinite(locLon) || (locLat === 0 && locLon === 0) || Math.abs(locLat) > 90 || Math.abs(locLon) > 180) {
    p.push('missingMapPin');
  }
  if (ONLINE_PATTERN.test(`${e.name} ${e.venue} ${e.address}`)) p.push('onlineEvent');
  if (!e.photo_urls?.length) p.push('missingPhoto');
  if (e.photo_urls?.length !== e.photoSources?.length || e.photoSources.some((s) => !isHttp(s.sourcePage) || !s.credit?.trim())) {
    p.push('missingPhotoSource');
  }
  if (!e.types?.length) p.push('missingType');
  if (!e.startDate || !e.endDate || e.endDate < e.startDate) p.push('badDates');
  return p;
}

/** Keyword typing for providers that don't classify (titles in English, Hebrew or Russian). */
const TYPE_RULES: Array<[EventType, RegExp]> = [
  ['Festival', /festival|fest\b|carnival|parade|concert|party|dj\b|live music|jazz|rock|gig|פסטיבל|הופעה|מסיבה|קרנבל|מצעד|фестивал|концерт|вечеринк|карнавал|парад/i],
  ['Theatre', /theat|opera|ballet|musical|play\b|comedy|stand-?up|circus|show\b|תיאטרון|הצגה|אופרה|מחזמר|סטנדאפ|קרקס|театр|спектакл|опер|балет|мюзикл|цирк|стендап/i],
  ['Food', /food|wine|beer|culinary|tasting|market|street food|chef|אוכל|יין|בירה|שוק|קולינר|ед[аы]|вин|пив|ярмарк|рынок|гастро/i],
  ['Family', /family|kids|children|puppet|zoo|aquarium|משפחה|ילדים|בובות|גן חיות|семей|дет|кукол|зоопарк/i],
  ['Kid Friendly', /kids|children|puppet|zoo|aquarium|ילדים|בובות|גן חיות|дет|кукол|зоопарк/i],
  ['Tour', /tour|walk|walking|excursion|guided|סיור|הליכה|экскурси|прогулк/i],
  ['History', /museum|history|heritage|exhibition|exhibit|gallery|archae|מוזיאון|היסטור|מורשת|תערוכה|גלריה|музе|истор|выставк|галере/i],
  ['Nature', /nature|hike|garden|park|bird|forest|beach|טבע|טיול רגלי|גן |פארק|ציפור|природ|поход|сад|парк|птиц/i],
];

export function inferTypes(text: string): EventType[] {
  const t = TYPE_RULES.filter(([, re]) => re.test(text)).map(([type]) => type);
  return t.length ? t : ['Festival'];
}

/** Rough EUR conversion used only for the price filter; the exact local price stays in priceText. */
export const EUR_PER: Record<string, number> = {
  EUR: 1, USD: 0.92, GBP: 1.17, ILS: 0.25, CZK: 0.04, HUF: 0.0025, PLN: 0.23, CHF: 1.05, SEK: 0.088, NOK: 0.086,
  DKK: 0.134, RON: 0.2, RSD: 0.0085, JPY: 0.0062, KRW: 0.00068, AUD: 0.6, CAD: 0.68, MXN: 0.05, BRL: 0.17,
  ZAR: 0.05, GHS: 0.06, NGN: 0.0006, IDR: 0.000057, AED: 0.25, TRY: 0.026, THB: 0.026, GEL: 0.34, AMD: 0.0024,
};
