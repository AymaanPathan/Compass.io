import type { NextFunction, Request, Response } from "express";

/**
 * An application error with an explicit HTTP status code.
 * Use this for expected request/validation errors that should not become 502s.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Recognizes common rate-limit shapes returned by SDKs and HTTP clients. */
export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    const message = String(error ?? "").toLowerCase();
    return (
      message.includes("429") ||
      message.includes("rate limit") ||
      message.includes("too many requests")
    );
  }

  const value = error as {
    response?: { status?: unknown };
    status?: unknown;
    statusCode?: unknown;
    message?: unknown;
  };

  const status = value.response?.status ?? value.status ?? value.statusCode;

  if (Number(status) === 429) {
    return true;
  }

  const message = String(value.message ?? error).toLowerCase();

  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  );
}

/**
 * Shared Express error middleware.
 * ApiError status takes precedence; other rate-limit errors map to 429;
 * unknown errors map to 502 because this route delegates to an upstream agent.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status =
    err instanceof ApiError ? err.status : isRateLimitError(err) ? 429 : 502;

  const message =
    err instanceof Error && err.message.trim()
      ? err.message
      : status === 429
        ? "The request is rate-limited. Please try again shortly."
        : "Failed to process request";

  if (status >= 500) {
    console.error("[api] request error:", err);
  }

  res.status(status).json({
    success: false,
    error: message,
  });
}
