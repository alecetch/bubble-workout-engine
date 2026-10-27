import { pool } from "../db.js";
import { computeEntitlement } from "../services/entitlement.js";

export function makeRequireEntitlement(db = pool) {
  return async function requireEntitlement(req, res, next) {
    const userId = req.auth?.user_id;
    if (!userId) {
      return res.status(401).json({ ok: false, code: "unauthorized", error: "Missing user." });
    }

    try {
      const { rows } = await db.query(
        `SELECT subscription_status, trial_expires_at, subscription_expires_at FROM app_user WHERE id = $1`,
        [userId],
      );

      if (rows.length === 0) {
        return res.status(404).json({ ok: false, code: "user_not_found", error: "User not found." });
      }

      if (!computeEntitlement(rows[0]).isEntitled) {
        return res.status(402).json({
          ok: false,
          code: "subscription_required",
          error: "Your trial has ended. Subscribe to continue.",
        });
      }

      return next();
    } catch (err) {
      return res.status(500).json({ ok: false, code: "internal_error", error: err.message });
    }
  };
}

export const requireEntitlement = makeRequireEntitlement();
