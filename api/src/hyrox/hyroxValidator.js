import rateLimit from "express-rate-limit";
import { RUN_KEYS, STATION_KEYS } from "./config/segmentMap.js";
import { formatSecondsToTime } from "./ingestion/timeParser.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_DIVISIONS = new Set(["open", "pro", "doubles", "mixed_doubles", "relay"]);
const REQUIRED_COMPLETE_KEYS = Object.freeze([...RUN_KEYS, ...STATION_KEYS]);

const emailHits = new Map();

const EMAIL_ALLOWLIST = new Set(
  (process.env.HYROX_EMAIL_ALLOWLIST ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
);

function error(field, message) {
  return { field, message };
}

function seconds(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function segmentName(segmentKey) {
  return String(segmentKey)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function cleanEmailMap(now = Date.now()) {
  const windowMs = 24 * 60 * 60 * 1000;
  for (const [email, hits] of emailHits.entries()) {
    const recent = hits.filter((hit) => now - hit < windowMs);
    if (recent.length) emailHits.set(email, recent);
    else emailHits.delete(email);
  }
}

export const hyroxIpRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.HYROX_RATE_LIMIT_PER_HOUR || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests", message: "Too many submissions. Please try again later." },
});

export const hyroxImportRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.HYROX_IMPORT_RATE_LIMIT_PER_HOUR || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests", message: "Too many import attempts. Please try again later." },
});

export function hyroxEmailRateLimiter(req, res, next) {
  const email = String(req.body?.athlete?.email ?? "").trim().toLowerCase();
  if (!email || EMAIL_ALLOWLIST.has(email)) return next();
  const now = Date.now();
  cleanEmailMap(now);
  const hits = emailHits.get(email) ?? [];
  if (hits.length >= 3) {
    return res.status(429).json({ error: "too_many_requests", message: "Too many submissions for this email address. Please try again tomorrow." });
  }
  hits.push(now);
  emailHits.set(email, hits);
  return next();
}

export function resetHyroxRateLimitersForTests() {
  emailHits.clear();
}

export function validateHyroxSubmission(req, res, next) {
  const body = req.body ?? {};
  const athlete = body.athlete ?? {};
  const race = body.race ?? {};
  const splits = Array.isArray(body.splits) ? body.splits : [];
  const allowPartial = body.allowPartial === true;
  const errors = [];

  const email = String(athlete.email ?? "").trim();
  if (!email || !EMAIL_RE.test(email)) {
    errors.push(error("athlete.email", "Email is required and must be valid."));
  }

  const finish = seconds(race.finishTimeSeconds);
  if (finish === null || finish <= 0) {
    errors.push(error("race.finishTimeSeconds", "Finish time is required and must be a positive whole number of seconds."));
  }

  const division = String(race.division ?? athlete.division ?? "open").trim().toLowerCase();
  if (!VALID_DIVISIONS.has(division)) {
    errors.push(error("race.division", "Division must be one of open, pro, doubles, mixed_doubles, or relay."));
  }

  const bodyweightKg = body.athleteContext?.bodyweightKg;
  const bodyweightKgNumber = Number(bodyweightKg);
  if (bodyweightKg != null && (!Number.isFinite(bodyweightKgNumber) || bodyweightKgNumber < 30 || bodyweightKgNumber > 250)) {
    errors.push(error("athleteContext.bodyweightKg", "Bodyweight must be between 30 and 250 kg."));
  }
  const heightCm = body.athleteContext?.heightCm;
  const heightCmNumber = Number(heightCm);
  if (heightCm != null && (!Number.isFinite(heightCmNumber) || heightCmNumber < 120 || heightCmNumber > 230)) {
    errors.push(error("athleteContext.heightCm", "Height must be between 120 and 230 cm."));
  }

  const suppliedKeys = new Set();
  let splitSum = 0;
  for (const [index, split] of splits.entries()) {
    const time = seconds(split?.timeSeconds);
    const field = `splits.${index}.timeSeconds`;
    if (time === null) {
      errors.push(error(field, "Split time must be a whole number of seconds."));
      continue;
    }
    if (time < 0) errors.push(error(field, "Split time cannot be negative."));
    if (time >= 0) splitSum += time;
    if (split?.segmentKey) suppliedKeys.add(split.segmentKey);
  }

  if (finish !== null && splitSum > finish + 5) {
    const over = splitSum - finish;
    errors.push(error("splits", `Your split times add up to ${formatSecondsToTime(splitSum)}, which is ${formatSecondsToTime(over)} longer than your finish time. Please check one or more splits.`));
  }

  if (!allowPartial) {
    for (const key of REQUIRED_COMPLETE_KEYS) {
      if (!suppliedKeys.has(key)) {
        errors.push(error("splits", `${segmentName(key)} split is required when submitting a complete race result.`));
      }
    }
  }

  if (errors.length) {
    return res.status(400).json({ error: "validation_failed", errors });
  }

  return next();
}
