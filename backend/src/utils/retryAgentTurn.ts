const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_BASE_DELAY_MS = 1500;
const DEFAULT_MAX_DELAY_MS = 30_000;

// Rate limits (429) are typically per-minute windows, not transient blips.
// Exponential backoff starting at 1.5s just wastes attempts hitting the
// same wall. When we see a 429, wait close to a full window instead.
const DEFAULT_RATE_LIMIT_DELAY_MS = 65_000;
const DEFAULT_MAX_RATE_LIMIT_ATTEMPTS = 2;

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Attempts specifically for 429s, tracked separately from maxAttempts. */
  maxRateLimitAttempts?: number;
  /** Fixed wait used for 429s when the response has no retry-after header. */
  rateLimitDelayMs?: number;
}

type ErrorKind = "rate_limited" | "retryable" | "fatal";

function classifyError(error: any): ErrorKind {
  const status = error?.response?.status ?? error?.status ?? error?.statusCode;

  if (status === 429) {
    return "rate_limited";
  }

  if (status === 408 || status === 502 || status === 503 || status === 504) {
    return "retryable";
  }

  if (typeof status === "number" && status >= 500) {
    return "retryable";
  }

  const message = String(error?.message || error || "").toLowerCase();

  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "rate_limited";
  }

  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("agent turn failed")
  ) {
    return "retryable";
  }

  return "fatal";
}

/** Reads a numeric retry-after value (seconds) off common error shapes, if present. */
function getRetryAfterMs(error: any): number | null {
  const headerVal =
    error?.response?.headers?.["retry-after"] ??
    error?.headers?.["retry-after"];

  if (!headerVal) return null;

  const seconds = Number(headerVal);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn` and retries it if it throws an error that looks retryable
 * (rate limits, timeouts, transient connection errors, or an explicit
 * agent-turn failure). Non-retryable errors are rethrown immediately.
 *
 * Two separate retry policies are applied depending on error type:
 *
 * - RATE LIMITED (429 / "rate limit" / "too many requests"): waits
 *   `retry-after` if the error provides it, otherwise a fixed
 *   `rateLimitDelayMs` (default 65s), for up to `maxRateLimitAttempts`
 *   tries. Short backoffs cannot outrun a per-minute ceiling, so this
 *   path intentionally does not use exponential backoff.
 *
 * - OTHER RETRYABLE (502/503/504/timeouts/connection resets): uses
 *   exponential backoff + jitter starting at `baseDelayMs`, for up to
 *   `maxAttempts` tries, as before.
 *
 * Rate-limit retries and general retries are tracked with independent
 * counters, so a run that hits one 429 and one 503 gets a fair shot at
 * both policies rather than sharing a single attempt budget.
 *
 * Callers whose agent makes many tool calls per turn (and so is more
 * likely to trip a per-minute ceiling mid-run, e.g. a code-explorer
 * agent) should pass a larger `baseDelayMs` explicitly rather than
 * relying on the default, which is sized for light callers like
 * issue discovery / deep dive.
 */
export async function withAgentRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const maxRateLimitAttempts =
    options?.maxRateLimitAttempts ?? DEFAULT_MAX_RATE_LIMIT_ATTEMPTS;
  const rateLimitDelayMs =
    options?.rateLimitDelayMs ?? DEFAULT_RATE_LIMIT_DELAY_MS;

  let lastError: any;
  let attempt = 0;
  let rateLimitAttempt = 0;

  // Total tries is bounded by the sum of both budgets so a pathological
  // mix of errors can't retry forever.
  const maxTotalTries = maxAttempts + maxRateLimitAttempts;

  for (let tries = 1; tries <= maxTotalTries; tries++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const kind = classifyError(error);

      if (kind === "fatal") {
        throw error;
      }

      if (kind === "rate_limited") {
        rateLimitAttempt++;
        if (rateLimitAttempt >= maxRateLimitAttempts) {
          throw error;
        }

        const waitMs = getRetryAfterMs(error) ?? rateLimitDelayMs;

        console.warn(
          `[withAgentRetry] rate limited (attempt ${rateLimitAttempt}/${maxRateLimitAttempts}), waiting ${waitMs}ms`,
        );
        await delay(waitMs);
        continue;
      }

      // kind === "retryable"
      attempt++;
      if (attempt >= maxAttempts) {
        throw error;
      }

      const rawBackoff = baseDelayMs * Math.pow(2, attempt - 1);
      const cappedBackoff = Math.min(rawBackoff, maxDelayMs);
      // +/- up to 20% jitter so concurrent requests that failed together
      // don't all retry on the same tick and re-trip the limit.
      const jitter = cappedBackoff * 0.2 * (Math.random() * 2 - 1);
      const backoffMs = Math.round(cappedBackoff + jitter);

      console.warn(
        `[withAgentRetry] attempt ${attempt}/${maxAttempts} failed (${
          (error as Error)?.message
        }), retrying in ${backoffMs}ms`,
      );
      await delay(backoffMs);
    }
  }

  throw lastError;
}
