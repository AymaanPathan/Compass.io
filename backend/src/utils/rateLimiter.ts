export interface RateLimiterOptions {
  /** Maximum number of tokens the bucket can hold. */
  capacity: number;

  /** Number of tokens replenished per second. */
  refillRate: number;
}

/**
 * In-memory token bucket rate limiter.
 *
 * Starts with `capacity` tokens and replenishes them at `refillRate`
 * tokens per second. A refill timer runs only while callers are waiting.
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

  /**
   * Acquires one token.
   * Resolves immediately when a token is available;
   * otherwise waits until a token is replenished.
   */
  acquire(): Promise<void> {
    this.refillFromElapsedTime();
    this.drainWaiters();

    if (this.tokens >= 1 && this.waiters.length === 0) {
      this.tokens -= 1;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
      this.startRefillTimer();
    });
  }

  /**
   * Replenishes tokens based on elapsed time.
   *
   * Fractional tokens are preserved so frequent calls do not
   * lose refill progress.
   */
  private refillFromElapsedTime(): void {
    const now = Date.now();
    const elapsedMs = Math.max(0, now - this.lastRefillAt);

    if (elapsedMs === 0) {
      return;
    }

    const replenishedTokens = (elapsedMs / 1000) * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + replenishedTokens);

    this.lastRefillAt = now;
  }

  /**
   * Starts the refill timer only when at least one caller is waiting.
   */
  private startRefillTimer(): void {
    if (this.refillTimer !== undefined) {
      return;
    }

    const intervalMs = Math.max(1, Math.ceil(1000 / this.refillRate));

    this.refillTimer = setInterval(() => {
      this.refillFromElapsedTime();
      this.drainWaiters();
    }, intervalMs);
  }

  /**
   * Resolves waiting callers in FIFO order while tokens are available.
   */
  private drainWaiters(): void {
    while (this.tokens >= 1 && this.waiters.length > 0) {
      this.tokens -= 1;

      const resolve = this.waiters.shift();

      resolve?.();
    }

    if (this.waiters.length === 0 && this.refillTimer !== undefined) {
      clearInterval(this.refillTimer);
      this.refillTimer = undefined;
    }
  }
}

/**
 * Shared API limiter:
 * - Allows an initial burst of 5 requests.
 * - Replenishes 1 token per second.
 */
export const apiLimiter = new RateLimiter({
  capacity: 5,
  refillRate: 1,
});
