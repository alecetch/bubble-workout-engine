import rateLimit from "express-rate-limit";

const isDev = process.env.NODE_ENV !== "production";

export function createEntitlementSyncRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    keyGenerator: req => req.auth.user_id,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, code: "rate_limited", error: "Too many entitlement sync requests. Please try again shortly." },
  });
}

function buildLimiter(windowMs, max, message) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: isDev ? () => true : undefined,
    message: {
      ok: false,
      code: "rate_limited",
      error: message,
    },
  });
}

export const globalRateLimiter = buildLimiter(
  15 * 60 * 1000,
  600,
  "Too many requests, please try again later.",
);

export const generationRateLimiter = buildLimiter(
  15 * 60 * 1000,
  20,
  "Too many generation requests, please slow down.",
);

export const adminRateLimiter = buildLimiter(
  15 * 60 * 1000,
  240,
  "Too many admin requests, please try again later.",
);

export const healthRateLimiter = buildLimiter(
  60 * 1000,
  30,
  "Too many health checks, please try again later.",
);
