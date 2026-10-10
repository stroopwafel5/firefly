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
export const SERPAPI_RESERVE = defineString('SERPAPI_RESERVE', { default: '10' });
/** Most SerpApi searches one weekly offline-events run may use. */
export const SERPAPI_FALLBACK_MAX = defineString('SERPAPI_FALLBACK_MAX', { default: '30' });
/** Agoda Lite API endpoint (Agoda documents plain HTTP; HTTPS is available on request). */
export const AGODA_ENDPOINT = defineString('AGODA_ENDPOINT', { default: 'http://affiliateapi7643.agoda.com/affiliateservice/lt_v1' });
