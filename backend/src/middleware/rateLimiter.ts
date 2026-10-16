import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;

const rateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    const resetTime: Date | undefined = (req as any).rateLimit?.resetTime;

    const retryAfterSeconds = resetTime
      ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : Math.ceil(WINDOW_MS / 1000);

    res.setHeader("Retry-After", String(retryAfterSeconds));

    res.status(429).json({
      success: false,
      error: "Rate limit exceeded",
    });
  },
});

export default rateLimiter;
