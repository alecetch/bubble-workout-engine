import express from "express";
import { pool } from "../db.js";
import { publicInternalError } from "../utils/publicError.js";

export const webhookRevenuecatRouter = express.Router();

const WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET;

webhookRevenuecatRouter.post("/webhooks/revenuecat", async (req, res) => {
  const providedSecret = req.headers["x-revenuecat-signature"] ?? req.headers.authorization;
  if (!WEBHOOK_SECRET || providedSecret !== WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const event = req.body?.event;
  if (!event) {
    return res.status(400).json({ ok: false, error: "Missing event payload" });
  }

  const userId = event.app_user_id;
  const eventType = event.type;

  if (!userId || !eventType) {
    return res.status(400).json({ ok: false, error: "Missing app_user_id or type" });
  }

  try {
    let newStatus;
    let subscriptionExpiresAt = null;

    if (eventType === "INITIAL_PURCHASE" || eventType === "RENEWAL") {
      newStatus = "active";
      subscriptionExpiresAt = event.expiration_at_ms
        ? new Date(event.expiration_at_ms).toISOString()
        : null;
    } else if (eventType === "EXPIRATION") {
      newStatus = "expired";
    } else if (eventType === "CANCELLATION") {
      newStatus = "cancelled";
      subscriptionExpiresAt = event.expiration_at_ms
        ? new Date(event.expiration_at_ms).toISOString()
        : null;
    } else {
      return res.json({ ok: true, handled: false, type: eventType });
    }

    await pool.query(
      `UPDATE app_user
       SET subscription_status = $1,
           subscription_expires_at = COALESCE($2::timestamptz, subscription_expires_at),
           revenuecat_customer_id = COALESCE($3, revenuecat_customer_id)
       WHERE id = $4`,
      [newStatus, subscriptionExpiresAt, event.original_app_user_id ?? null, userId],
    );

    return res.json({ ok: true, handled: true, type: eventType, new_status: newStatus });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});
