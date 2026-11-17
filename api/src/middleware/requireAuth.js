import jwt from "jsonwebtoken";
import { pool } from '../db.js';
import logger from '../utils/logger.js';

const cache = new Map();
const defaultLookup = async userId => (await pool.query('SELECT password_changed_at FROM app_user WHERE id=$1', [userId])).rows[0]?.password_changed_at ?? null;
export function invalidatePasswordChangedAt(userId) { cache.delete(userId); }

async function passwordChangedAt(userId, lookup) {
  let entry = cache.get(userId);
  if (!entry || entry.lookup !== lookup || entry.expiresAt <= Date.now()) {
    cache.delete(userId);
    if (cache.size >= 10000) cache.delete(cache.keys().next().value);
    entry = { lookup, expiresAt: Date.now() + 30000, promise: Promise.resolve().then(() => lookup(userId)) };
    cache.set(userId, entry);
  }
  try { return await entry.promise; }
  catch (err) { if (cache.get(userId) === entry) cache.delete(userId); throw err; }
}

export function makeRequireAuth(
  secret = process.env.JWT_SECRET,
  issuer = process.env.JWT_ISSUER,
  { getPasswordChangedAt = defaultLookup } = {},
) {
  return async function requireAuth(req, res, next) {
    const authHeader = req.headers["authorization"] ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({
        ok: false,
        code: "unauthorized",
        error: "Missing authorization token",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secret, { issuer, algorithms: ["HS256"] });
    } catch (err) {
      const isExpired = err.name === "TokenExpiredError";
      return res.status(401).json({
        ok: false,
        code: isExpired ? "token_expired" : "invalid_token",
        error: isExpired ? "Token expired" : "Invalid token",
      });
    }
    let changedAt;
    try { changedAt = await passwordChangedAt(decoded.sub, getPasswordChangedAt); }
    catch { (req.log ?? logger).warn?.({ event: 'auth.password_changed_at.lookup_failed' }); }
    if (changedAt && (!Number.isFinite(decoded.iat) || decoded.iat * 1000 < new Date(changedAt).getTime() - 1000)) {
      return res.status(401).json({ ok: false, code: 'invalid_token', error: 'Invalid token' });
    }
    req.auth = { ...(req.auth ?? {}), user_id: decoded.sub };
    return next();
  };
}

export const requireAuth = makeRequireAuth();
