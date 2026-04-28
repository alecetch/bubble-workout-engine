import express from "express";
import { pool } from "../db.js";
import { publicInternalError } from "../utils/publicError.js";

export const userEntitlementRouter = express.Router();

userEntitlementRouter.get("/users/me/entitlement", async (req, res) => {
  const userId = req.auth.user_id;
  try {
    const { rows } = await pool.query(
      `SELECT subscription_status, trial_expires_at, subscription_expires_at,
              physique_consent_at IS NOT NULL AS physique_consent_given
       FROM app_user
       WHERE id = $1`,
      [userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: "User not found." });
    }

    const { subscription_status, trial_expires_at, subscription_expires_at, physique_consent_given } = rows[0];
    const now = new Date();

    let effectiveStatus = subscription_status;
    if (subscription_status === "trialing" && new Date(trial_expires_at) < now) {
      effectiveStatus = "expired";
      await pool.query(
        `UPDATE app_user SET subscription_status = 'expired' WHERE id = $1 AND subscription_status = 'trialing'`,
        [userId],
      );
    }

    const isActive = effectiveStatus === "trialing" || effectiveStatus === "active";
    const trialDaysRemaining =
      subscription_status === "trialing"
        ? Math.max(0, Math.ceil((new Date(trial_expires_at) - now) / (1000 * 60 * 60 * 24)))
        : null;

    return res.json({
      ok: true,
      subscription_status: effectiveStatus,
      is_active: isActive,
      trial_days_remaining: trialDaysRemaining,
      trial_expires_at,
      subscription_expires_at: subscription_expires_at ?? null,
      physique_consent_given: physique_consent_given === true,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});
