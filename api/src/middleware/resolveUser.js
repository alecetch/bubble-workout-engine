// api/src/middleware/resolveUser.js
import { pool } from "../db.js";

/**
 * Async middleware — resolves bubble_user_id query param to an internal user UUID
 * and sets req.auth.user_id so that subsequent handlers can read it via toAuthUserId().
 *
 * Falls through without modifying req if bubble_user_id is not provided,
 * allowing JWT-based auth paths to work unchanged.
 */
export async function resolveBubbleUser(req, res, next) {
  const bubbleUserId = (req.query.bubble_user_id ?? "").toString().trim();

  if (!bubbleUserId) {
    return next();
  }

  try {
    const result = await pool.query(
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
    console.error("resolveBubbleUser error:", err);
    return res.status(500).json({
      ok: false,
      code: "internal_error",
      error: "Failed to resolve user identity",
    });
  }
}
