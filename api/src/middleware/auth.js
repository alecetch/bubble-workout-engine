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
 * requireInternalToken — lightweight write-route guard.
 *
 * Requires header:  X-Internal-Token: <value>
 * Matched against:  process.env.INTERNAL_API_TOKEN
 *
 * Fail-safe: if INTERNAL_API_TOKEN is not set in the environment, every
 * request is rejected rather than accidentally left open.
 *
 * TODO: replace with per-user JWT / session auth before public launch.
 */
export function requireInternalToken(req, res, next) {
  const { request_id } = req;
  const token = (req.headers["x-internal-token"] || "").toString();
  const expected = (process.env.INTERNAL_API_TOKEN || "").toString();

  if (!expected) {
    return res.status(401).json({
      ok: false,
      request_id,
      code: "unauthorized",
      error: "Server authentication is not configured",
    });
  }

  if (!safeTokenCompare(token, expected)) {
    return res.status(401).json({
      ok: false,
      request_id,
      code: "unauthorized",
      error: "Invalid or missing X-Internal-Token",
    });
  }

  next();
}
