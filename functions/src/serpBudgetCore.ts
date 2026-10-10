/**
 * SerpApi plans include a fixed number of searches a month (the Firefly key: Free plan,
 * 250/month, renewing on the 9th; checked 9 Oct 2026). Pure budgeting rules, unit-tested:
 *  - the weekly offline-events job (Mondays) may use up to `fallbackMax` searches per run and
 *    always leaves 5 spare;
 *  - live event searches and hotel searches only run while more searches are left than the
 *    weekly job still needs before the plan renews (fallbackMax × Mondays left), and never
 *    below `minReserve`.
 */
export type SerpPurpose = 'live' | 'hotels' | 'fallback';

/** Mondays from tomorrow up to (not including) the renewal date. */
export function mondaysUntil(now: Date, renewal: Date | null): number {
  if (!renewal || !(renewal > now)) return 1;
  let n = 0;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  for (; d < renewal; d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() === 1) n++;
  return n;
}

export function serpAllowance(
  left: number,
  purpose: SerpPurpose,
  want: number,
  opts: { fallbackMax: number; minReserve: number; now?: Date; renewal?: Date | null },
): number {
  if (!Number.isFinite(left)) return want; // unknown (account check failed): let the search itself decide
  if (purpose === 'fallback') return Math.max(0, Math.min(want, opts.fallbackMax, left - 5));
  const reserve = Math.max(opts.minReserve, opts.fallbackMax * mondaysUntil(opts.now ?? new Date(), opts.renewal ?? null));
  return Math.max(0, Math.min(want, left - reserve));
}
