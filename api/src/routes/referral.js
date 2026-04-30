import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { safeString } from "../utils/validate.js";
import { publicInternalError } from "../utils/publicError.js";
import { generateReferralCode } from "../utils/referralCode.js";

export const referralRouter = express.Router();
referralRouter.use(requireAuth);

function resolveUserId(req) {
  const userId = safeString(req.auth?.user_id);
  if (!userId) throw { code: "unauthorized", message: "No user ID in token" };
  return userId;
}

function buildShareUrl(code) {
  const base = process.env.APP_BASE_URL ?? "https://getformai.com";
  return `${base.replace(/\/$/, "")}/ref/${code}`;
}

export function createReferralCodeHandler(db = pool) {
  return async function referralCodeHandler(req, res) {
    const { request_id } = req;
    try {
      const userId = resolveUserId(req);
      const result = await db.query(
        `SELECT referral_code FROM app_user WHERE id = $1`,
        [userId],
      );
      let code = result.rows[0]?.referral_code ?? null;

      if (!code) {
        code = generateReferralCode();
        await db.query(
          `UPDATE app_user SET referral_code = $1 WHERE id = $2`,
          [code, userId],
        );
      }

      return res.json({ ok: true, code, shareUrl: buildShareUrl(code) });
    } catch (err) {
      return res.status(500).json({ ok: false, request_id, error: publicInternalError(err) });
    }
  };
}

export function createReferralStatsHandler(db = pool) {
  return async function referralStatsHandler(req, res) {
    const { request_id } = req;
    try {
      const userId = resolveUserId(req);
      const result = await db.query(
        `SELECT
           COUNT(*) FILTER (WHERE converted_at IS NOT NULL) AS conversions,
           COUNT(*) FILTER (WHERE reward_granted_at IS NOT NULL) AS rewards_granted,
           COUNT(*) AS total_referrals
         FROM referral_conversion
         WHERE referrer_user_id = $1`,
        [userId],
      );
      const row = result.rows[0] ?? {};
      return res.json({
        ok: true,
        totalReferrals: Number(row.total_referrals ?? 0),
        conversions: Number(row.conversions ?? 0),
        rewardsGranted: Number(row.rewards_granted ?? 0),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, request_id, error: publicInternalError(err) });
    }
  };
}

referralRouter.get("/users/me/referral-code", createReferralCodeHandler(pool));
referralRouter.get("/users/me/referral-stats", createReferralStatsHandler(pool));
