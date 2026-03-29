// api/src/middleware/resolveUser.js
import { pool } from "../db.js";
import { findInternalUserIdByExternalId, isUuid, readRequestedUserId } from "../utils/userIdentity.js";

/**
 * Async middleware — resolves user_id query param to an internal user UUID
 * and sets req.auth.user_id so that subsequent handlers can read it via toAuthUserId().
 *
 * Falls through without modifying req if user_id is not provided,
 * allowing JWT-based auth paths to work unchanged.
 */
export function makeResolveUser(db = pool) {
  return async function resolveUser(req, res, next) {
    const { request_id } = req;
    const requestedUserId = readRequestedUserId(req.query);

    if (!requestedUserId) {
      return res.status(401).json({
        ok: false,
        request_id,
        code: "unauthorized",
        error: "user_id is required",
      });
    }

    try {
      const internalUserId = isUuid(requestedUserId)
        ? requestedUserId
        : await findInternalUserIdByExternalId(db, requestedUserId);

      if (!internalUserId) {
        return res.status(401).json({
          ok: false,
          code: "unauthorized",
          error: "User not found for user_id",
        });
      }

      req.auth = { ...(req.auth ?? {}), user_id: internalUserId };
      return next();
    } catch (err) {
      req.log.error({ event: "auth.resolve_user.error", err: err?.message }, "resolveUser DB error");
      return res.status(500).json({
        ok: false,
        code: "internal_error",
        error: "Failed to resolve user identity",
      });
    }
  };
}

export const resolveUser = makeResolveUser();
