import { sha1 } from './hash';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

export type Lang = 'en' | 'he' | 'ru';
export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'he' || v === 'ru';

/**
 * A secret's value, or '' when it isn't configured. Optional secrets (Agoda, Anthropic, Google)
 * are stored as the placeholder "unset" until a real key exists, because Firebase refuses to
 * deploy functions that reference a secret with no value at all (scripts/pushSecrets.mjs).
 */
export function secret(s: { value(): string }): string {
  try {
    const v = (s.value() ?? '').trim();
    return v && !/^(unset|none|todo|-)$/i.test(v) ? v : '';
  } catch {
    return '';
  }
}

/**
 * The app pings the trip-planner and event functions with { warmup: true } when it opens, so
 * their servers start up (a few seconds each the first time) while the user is still choosing.
 * Answered at once, before any outside API is called.
 */
export function isWarmup(req: CallableRequest<unknown>): boolean {
  return (req.data as { warmup?: unknown } | null | undefined)?.warmup === true;
}

export function requireAuth(req: CallableRequest<unknown>): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  return uid;
}

export function requireNumber(v: unknown, name: string, min = -Infinity, max = Infinity): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
    throw new HttpsError('invalid-argument', `${name} must be a number between ${min} and ${max}`);
  }
  return n;
}

export function requireString(v: unknown, name: string, max = 500): string {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new HttpsError('invalid-argument', `${name} is required`);
  return v.trim();
}

export { sha1 };

export async function fetchJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 15_000, ...rest } = init;
  const res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) {
    logger.warn('upstream error', { url: url.replace(/key=[^&]+/, 'key=***'), status: res.status, body: text.slice(0, 300) });
    throw new Error(`HTTP ${res.status}`);
  }
  return JSON.parse(text) as T;
}

/**
 * Firestore-backed cache (collection `cache`). Keeps third-party API bills low: TripAdvisor
 * details for 7 days, nearby lists for 1 day, event searches for 6 hours, routes for 7 days.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  produce: () => Promise<T>,
  /** Return false to skip caching a result (e.g. an empty answer caused by a provider error). */
  keep: (v: T) => boolean = () => true,
): Promise<{ value: T; hit: boolean }> {
  const ref = getFirestore().collection('cache').doc(sha1(key));
  try {
    const snap = await ref.get();
    const data = snap.data() as { value: string; expires: number } | undefined;
    if (data && data.expires > Date.now()) return { value: JSON.parse(data.value) as T, hit: true };
  } catch (e) {
    logger.warn('cache read failed', e);
  }
  const value = await produce();
  if (!keep(value)) return { value, hit: false };
  ref.set({ key: key.slice(0, 300), value: JSON.stringify(value), expires: Date.now() + ttlMs }).catch(() => undefined);
  return { value, hit: false };
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const s =
    Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLon - aLon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
