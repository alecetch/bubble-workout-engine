import express from "express";
import { pool } from "../db.js";
import { publicInternalError } from "../utils/publicError.js";
import { computeEntitlement } from "../services/entitlement.js";
import { ENTITLEMENT_USER_COLUMNS, syncUserEntitlement } from "../services/revenuecatSync.js";
import { createEntitlementSyncRateLimiter } from "../middleware/rateLimits.js";

export function entitlementResponse(row, now = new Date()) {
  const state = computeEntitlement(row, now);
  const trialEnd = row.trial_expires_at == null ? NaN : new Date(row.trial_expires_at).getTime();
  return {
    ok: true,
    subscription_status: state.status === "billing_issue" ? "active" : state.status,
    is_active: state.isEntitled,
    trial_days_remaining: row.subscription_status === "trialing"
      ? Math.max(0, Math.ceil(((Number.isFinite(trialEnd) ? trialEnd : 0) - new Date(now).getTime()) / 86_400_000)) : null,
    trial_expires_at: row.trial_expires_at,
    subscription_expires_at: row.subscription_expires_at ?? null,
    physique_consent_given: row.physique_consent_given === true,
    is_premium: state.isEntitled && state.isPaid,
    will_renew: state.willRenew,
    billing_issue: state.billingIssue,
  };
}

export function createUserEntitlementHandler(db) {
  return async function userEntitlementHandler(req, res) {
    const userId = req.auth?.user_id;
    if (!userId) return res.status(401).json({ ok: false, code: "unauthorized", error: "Missing user." });
    try {
      let row = (await db.query(`SELECT ${ENTITLEMENT_USER_COLUMNS} FROM app_user WHERE id = $1`, [userId])).rows[0];
      if (!row) return res.status(404).json({ ok: false, error: "User not found." });
      const now = new Date();
      if (["trialing", "cancelled", "billing_issue"].includes(row.subscription_status)
        && computeEntitlement(row, now).status === "expired") {
        const expiryColumn = row.subscription_status === "trialing" ? "trial_expires_at" : "subscription_expires_at";
        const result = await db.query(`UPDATE app_user SET subscription_status = 'expired'
          WHERE id = $1 AND subscription_status = $2
            AND (${expiryColumn} IS NULL OR ${expiryColumn} ${row.subscription_status === "trialing" ? "<" : "<="} $3::timestamptz)`,
        [userId, row.subscription_status, now]);
        // A concurrent renewal can keep the same status but extend its expiry.
        if (result.rowCount === 0) {
          row = (await db.query(`SELECT ${ENTITLEMENT_USER_COLUMNS} FROM app_user WHERE id = $1`, [userId])).rows[0];
          if (!row) return res.status(404).json({ ok: false, error: "User not found." });
        }
      }
      return res.json(entitlementResponse(row, now));
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  };
}

export function createEntitlementSyncHandler(db, deps = {}) {
  return async function entitlementSyncHandler(req, res) {
    if (!req.auth?.user_id) return res.status(401).json({ ok: false, code: "unauthorized", error: "Missing user." });
    const apiKey = deps.apiKey ?? process.env.REVENUECAT_SECRET_API_KEY;
    if (!apiKey?.trim()) return res.status(503).json({ ok: false, code: "entitlement_sync_unavailable", error: "Entitlement sync is not configured." });
    try {
      const result = await syncUserEntitlement(db, req.auth.user_id, { ...deps, apiKey });
      if (!result.row) return res.status(404).json({ ok: false, error: "User not found." });
      return res.json(entitlementResponse(result.row));
    } catch (err) {
      if (err.code === "entitlement_sync_unavailable" || err.code === "entitlement_sync_failed") {
        return res.status(err.code === "entitlement_sync_unavailable" ? 503 : 502).json({
          ok: false, code: err.code, error: err.code === "entitlement_sync_unavailable"
            ? "Entitlement sync is not configured." : "Could not sync your subscription. Please try again.",
        });
      }
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  };
}

export function createUserEntitlementRouter({ db = pool, syncDeps = {}, rateLimiter = createEntitlementSyncRateLimiter() } = {}) {
  const router = express.Router();
  router.get("/users/me/entitlement", createUserEntitlementHandler(db));
  router.post("/users/me/entitlement/sync", rateLimiter, createEntitlementSyncHandler(db, syncDeps));
  return router;
}

export const userEntitlementRouter = createUserEntitlementRouter();
