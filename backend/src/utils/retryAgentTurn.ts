const DEFAULT_MAX_ATTEMPTS = 10;

const DEFAULT_DELAY_MS = 60_000; // exactly 1 minute

const DEFAULT_MAX_RATE_LIMIT_ATTEMPTS = 10;
const DEFAULT_RATE_LIMIT_DELAY_MS = 60_000; // exactly 1 minute

const DEFAULT_MAX_CANCELLED_ATTEMPTS = 10;
const DEFAULT_CANCELLED_DELAY_MS = 60_000; // exactly 1 minute

interface WaitInfo {
  kind: "rate_limited" | "retryable" | "cancelled";
  attempt: number;
  maxAttempts: number;
  waitMs: number;
}

interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;

  maxRateLimitAttempts?: number;
  rateLimitDelayMs?: number;

  maxCancelledAttempts?: number;
  cancelledDelayMs?: number;

  onWait?: (info: WaitInfo) => void;
}

type ErrorKind = "rate_limited" | "retryable" | "cancelled" | "fatal";

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

  if (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("429")
  ) {
    return "rate_limited";
  }

  if (
    message.includes("agent turn cancelled") ||
    message.includes("abandoned")
  ) {
    return "cancelled";
  }

  // Iteration-limit errors are terminal.
  if (message.includes("iteration limit")) {
    return "fatal";
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

function getRetryAfterMs(error: any): number | null {
  const headerVal =
    error?.response?.headers?.["retry-after"] ??
    error?.headers?.["retry-after"];

  if (!headerVal) {
    return null;
  }

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
 * Execute an agent turn with bounded retries.
 *
 * Retry behavior:
 *
 * - Maximum 10 total attempts.
 * - Rate-limit retries wait exactly 1 minute.
 * - Cancelled retries wait exactly 1 minute.
 * - Generic transient retries wait exactly 1 minute.
 * - No exponential backoff.
 * - No jitter.
 * - Fatal errors are never retried.
 *
 * A provider Retry-After header is respected for 429 responses.
 * If no Retry-After header exists, the retry waits exactly 1 minute.
 */
export async function withAgentRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;

  const maxRateLimitAttempts =
    options?.maxRateLimitAttempts ?? DEFAULT_MAX_RATE_LIMIT_ATTEMPTS;

  const rateLimitDelayMs =
    options?.rateLimitDelayMs ?? DEFAULT_RATE_LIMIT_DELAY_MS;

  const maxCancelledAttempts =
    options?.maxCancelledAttempts ?? DEFAULT_MAX_CANCELLED_ATTEMPTS;

  const cancelledDelayMs =
    options?.cancelledDelayMs ?? DEFAULT_CANCELLED_DELAY_MS;

  let rateLimitAttempt = 0;
  let cancelledAttempt = 0;
  let retryableAttempt = 0;

  let lastError: unknown;

  /*
   * GLOBAL attempt budget.
   *
   * Maximum of 10 agent turns total.
   *
   * This prevents:
   *
   * 10 generic + 10 rate-limit + 10 cancelled
   *
   * from producing 30 turns.
   */
  const maxTotalAttempts = maxAttempts;

  for (let totalAttempt = 1; totalAttempt <= maxTotalAttempts; totalAttempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const kind = classifyError(error);

      console.warn(
        `[withAgentRetry] attempt ${totalAttempt}/${maxTotalAttempts} failed: ${kind}`,
      );

      /*
       * Fatal errors are never retried.
       */
      if (kind === "fatal") {
        throw error;
      }

      /*
       * Global attempt limit reached.
       */
      if (totalAttempt >= maxTotalAttempts) {
        throw error;
      }

      /*
       * RATE LIMIT
       *
       * Wait exactly 1 minute unless Cerebras explicitly
       * provides a Retry-After header.
       */
      if (kind === "rate_limited") {
        rateLimitAttempt++;

        if (rateLimitAttempt > maxRateLimitAttempts) {
          throw error;
        }

        const waitMs = getRetryAfterMs(error) ?? rateLimitDelayMs;

        options?.onWait?.({
          kind: "rate_limited",
          attempt: rateLimitAttempt,
          maxAttempts: maxRateLimitAttempts,
          waitMs,
        });

        console.warn(
          `[withAgentRetry] rate limited ` +
            `(${rateLimitAttempt}/${maxRateLimitAttempts}), ` +
            `waiting ${waitMs}ms`,
        );

        await delay(waitMs);
        continue;
      }

      /*
       * CANCELLED / ABANDONED
       *
       * Always wait exactly 1 minute.
       */
      if (kind === "cancelled") {
        cancelledAttempt++;

        if (cancelledAttempt > maxCancelledAttempts) {
          throw error;
        }

        const waitMs = cancelledDelayMs;

        options?.onWait?.({
          kind: "cancelled",
          attempt: cancelledAttempt,
          maxAttempts: maxCancelledAttempts,
          waitMs,
        });

        console.warn(
          `[withAgentRetry] cancelled ` +
            `(${cancelledAttempt}/${maxCancelledAttempts}), ` +
            `waiting ${waitMs}ms`,
        );

        await delay(waitMs);
        continue;
      }

      /*
       * GENERIC TRANSIENT FAILURE
       *
       * Always wait exactly 1 minute.
       */
      retryableAttempt++;

      if (retryableAttempt > maxAttempts) {
        throw error;
      }

      const waitMs = delayMs;

      options?.onWait?.({
        kind: "retryable",
        attempt: retryableAttempt,
        maxAttempts,
        waitMs,
      });

      console.warn(
        `[withAgentRetry] retryable failure ` +
          `(${retryableAttempt}/${maxAttempts}), ` +
          `waiting ${waitMs}ms`,
      );

      await delay(waitMs);
    }
  }

  throw lastError;
}
