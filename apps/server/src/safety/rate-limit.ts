/** Classic token bucket: `capacity` tokens, refilled at `refillPerSecond`. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  take(cost = 1): { ok: true } | { ok: false; retryAfterMs: number } {
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return { ok: true };
    }
    const deficit = cost - this.tokens;
    const retryAfterMs = Math.ceil((deficit / this.refillPerSecond) * 1000);
    return { ok: false, retryAfterMs };
  }

  private refill(): void {
    const t = this.now();
    const elapsed = Math.max(0, t - this.last) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.last = t;
  }
}

/** Per-session limits. Values are deliberately generous for humans and tight for scripts. */
export function createSessionLimits(now: () => number = Date.now) {
  return {
    /** chat messages: burst 8, sustained 3/s */
    message: new TokenBucket(8, 3, now),
    /** typing indicators: burst 10, sustained 2/s */
    typing: new TokenBucket(10, 2, now),
    /** find/next/cancel/stop: burst 4, one every 1.5 s sustained (stops Next-spamming) */
    navigation: new TokenBucket(4, 1 / 1.5, now),
    /** WebRTC signaling bursts during ICE gathering: burst 80, sustained 20/s */
    signal: new TokenBucket(80, 20, now),
    /** reports/blocks: burst 3, sustained 1 per 30 s */
    report: new TokenBucket(3, 1 / 30, now),
    /** anything else (ping etc.): burst 20, 5/s */
    misc: new TokenBucket(20, 5, now),
    /** protocol violations tolerated before the socket is closed */
    violations: new TokenBucket(10, 0.1, now),
  };
}
export type SessionLimits = ReturnType<typeof createSessionLimits>;
