import { pool } from "../db.js";

export function makeRequirePremium(db = pool) {
  return async function requirePremium(req, res, next) {
    const userId = req.auth?.user_id;
    if (!userId) {
      return res.status(401).json({ ok: false, code: "unauthorized", error: "Missing user." });
    }
    try {
      const { rows } = await db.query(
        `SELECT subscription_status FROM app_user WHERE id = $1`,
        [userId],
      );
      if (rows.length === 0) {
        return res.status(404).json({ ok: false, code: "user_not_found", error: "User not found." });
      }
      if (rows[0].subscription_status !== "active") {
        return res.status(402).json({
          ok: false,
          code: "premium_required",
          error: "This feature requires an active subscription.",
        });
      }
      return next();
    } catch (err) {
      return res.status(500).json({ ok: false, code: "internal_error", error: err.message });
    }
  };
}

export const requirePremium = makeRequirePremium();
