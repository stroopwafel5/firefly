/**
 * Grow (formerly Meshulam) — Israeli card payments on Grow's own secure page, so card details
 * never touch Firefly. Pure helpers (no network), tested in test/grow.test.ts.
 *
 * Flow (developers.grow.business, "Payment Process"):
 *  1. server → createPaymentProcess (multipart form) → `data.url`, valid ~10 minutes;
 *  2. the app opens that page; on success Grow redirects to successUrl (+ "&response=success");
 *  3. Grow POSTs the result to notifyUrl (server to server); we check it with
 *     getPaymentProcessInfo, mark the booking paid, then call approveTransaction.
 */

export const GROW_RETURN_URL = 'https://www.differentroute.net/?firefly=grow-return';
export const GROW_CANCEL_URL = 'https://www.differentroute.net/?firefly=grow-cancel';

export function growBase(env: string): string {
  return env === 'production' ? 'https://secure.meshulam.co.il' : 'https://sandbox.meshulam.co.il';
}
export const growUrl = (env: string, method: 'createPaymentProcess' | 'getPaymentProcessInfo' | 'approveTransaction') =>
  `${growBase(env)}/api/light/server/1.0/${method}`;

/**
 * The amount in shekels: the camp's own `priceILS` when Different Route set one, otherwise the
 * euro price × the configured rate, rounded up to a whole shekel.
 */
export function ilsAmount(priceEur: number, rate: number, priceIls?: number): number {
  if (priceIls && priceIls > 0) return Math.round(priceIls);
  if (!(priceEur > 0) || !(rate > 0)) throw new Error('No price');
  return Math.ceil(priceEur * rate);
}

/** Grow wants an Israeli mobile number: 05XXXXXXXX (also accepts +972 / 972 forms here). */
export function israeliMobile(areaCode: string, phone: string): string | null {
  let d = `${areaCode}${phone}`.replace(/\D/g, '');
  if (d.startsWith('972')) d = `0${d.slice(3)}`;
  if (/^5\d{8}$/.test(d)) d = `0${d}`;
  return /^05\d{8}$/.test(d) ? d : null;
}

/** Grow asks for at least two names. */
export const fullName = (first: string, last: string) => `${first} ${last}`.replace(/\s+/g, ' ').trim();

export interface CreateArgs {
  pageCode: string;
  userId: string;
  apiKey?: string;
  sum: number;
  description: string;
  fullName: string;
  phone: string;
  email?: string;
  notifyUrl: string;
  bookingId: string;
  uid: string;
}

/** The fields of createPaymentProcess, in Grow's names. */
export function createFields(a: CreateArgs): Record<string, string> {
  const f: Record<string, string> = {
    pageCode: a.pageCode,
    userId: a.userId,
    sum: a.sum.toFixed(2),
    paymentNum: '1',
    description: a.description.replace(/[^\p{L}\p{N} .,()-]/gu, ' ').slice(0, 120),
    successUrl: GROW_RETURN_URL,
    cancelUrl: GROW_CANCEL_URL,
    notifyUrl: a.notifyUrl,
    'pageField[fullName]': a.fullName,
    'pageField[phone]': a.phone,
    cField1: a.bookingId,
    cField2: a.uid,
  };
  if (a.apiKey) f.apiKey = a.apiKey;
  if (a.email) f['pageField[email]'] = a.email;
  return f;
}

/**
 * Grow's callback arrives as form fields ("data[processId]", "data[customFields][cField1]")
 * or as JSON ({ data: { processId, customFields: { cField1 } } }). Both become one flat shape.
 */
export interface GrowNotice {
  status?: string;
  processId: string;
  processToken: string;
  transactionId: string;
  statusCode: string;
  statusText: string;
  sum: number;
  bookingId: string;
  raw: Record<string, string>;
}

export function flatten(obj: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(v, prefix ? `${prefix}[${k}]` : k, out);
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  } else if (obj != null) {
    out[prefix] = String(obj);
  }
  return out;
}

export function parseNotice(body: unknown): GrowNotice {
  const raw = flatten(body);
  const get = (...keys: string[]) => keys.map((k) => raw[k]).find((v) => v != null && v !== '') ?? '';
  return {
    status: raw.status,
    processId: get('data[processId]', 'processId'),
    processToken: get('data[processToken]', 'processToken'),
    transactionId: get('data[transactionId]', 'transactionId', 'data[transactionCode]', 'transactionCode'),
    statusCode: get('data[statusCode]', 'statusCode'),
    statusText: get('data[status]'),
    sum: Number(get('data[sum]', 'sum', 'paymentSum', 'data[paymentSum]')) || 0,
    bookingId: get('data[customFields][cField1]', 'data[cField1]', 'cField1', 'customFields[cField1]'),
    raw,
  };
}

/** Grow's documented example of a completed card payment: statusCode "2", status "שולם" (paid). */
export const isPaidNotice = (n: Pick<GrowNotice, 'statusCode' | 'statusText'>) => n.statusCode === '2' || /שולם|paid/i.test(n.statusText);

/** Text fields of a multipart/form-data body (enough for Grow's callback; files are ignored). */
export function parseMultipart(body: string, contentType: string): Record<string, string> {
  const b = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = b?.[1] ?? b?.[2];
  if (!boundary) return {};
  const out: Record<string, string> = {};
  for (const part of body.split(`--${boundary}`)) {
    const m = /name="([^"]+)"[^\r\n]*\r?\n(?:[^\r\n]+\r?\n)*\r?\n([\s\S]*?)\r?\n?$/.exec(part);
    if (m && !/filename="/.test(part.split(/\r?\n\r?\n/)[0] ?? '')) out[m[1]] = m[2];
  }
  return out;
}
