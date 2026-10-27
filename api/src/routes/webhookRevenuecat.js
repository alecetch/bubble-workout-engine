import { timingSafeEqual } from "node:crypto";
import express from "express";
import { pool } from "../db.js";
import { publicInternalError } from "../utils/publicError.js";
import { syncUserEntitlement } from "../services/revenuecatSync.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE_EVENTS = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"]);
const HANDLED_EVENTS = new Set([...ACTIVE_EVENTS, "CANCELLATION", "BILLING_ISSUE", "EXPIRATION", "TRANSFER"]);

function authorized(provided, secret) {
  if (typeof provided !== "string" || typeof secret !== "string" || !secret) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validTimestamp(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 8.64e15;
}

export function createWebhookRevenuecatHandler(db, { syncUserEntitlementFn = syncUserEntitlement, syncDeps = {} } = {}) {
  return async function webhookRevenuecatHandler(req, res) {
    if (!authorized(req.headers["x-revenuecat-signature"] ?? req.headers.authorization, process.env.REVENUECAT_WEBHOOK_SECRET)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    const event = req.body?.event;
    if (!event || typeof event !== "object" || Array.isArray(event) || typeof event.type !== "string" || !event.type.trim()) {
      return res.status(400).json({ ok: false, error: "Missing or invalid event payload." });
    }
    const type = event.type;
    if (!HANDLED_EVENTS.has(type)) return res.json({ ok: true, handled: false, type });
    if (!validTimestamp(event.event_timestamp_ms)
      || (event.expiration_at_ms != null && !validTimestamp(event.expiration_at_ms))
      || (event.grace_period_expiration_at_ms != null && !validTimestamp(event.grace_period_expiration_at_ms))) {
      return res.status(400).json({ ok: false, error: "Missing or invalid event timestamp." });
    }
    if (type === "TRANSFER" ? !Array.isArray(event.transferred_from) || !Array.isArray(event.transferred_to)
      : typeof event.app_user_id !== "string" || !event.app_user_id) {
      return res.status(400).json({ ok: false, error: "Missing or invalid subscriber identity." });
    }
    const targets = type === "TRANSFER"
      ? new Map([...event.transferred_from.map(id => [typeof id === "string" ? id.toLowerCase() : id, "expired"]), ...event.transferred_to.map(id => [typeof id === "string" ? id.toLowerCase() : id, "active"])])
      : new Map([[event.app_user_id.toLowerCase(), ACTIVE_EVENTS.has(type) ? "active"
        : type === "CANCELLATION" ? "cancelled" : type === "BILLING_ISSUE" ? "billing_issue" : "expired"]]);
    let handled = false;
    let reason;
    let syncFailed = false;
    try {
      for (const [id, status] of targets) {
        if (typeof id !== "string" || !UUID.test(id)) {
          req.log?.warn?.({ event: "revenuecat.webhook.non_uuid_app_user_id", type }, "Skipping non-UUID RevenueCat user");
          reason ??= "non_uuid_app_user_id";
          continue;
        }
        const apiKey = syncDeps.apiKey ?? process.env.REVENUECAT_SECRET_API_KEY;
        if (type === "TRANSFER" && apiKey?.trim()) {
          try {
            const result = await syncUserEntitlementFn(db, id, { ...syncDeps, apiKey, eventTimestampMs: event.event_timestamp_ms });
            handled ||= result.applied;
            reason ??= result.reason;
            if (result.reason === "unknown_user") req.log?.warn?.({ event: "revenuecat.webhook.unknown_user", userId: id, type }, "Unknown RevenueCat user");
          } catch (err) {
            if (err.code !== "entitlement_sync_failed" && err.code !== "entitlement_sync_unavailable") throw err;
            req.log?.warn?.({ event: "revenuecat.webhook.sync_failed", type, userId: id }, "RevenueCat transfer sync unavailable");
            syncFailed = true;
          }
          continue;
        }
        const expiry = type === "BILLING_ISSUE" ? event.grace_period_expiration_at_ms : event.expiration_at_ms;
        // Keep existing customer metadata, but do not claim an alias held by another UUID after a transfer.
        const result = await db.query(`UPDATE app_user SET subscription_status = $2,
            subscription_expires_at = CASE WHEN $4::boolean THEN COALESCE($3::timestamptz, subscription_expires_at) ELSE $3::timestamptz END,
            revenuecat_customer_id = CASE WHEN $6::text IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM app_user rc_owner WHERE rc_owner.revenuecat_customer_id = $6 AND rc_owner.id <> $1
            ) THEN $6 ELSE revenuecat_customer_id END,
            subscription_event_at = to_timestamp($5 / 1000.0)
          WHERE id = $1 AND (subscription_event_at IS NULL OR subscription_event_at < to_timestamp($5 / 1000.0))`,
        [id, status, expiry == null ? null : new Date(expiry).toISOString(), type === "BILLING_ISSUE" || type === "CANCELLATION", event.event_timestamp_ms,
          typeof event.original_app_user_id === "string" ? event.original_app_user_id : null]);
        if (result.rowCount > 0) handled = true;
        else {
          const exists = (await db.query("SELECT id FROM app_user WHERE id = $1", [id])).rows.length > 0;
          reason ??= exists ? "stale_event" : "unknown_user";
          if (!exists) req.log?.warn?.({ event: "revenuecat.webhook.unknown_user", userId: id, type }, "Unknown RevenueCat user");
        }
      }
      // A transient upstream failure must not be acknowledged, or RevenueCat drops the transfer.
      // Retries are safe: targets already synced for this event are skipped as stale.
      if (syncFailed) {
        return res.status(503).json({ ok: false, code: "transfer_sync_failed", error: "RevenueCat transfer sync failed; retry later." });
      }
      return res.json({ ok: true, handled, type,
        ...(handled && type !== "TRANSFER" ? { new_status: targets.get(event.app_user_id.toLowerCase()) } : {}),
        ...(!handled ? { reason: reason ?? "no_targets" } : {}),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  };
}

export const webhookRevenuecatRouter = express.Router();
webhookRevenuecatRouter.post("/webhooks/revenuecat", createWebhookRevenuecatHandler(pool));
