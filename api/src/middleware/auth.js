// api/src/middleware/auth.js
import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time token comparison to prevent timing-oracle attacks.
 * Returns false (not throws) on any mismatch including length differences.
 */
function safeTokenCompare(a, b) {
  try {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

/**
 * requireInternalToken — admin and internal route guard.
 *
 * Requires header:  X-Internal-Token: <value>
 * Matched against:  process.env.INTERNAL_API_TOKEN
 *
 * Fail-safe: if INTERNAL_API_TOKEN is not set in the environment, every
 * request is rejected rather than accidentally left open.
 *
 * Guards admin and internal routes only; end-user routes use requireAuth.
 */
export function requireInternalToken(req, res, next) {
  const { request_id } = req;
  const internalToken = (req.headers["x-internal-token"] || "").toString();
  const expectedInternal = (process.env.INTERNAL_API_TOKEN || "").toString();

  const internalConfigured = Boolean(expectedInternal);

  if (!internalConfigured) {
    return res.status(401).json({
      ok: false,
      request_id,
      code: "unauthorized",
      error: "Server authentication is not configured",
    });
  }

  const internalOk = internalConfigured && safeTokenCompare(internalToken, expectedInternal);

  if (!internalOk) {
    return res.status(401).json({
      ok: false,
      request_id,
      code: "unauthorized",
      error: "Invalid or missing X-Internal-Token",
    });
  }

  next();
}

export function requireTrustedAdminOrigin(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }

  const origin = (req.get("origin") || "").trim();
  if (!origin) {
    return next();
  }

  const host = (req.get("host") || "").trim();
  const configuredOrigin = (process.env.ADMIN_ALLOWED_ORIGIN || "").trim();
  const forwardedProto = (req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const proto = forwardedProto || req.protocol || "http";
  const allowedOrigins = new Set();

  if (configuredOrigin) allowedOrigins.add(configuredOrigin);
  if (host) allowedOrigins.add(`${proto}://${host}`);

  if (!allowedOrigins.has(origin)) {
    return res.status(403).json({
      ok: false,
      request_id: req.request_id,
      code: "forbidden_origin",
      error: "Origin not allowed for admin mutation",
    });
  }

  next();
}
