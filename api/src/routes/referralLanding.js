import express from "express";
import rateLimit from "express-rate-limit";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db.js";
import { publicInternalError } from "../utils/publicError.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, "../views/referralLanding.html");
const CODE_PATTERN = /^[A-Za-z0-9]{1,20}$/;

const previewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: "rate_limited", error: "Too many attempts. Try again later." },
});

export const referralLandingRouter = express.Router();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function isValidCode(code) {
  return CODE_PATTERN.test(code);
}

function deriveReferrerName(email) {
  const localPart = String(email ?? "").split("@")[0]?.trim();
  if (!localPart) return "A friend";
  return localPart.charAt(0).toUpperCase() + localPart.slice(1);
}

async function findReferrerByCode(db, code) {
  if (!isValidCode(code)) return null;
  const result = await db.query(
    "SELECT email FROM app_user WHERE referral_code = $1 LIMIT 1",
    [code],
  );
  return result.rows[0] ?? null;
}

export function createLandingPageHandler(db = pool, templatePath = TEMPLATE_PATH) {
  return async function landingPageHandler(req, res) {
    try {
      const code = String(req.params?.code ?? "");
      const referrer = await findReferrerByCode(db, code);
      const referrerName = referrer ? deriveReferrerName(referrer.email) : "A friend";
      const template = await readFile(templatePath, "utf8");
      const html = template
        .replaceAll("{{REFERRER_NAME}}", escapeHtml(referrerName))
        .replaceAll("{{REFERRAL_CODE}}", escapeHtml(code))
        .replaceAll("{{APP_STORE_URL}}", escapeHtml(process.env.APP_STORE_URL ?? ""));

      return res
        .setHeader("Content-Type", "text/html; charset=utf-8")
        .send(html);
    } catch (err) {
      req.log?.error?.({ event: "referral.landing.error", err: err?.message });
      return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
    }
  };
}

export function createReferralPreviewHandler(db = pool) {
  return async function referralPreviewHandler(req, res) {
    try {
      const code = String(req.params?.code ?? "");
      const referrer = await findReferrerByCode(db, code);
      await delay(50);

      if (!referrer) {
        return res.json({ valid: false });
      }

      return res.json({
        valid: true,
        referrerFirstName: deriveReferrerName(referrer.email),
      });
    } catch (err) {
      req.log?.error?.({ event: "referral.preview.error", err: err?.message });
      return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
    }
  };
}

referralLandingRouter.get("/api/referral/preview/:code", previewLimiter, createReferralPreviewHandler(pool));
referralLandingRouter.get("/ref/:code", createLandingPageHandler(pool));
