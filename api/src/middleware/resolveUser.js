// api/src/middleware/resolveUser.js
import { pool } from "../db.js";

/**
 * Async middleware — resolves bubble_user_id query param to an internal user UUID
 * and sets req.auth.user_id so that subsequent handlers can read it via toAuthUserId().
 *
 * Falls through without modifying req if bubble_user_id is not provided,
 * allowing JWT-based auth paths to work unchanged.
 */
export function makeResolveBubbleUser(db = pool) {
  return async function resolveBubbleUser(req, res, next) {
    const { request_id } = req;
    const bubbleUserId = (req.query.bubble_user_id ?? "").toString().trim();

    if (!bubbleUserId) {
      return res.status(401).json({
        ok: false,
        request_id,
        code: "unauthorized",
        error: "bubble_user_id is required",
      });
    }

    try {
      const result = await db.query(
        "SELECT id FROM app_user WHERE bubble_user_id = $1 LIMIT 1",
        [bubbleUserId],
      );

      if (result.rowCount === 0) {
        return res.status(401).json({
          ok: false,
          code: "unauthorized",
          error: "User not found for bubble_user_id",
        });
      }

      req.auth = { ...(req.auth ?? {}), user_id: result.rows[0].id };
      return next();
    } catch (err) {
      req.log.error({ event: "auth.resolve_user.error", err: err?.message }, "resolveBubbleUser DB error");
      return res.status(500).json({
        ok: false,
        code: "internal_error",
        error: "Failed to resolve user identity",
      });
    }
  };
}

export const resolveBubbleUser = makeResolveBubbleUser();
