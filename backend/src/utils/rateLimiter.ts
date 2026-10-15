export interface RateLimiterOptions {
  /** Maximum number of tokens the bucket can hold. */
  capacity: number;
  /** Number of tokens replenished per second. */
  refillRate: number;
}

/**
 * A small in-memory token bucket.
 *
 * The refill timer is started only while callers are waiting. This keeps
 * `acquire()` timer-free when a token is immediately available and allows
 * the bucket to refill lazily after idle periods.
 */
export class RateLimiter {
  private readonly capacity: number;
  private readonly refillRate: number;
  private tokens: number;
  private lastRefillAt: number;
  private refillTimer: ReturnType<typeof setInterval> | undefined;
  private readonly waiters: Array<() => void> = [];

  constructor(options: RateLimiterOptions) {
    if (!Number.isFinite(options.capacity) || options.capacity < 1) {
      throw new Error("RateLimiter capacity must be a positive number");
    }
    if (!Number.isFinite(options.refillRate) || options.refillRate <= 0) {
      throw new Error("RateLimiter refillRate must be a positive number");
    }

    this.capacity = options.capacity;
    this.refillRate = options.refillRate;
    this.tokens = options.capacity;
    this.lastRefillAt = Date.now();
  }

  /** Resolve immediately if a token is available; otherwise wait in FIFO order. */
  acquire(): Promise<void> {
    this.refillFromElapsedTime();
    this.drainWaiters();

    if (this.tokens >= 1 && this.waiters.length === 0) {
      this.tokens -= 1;
      // Start the next refill interval when a token is consumed. This makes
      // the empty-bucket wait deterministic (e.g. 1000 ms at 1 token/second).
      this.lastRefillAt = Date.now();
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
      this.startRefillTimer();
    });
  }

  private refillFromElapsedTime(): void {
    const now = Date.now();
    const elapsedMs = Math.max(0, now - this.lastRefillAt);
    if (elapsedMs === 0) return;

    this.tokens = Math.min(
      this.capacity,
      this.tokens + (elapsedMs / 1000) * this.refillRate,
    );
    this.lastRefillAt = now;
  }

  private startRefillTimer(): void {
    if (this.refillTimer !== undefined) return;

    // One timer tick corresponds to one token's refill interval. `refillFromElapsedTime`
    // calculates the actual amount, including fractional refill rates.
    const intervalMs = Math.max(1, Math.ceil(1000 / this.refillRate));
    this.refillTimer = setInterval(() => {
      this.refillFromElapsedTime();
      this.drainWaiters();
    }, intervalMs);
  }

  private drainWaiters(): void {
    while (this.tokens >= 1 && this.waiters.length > 0) {
      this.tokens -= 1;
      // A waiting caller consumes the newly refilled token, so begin the next
      // refill interval from this consumption.
      this.lastRefillAt = Date.now();
      const resolve = this.waiters.shift();
      resolve?.();
    }

    if (this.waiters.length === 0 && this.refillTimer !== undefined) {
      clearInterval(this.refillTimer);
      this.refillTimer = undefined;
    }
  }
}

/** Shared limiter: allow an initial burst of five, then refill one token/second. */
export const apiLimiter = new RateLimiter({ capacity: 5, refillRate: 1 });
