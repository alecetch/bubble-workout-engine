import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { safeString } from "../utils/validate.js";
import { publicInternalError } from "../utils/publicError.js";
import { generateReferralCode } from "../utils/referralCode.js";

import { getBrand } from "../config/brand.js";
import { makeReferralRewardService } from "../services/referralRewardService.js";

export const referralRouter = express.Router();
referralRouter.use(requireAuth);

function resolveUserId(req) {
  const userId = safeString(req.auth?.user_id);
  if (!userId) throw { code: "unauthorized", message: "No user ID in token" };
  return userId;
}

function buildShareUrl(code) {
  const base = process.env.APP_BASE_URL ?? getBrand().siteUrl;
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
      return res.status(err.code === "unauthorized" ? 401 : 500).json({ ok: false, request_id, error: publicInternalError(err) });
    }
  };
}

export function createReferralStatsHandler(db = pool) {
  return async function referralStatsHandler(req, res) {
    const { request_id } = req;
    try {
      const userId = resolveUserId(req);
      return res.json({ ok: true, ...await makeReferralRewardService({ db }).getStats(userId) });
    } catch (err) {
      return res.status(err.code === "unauthorized" ? 401 : 500).json({ ok: false, request_id, error: publicInternalError(err) });
    }
  };
}

referralRouter.get("/users/me/referral-code", createReferralCodeHandler(pool));
referralRouter.get("/users/me/referral-stats", createReferralStatsHandler(pool));
