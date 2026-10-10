import { logger } from 'firebase-functions/v2';
import { SERPAPI_FALLBACK_MAX, SERPAPI_KEY, SERPAPI_RESERVE } from './params';
import { SerpPurpose, serpAllowance } from './serpBudgetCore';
import { fetchJson, secret } from './util';

/**
 * How many SerpApi searches a job may spend now (rules in serpBudgetCore.ts). SerpApi's account
 * endpoint is free (it does not use up a search) and is asked at most every 10 minutes per
 * server instance.
 */
let known: { left: number; renewal: Date | null; at: number } | null = null;

export async function serpAccount(): Promise<{ left: number; renewal: Date | null }> {
  const key = secret(SERPAPI_KEY);
  if (!key) return { left: 0, renewal: null };
  if (known && Date.now() - known.at < 10 * 60_000) return known;
  try {
    const j = await fetchJson<{ total_searches_left?: number; plan_searches_left?: number; plan_renewal_date?: string }>(
      `https://serpapi.com/account.json?api_key=${key}`,
      { timeoutMs: 8_000 },
    );
    const left = j.total_searches_left ?? j.plan_searches_left;
    const renewal = j.plan_renewal_date ? new Date(`${j.plan_renewal_date}T00:00:00Z`) : null;
    known = { left: typeof left === 'number' ? left : NaN, renewal, at: Date.now() };
  } catch (e) {
    logger.warn('SerpApi account check failed', e);
    known = { left: NaN, renewal: null, at: Date.now() };
  }
  return known;
}

export async function serpAllowed(purpose: SerpPurpose, want: number): Promise<number> {
  if (!secret(SERPAPI_KEY)) return 0;
  const { left, renewal } = await serpAccount();
  const n = serpAllowance(left, purpose, want, {
    fallbackMax: Number(SERPAPI_FALLBACK_MAX.value()) || 30,
    minReserve: Number(SERPAPI_RESERVE.value()) || 10,
    renewal,
  });
  if (n < want) logger.info('SerpApi budget limits searches', { purpose, want, allowed: n, left });
  return n;
}

/** Keep the local count honest between account checks. */
export function serpSpent(n: number) {
  if (known && Number.isFinite(known.left)) known.left -= n;
}
