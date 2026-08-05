import QRCode from "qrcode";
import { pool } from "../db.js";
import { getPresignedUrl } from "../services/s3Service.js";
import { sendEmail } from "../services/emailService.js";
import { getOrCreateSharePack, getPackDownloadUrl, SHARE_PACK_TTL_SECONDS } from "./sharePack/sharePackService.js";
import { SLIDE_FILENAMES } from "./sharePack/slideAssets.js";
import { buildMobileLandingPage } from "./sharePack/mobileLandingBuilder.js";
import { safeLogCalculatorEvent } from "./sharePack/eventLogger.js";

const APP_DOMAIN = process.env.APP_DOMAIN ?? "http://localhost:3000";

function shareUrl(shareToken) {
  return `${APP_DOMAIN.replace(/\/$/, "")}/hyrox/share/${shareToken}`;
}

function sendHtml(res, status, html) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).send(html);
}

function zipPrefix(zipKey = "") {
  return zipKey.replace(/[^/]+\.zip$/, "");
}

export function createSharePackHandlers(db = pool, deps = {}) {
  const createPack = deps.getOrCreateSharePack ?? getOrCreateSharePack;
  const getDownloadUrl = deps.getPackDownloadUrl ?? getPackDownloadUrl;
  const getSignedUrl = deps.getPresignedUrl ?? getPresignedUrl;
  const emailSender = deps.sendEmail ?? sendEmail;
  const qrToString = deps.qrToString ?? QRCode.toString;
  const logEvent = deps.logCalculatorEvent ?? ((event) => safeLogCalculatorEvent(db, event));

  async function logRequestEvent(event) {
    try {
      await logEvent(event);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[hyroxSharePackController] Calculator event logging failed:", err?.message);
    }
  }

  async function generatePack(req, res) {
    try {
      const { submissionId } = req.params;
      const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : null;
      await logRequestEvent({ submissionId, sessionId, eventName: "pack_requested", metadata: { trigger: "button" } });
      const pack = await createPack(submissionId, db, { sessionId });
      const downloadUrl = await getDownloadUrl(pack, db);
      return res.json({
        packId: pack.id,
        shareToken: pack.share_token,
        downloadUrl,
        shareUrl: shareUrl(pack.share_token),
        caption: pack.caption,
        slideCount: SLIDE_FILENAMES.length,
        expiresAt: pack.expires_at,
      });
    } catch (err) {
      const status = err.status ?? 500;
      req.log?.error?.({ event: "hyrox.share_pack.error", err: err?.message });
      return res.status(status).json({ error: err.message });
    }
  }

  async function sendPackEmail(req, res) {
    try {
      const { submissionId } = req.params;
      const email = String(req.body?.email ?? "").trim();
      if (!email) return res.status(400).json({ error: "email is required" });
      const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : null;

      await logRequestEvent({ submissionId, sessionId, eventName: "pack_requested", metadata: { trigger: "email" } });
      const pack = await createPack(submissionId, db, { sessionId });
      const downloadUrl = await getDownloadUrl(pack, db);

      await emailSender({
        to: email,
        subject: "Your Forma HYROX Instagram Pack",
        html: `<p>Your Forma HYROX carousel pack is ready.</p>
               <p><a href="${downloadUrl}">Download your pack</a></p>
               <p>The ZIP includes numbered carousel slides and a ready-to-copy caption.<br/>
               Download on your phone, then upload to Instagram in numbered order.</p>
               <p><small>This link expires in 7 days.</small></p>`,
        text: `Your Forma HYROX carousel pack is ready.\n\nDownload: ${downloadUrl}\n\nThis link expires in 7 days.`,
      });

      return res.json({ sent: true });
    } catch (err) {
      req.log?.error?.({ event: "hyrox.share_pack.email_error", err: err?.message });
      return res.status(500).json({ sent: false, error: err.message });
    }
  }

  async function getQrCode(req, res) {
    try {
      const { submissionId } = req.params;
      const result = await db.query(
        "SELECT share_token FROM hyrox_share_packs WHERE submission_id = $1 AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at DESC LIMIT 1",
        [submissionId],
      );
      if (!result.rows[0]) return res.status(404).json({ error: "Pack not found" });

      const svg = await qrToString(shareUrl(result.rows[0].share_token), { type: "svg", margin: 1 });
      res.setHeader("Content-Type", "image/svg+xml");
      return res.send(svg);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  async function mobileLandingPage(req, res) {
    try {
      const { shareToken } = req.params;
      const result = await db.query(
        "SELECT sp.*, s.race_name FROM hyrox_share_packs sp JOIN hyrox_submissions s ON s.id = sp.submission_id WHERE sp.share_token = $1 LIMIT 1",
        [shareToken],
      );
      const pack = result.rows[0];
      if (!pack) return sendHtml(res, 404, buildMobileLandingPage({ notFound: true }));
      if (pack.expires_at && new Date(pack.expires_at) < new Date()) {
        return sendHtml(res, 410, buildMobileLandingPage({ expired: true }));
      }

      const downloadUrl = await getSignedUrl(pack.zip_key, SHARE_PACK_TTL_SECONDS);
      const prefix = zipPrefix(pack.zip_key);
      const slideLinks = await Promise.all(
        SLIDE_FILENAMES.map((filename) => getSignedUrl(`${prefix}${filename}`, SHARE_PACK_TTL_SECONDS)),
      );

      return sendHtml(res, 200, buildMobileLandingPage({
        eventName: pack.race_name,
        caption: pack.caption,
        downloadUrl,
        slideLinks,
      }));
    } catch (err) {
      req.log?.error?.({ event: "hyrox.share_pack.mobile_error", err: err?.message });
      return sendHtml(res, 500, buildMobileLandingPage({ notFound: true }));
    }
  }

  return { generatePack, sendPackEmail, getQrCode, mobileLandingPage };
}

export const sharePackHandlers = createSharePackHandlers();
