import { SERPAPI_KEY } from '../params';
import { serpAllowed, serpSpent } from '../serpBudget';
import { fetchJson, secret } from '../util';
import { RawGoogleEvent, SerpEventsResponse, mapSerpEvents, serpEventsUrl } from './googleEventsMap';
import { googleQueries, hostname } from './parse';
import { SearchArgs } from './types';

export { googleQueries, hostname };

/**
 * Raw Google events for one area (see googleEventsMap.ts). Each query is one SerpApi search,
 * so live searches go through the monthly budget (serpBudget.ts); the weekly job budgets its
 * whole run itself and passes `preApproved`.
 */
export async function googleEventsRaw(
  a: SearchArgs,
  queries: string[],
  preApproved = false,
): Promise<{ raw: RawGoogleEvent[]; searches: number; skippedForBudget: boolean }> {
  const key = secret(SERPAPI_KEY);
  if (!key || !a.placeName || !queries.length) return { raw: [], searches: 0, skippedForBudget: false };
  const n = preApproved ? queries.length : await serpAllowed('live', queries.length);
  // The searches run side by side (they were already counted against the budget above).
  const pages = await Promise.all(
    queries.slice(0, n).map(async (q) => {
      const j = await fetchJson<SerpEventsResponse>(serpEventsUrl(a, q, key), { timeoutMs: 20_000 }).catch(
        () => ({ events_results: [] }) as SerpEventsResponse,
      );
      serpSpent(1);
      return mapSerpEvents(j, a, q);
    }),
  );
  return { raw: pages.flat(), searches: n, skippedForBudget: n === 0 };
}
