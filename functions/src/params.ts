import { defineSecret, defineString } from 'firebase-functions/params';

/**
 * Third-party keys, stored in Google Secret Manager — never in the app.
 * scripts/pushSecrets.mjs uploads them from functions/.secret.local (the same file the local
 * emulator reads). See HOW_TO_TEST.md §2.
 */
export const TRIPADVISOR_KEY = defineSecret('TRIPADVISOR_KEY');
export const GOOGLE_SERVER_KEY = defineSecret('GOOGLE_SERVER_KEY');
export const TICKETMASTER_KEY = defineSecret('TICKETMASTER_KEY');
export const SERPAPI_KEY = defineSecret('SERPAPI_KEY');
export const PAYPAL_CLIENT_ID = defineSecret('PAYPAL_CLIENT_ID');
export const PAYPAL_CLIENT_SECRET = defineSecret('PAYPAL_CLIENT_SECRET');
export const SMTP_USER = defineSecret('SMTP_USER');
export const SMTP_PASS = defineSecret('SMTP_PASS');
/** Optional: rephrases sourced descriptions for kids. "unset" = use the Wikipedia text as is. */
export const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
/** Passcode(s) for the events upload page (hosting/upload): "code" or "anna:code1, david:code2". */
export const EVENTS_UPLOAD_PASSCODE = defineSecret('EVENTS_UPLOAD_PASSCODE');
/** Optional until Agoda approves the affiliate account: hotel prices + Agoda booking links. */
export const AGODA_SITE_ID = defineSecret('AGODA_SITE_ID');
export const AGODA_API_KEY = defineSecret('AGODA_API_KEY');
/** Grow (Meshulam) card payments: from Grow once the business account has API access. */
export const GROW_USER_ID = defineSecret('GROW_USER_ID');
export const GROW_PAGE_CODE = defineSecret('GROW_PAGE_CODE');
/** Only for platform/multi-business setups; "unset" otherwise. */
export const GROW_API_KEY = defineSecret('GROW_API_KEY');

/** Plain config (functions/.env). */
export const PAYPAL_ENV = defineString('PAYPAL_ENV', { default: 'sandbox' });
/** "sandbox" or "production". */
export const GROW_ENV = defineString('GROW_ENV', { default: 'sandbox' });
/** Euro → shekel rate for camps without their own priceILS (Grow charges in shekels). */
export const GROW_EUR_ILS = defineString('GROW_EUR_ILS', { default: '4.0' });
export const BOOKINGS_EMAIL = defineString('BOOKINGS_EMAIL', { default: 'dubinanna@gmail.com' });
export const BOOKING_AFFILIATE_ID = defineString('BOOKING_AFFILIATE_ID', { default: '' });
export const SMTP_HOST = defineString('SMTP_HOST', { default: 'smtp.gmail.com' });
/** Minimum SerpApi searches always kept back (on top of what the remaining weekly runs need). */
/** Tripadvisor requests per second per server (your Terra plan's QPS; see the Terra dashboard → Manage Plan). */
export const TRIPADVISOR_QPS = defineString('TRIPADVISOR_QPS', { default: '3' });
/** "off" stops asking Google Places for sights (each city costs one Nearby Search + a few photos). */
export const GOOGLE_PLACES_SIGHTS = defineString('GOOGLE_PLACES_SIGHTS', { default: 'on' });
export const SERPAPI_RESERVE = defineString('SERPAPI_RESERVE', { default: '10' });
/** Most SerpApi searches one weekly offline-events run may use. */
export const SERPAPI_FALLBACK_MAX = defineString('SERPAPI_FALLBACK_MAX', { default: '30' });
/** Agoda Lite API endpoint (Agoda documents plain HTTP; HTTPS is available on request). */
/** Claude model that reads uploaded event pages and translates them (falls back to KIDIFY_MODEL). */
export const EVENTS_AI_MODEL = defineString('EVENTS_AI_MODEL', { default: 'claude-sonnet-5-5' });
/** The weekly event search (events/scout.ts): "off" stops it. */
export const EVENTS_SCOUT = defineString('EVENTS_SCOUT', { default: 'on' });
/** At most this many event pages read by Claude per weekly search (the cost limit). */
export const EVENTS_SCOUT_MAX = defineString('EVENTS_SCOUT_MAX', { default: '250' });
/** Claude model for the weekly search (web search + reading pages); the small model keeps it cheap. */
export const EVENTS_SCOUT_MODEL = defineString('EVENTS_SCOUT_MODEL', { default: 'claude-haiku-5-5' });
export const AGODA_ENDPOINT = defineString('AGODA_ENDPOINT', { default: 'http://affiliateapi7643.agoda.com/affiliateservice/lt_v1' });
