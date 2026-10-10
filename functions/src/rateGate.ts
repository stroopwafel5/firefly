/**
 * Keeps calls to a rate-limited API (Tripadvisor) under its queries-per-second limit, and backs
 * off after a "429 Too Many Requests": for `coolMs` every call is refused straight away (the
 * caller uses its backup source) instead of hammering the API and making the block last longer.
 * One gate per server instance. Pure (time and sleep are injectable), unit-tested.
 */
export class RateGate {
  private nextSlot = 0;
  private coolUntil = 0;

  constructor(
    private qps: number,
    private coolMs = 90_000,
    private now: () => number = () => Date.now(),
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  get cooling(): boolean {
    return this.now() < this.coolUntil;
  }

  /** Call after a 429: stop using the API for a while. */
  coolDown(): void {
    this.coolUntil = this.now() + this.coolMs;
  }

  /** Waits for this call's turn. Returns false (don't call) while cooling down. */
  async wait(): Promise<boolean> {
    if (this.cooling) return false;
    const t = this.now();
    const at = Math.max(t, this.nextSlot);
    this.nextSlot = at + 1000 / Math.max(0.1, this.qps);
    if (at > t) await this.sleep(at - t);
    return !this.cooling;
  }
}
