import rateLimit from "express-rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_DISTANCES = new Set(["5k", "10k", "half_marathon", "marathon", "other"]);
const VALID_RECENCY = new Set(["current", "within_6_months", "6_18_months", "historic"]);

export const runningIpRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RUNNING_RATE_LIMIT_PER_HOUR || process.env.HYROX_RATE_LIMIT_PER_HOUR || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests", message: "Too many submissions. Please try again later." },
});

export function validateRunningSubmission(req, res, next) {
  const body = req.body ?? {};
  const athlete = body.athlete ?? {};
  const performances = Array.isArray(body.performances) ? body.performances : [];
  const errors = [];

  const email = String(athlete.email ?? "").trim();
  if (!email || !EMAIL_RE.test(email)) {
    errors.push({ field: "athlete.email", message: "Email is required and must be valid." });
  }

  if (performances.length === 0) {
    errors.push({ field: "performances", message: "At least one performance entry is required." });
  }

  for (const [i, p] of performances.entries()) {
    if (!VALID_DISTANCES.has(p.distance)) {
      errors.push({ field: `performances.${i}.distance`, message: `Invalid distance '${p.distance}'.` });
    }
    if (!p.timeSeconds || Number(p.timeSeconds) <= 0) {
      errors.push({ field: `performances.${i}.timeSeconds`, message: "Time must be a positive number of seconds." });
    }
    if (!VALID_RECENCY.has(p.recency)) {
      errors.push({ field: `performances.${i}.recency`, message: `Invalid recency '${p.recency}'.` });
    }
  }

  if (errors.length) {
    return res.status(400).json({ error: "validation_failed", errors });
  }

  return next();
}
