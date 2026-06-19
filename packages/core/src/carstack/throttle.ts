/** A simple token-bucket rate limiter (e.g. 240/min on /vdp-enrichment). */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerMin: number,
    private readonly sleepFn: (ms: number) => Promise<void> = defaultSleep,
    private readonly nowFn: () => number = () => Date.now(),
  ) {
    this.tokens = capacity;
    this.lastRefill = nowFn();
  }

  private refill(): void {
    const now = this.nowFn();
    const elapsedMin = (now - this.lastRefill) / 60_000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedMin * this.refillPerMin);
    this.lastRefill = now;
  }

  /** Resolves once a token is available, blocking (with sleeps) if necessary. */
  async acquire(): Promise<void> {
    // Bounded loop: each iteration either consumes a token or sleeps long
    // enough to mint at least one, so it terminates quickly.
    for (let i = 0; i < 10_000; i++) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const deficit = 1 - this.tokens;
      const waitMs = Math.max((deficit / this.refillPerMin) * 60_000, 5);
      await this.sleepFn(waitMs);
    }
    throw new Error("TokenBucket.acquire exceeded its retry budget");
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
