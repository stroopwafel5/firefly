/**
 * Tripadvisor Terra's search bucket: `/locations/search`, `/locations/nearby`,
 * `/catalog/locations/search` and `/catalog/locations/nearby` share ONE limit of
 * **1 request per second (burst 5)** on every plan — separate from, and much lower than, the
 * plan's 10 requests per second (docs.terra.tripadvisor.com → Rate Limits). Requests over it are
 * answered 429 and don't appear in the Terra dashboard.
 *
 * Attractions, restaurants and hotels are separate Cloud Functions (separate servers), so a
 * per-server gate can't keep their sum under 1 per second. This limiter shares one schedule
 * through a Firestore document: each search reserves the next free slot (a "generic cell rate
 * algorithm": one slot every `intervalMs`, up to `burst` at once after a quiet spell) and waits
 * for it. A 429 pushes everyone's next slot back. If Firestore can't be reached, a per-server
 * schedule is used instead.
 *
 * `reserveSlot` is pure and unit-tested; `SharedLimiter` adds Firestore and the waiting.
 */

export interface LimiterConfig {
  /** Time between requests on average (1 per second → 1100 ms with a safety margin). */
  intervalMs: number;
  /** Requests allowed at once after a quiet spell (Terra allows 5; keep one in reserve). */
  burst: number;
  /** Give up (answer "busy") instead of waiting longer than this. */
  maxWaitMs: number;
}

export const TERRA_SEARCH: LimiterConfig = { intervalMs: 1100, burst: 4, maxWaitMs: 30_000 };

/** Paths that count against the search bucket. */
export const isSearchPath = (path: string) => /^\/(catalog\/)?locations\/(search|nearby)$/.test(path);

/**
 * One reservation. `tat` is the "theoretical arrival time" kept between calls (0 at first).
 * Returns when this request may go out and the new `tat`, or null when that is more than
 * `maxWaitMs` away (the caller should not wait).
 */
export function reserveSlot(tat: number, now: number, c: LimiterConfig): { at: number; tat: number } | null {
  const tolerance = (c.burst - 1) * c.intervalMs;
  const at = Math.max(now, tat - tolerance);
  if (at - now > c.maxWaitMs) return null;
  return { at, tat: Math.max(tat, at) + c.intervalMs };
}

/** After a 429: nobody sends a search for `pauseMs`. */
export const penalized = (tat: number, now: number, pauseMs: number, c: LimiterConfig) =>
  Math.max(tat, now + pauseMs + (c.burst - 1) * c.intervalMs);

/** Where the schedule is kept (Firestore in production, memory in tests and as the fallback). */
export interface LimiterStore {
  /** Runs `fn` on the stored value atomically and saves what it returns. */
  update<T>(fn: (tat: number) => { tat: number; result: T }): Promise<T>;
}

export class MemoryLimiterStore implements LimiterStore {
  private tat = 0;
  async update<T>(fn: (tat: number) => { tat: number; result: T }): Promise<T> {
    const r = fn(this.tat);
    this.tat = r.tat;
    return r.result;
  }
}

export class SharedLimiter {
  private fallback = new MemoryLimiterStore();

  constructor(
    private store: LimiterStore,
    private c: LimiterConfig = TERRA_SEARCH,
    private now: () => number = () => Date.now(),
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private warn: (m: string, e: unknown) => void = () => undefined,
  ) {}

  private async run<T>(fn: (tat: number) => { tat: number; result: T }): Promise<T> {
    try {
      return await this.store.update(fn);
    } catch (e) {
      this.warn('shared Tripadvisor schedule unavailable; using this server\'s own', e);
      return this.fallback.update(fn);
    }
  }

  /** Waits for this search's turn. False = the wait would be too long (treat Tripadvisor as busy). */
  async take(): Promise<boolean> {
    const at = await this.run((tat) => {
      const r = reserveSlot(tat, this.now(), this.c);
      return r ? { tat: r.tat, result: r.at as number | null } : { tat, result: null };
    });
    if (at == null) return false;
    const wait = at - this.now();
    if (wait > 0) await this.sleep(wait);
    return true;
  }

  /** Tripadvisor answered 429: hold every server's searches back for `pauseMs`. */
  async pause(pauseMs: number): Promise<void> {
    await this.run((tat) => ({ tat: penalized(tat, this.now(), pauseMs, this.c), result: undefined }));
  }
}
