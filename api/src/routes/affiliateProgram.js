import express from "express";
import { escapeHtml } from "./referralLanding.js";
import { wrapPage } from "../views/pageChrome.js";
import { sendEmail } from "../services/emailService.js";
import { requireInternalToken } from "../middleware/auth.js";
import { pool } from "../db.js";

export const affiliateProgramRouter = express.Router();

const AFFILIATE_CSS = `
.affiliate-page { padding: 64px 0 80px; }
.affiliate-hero { text-align: center; margin-bottom: 56px; padding: 0 24px; }
.affiliate-hero h1 { font-size: clamp(28px, 6vw, 48px); font-weight: 800; margin-bottom: 12px; }
.affiliate-hero p { color: #94A3B8; font-size: 18px; max-width: 520px; margin: 0 auto; }
.affiliate-details { max-width: 680px; margin: 0 auto 56px; padding: 0 24px; }
.affiliate-details h2 { font-size: 22px; font-weight: 700; margin-bottom: 16px; }
.commission-block { background: #1E293B; border: 1px solid #334155; border-radius: 16px; padding: 24px; margin-bottom: 32px; }
.commission-block .amount { font-size: 28px; font-weight: 800; color: #22D3EE; margin-bottom: 6px; }
.commission-block .desc { color: #94A3B8; font-size: 14px; }
.steps-row { display: flex; gap: 24px; margin-bottom: 32px; flex-wrap: wrap; }
.step-item { flex: 1; min-width: 160px; background: #1E293B; border-radius: 12px; padding: 20px; }
.step-num { color: #22D3EE; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
.step-label { font-weight: 600; font-size: 15px; }
.who-list { color: #94A3B8; font-size: 14px; line-height: 1.8; padding-left: 20px; }
.affiliate-form-section { max-width: 560px; margin: 0 auto; padding: 0 24px 40px; }
.affiliate-form-section h2 { font-size: 22px; font-weight: 700; margin-bottom: 24px; }
.form-field { margin-bottom: 20px; }
.form-field label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; color: #CBD5E1; }
.form-field input, .form-field select, .form-field textarea { width: 100%; background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 12px 16px; color: #F1F5F9; font-size: 15px; outline: none; box-sizing: border-box; }
.form-field input:focus, .form-field select:focus, .form-field textarea:focus { border-color: #22D3EE; }
.form-field textarea { min-height: 100px; resize: vertical; }
.form-field select option { background: #1E293B; }
.form-error { color: #F87171; background: #1E293B; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; font-size: 14px; }
.form-footnote { color: #64748B; font-size: 13px; margin-top: 12px; }
.applied-page { text-align: center; padding: 80px 24px; }
.applied-page h1 { font-size: clamp(24px, 5vw, 40px); font-weight: 800; margin-bottom: 16px; }
.applied-page p { color: #94A3B8; font-size: 16px; max-width: 480px; margin: 0 auto 32px; }
`;

const ALLOWED_PLATFORMS = new Set(["coach", "instagram", "youtube", "tiktok", "podcast", "other"]);

function csvEscape(val) {
  const str = val == null ? "" : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function createAffiliateHandlers(db = pool) {
  function renderForm(res, errorMsg = "", values = {}) {
    const commission = escapeHtml(process.env.AFFILIATE_COMMISSION_TEXT ?? "a generous commission");
    const errorHtml = errorMsg ? `<p class="form-error">${escapeHtml(errorMsg)}</p>` : "";
    const field = (name) => escapeHtml(values[name] ?? "");
    const selected = (value) => (values.platform === value ? " selected" : "");
    const body = `<div class="container affiliate-page">
<div class="affiliate-hero">
  <h1>Partner with Formai</h1>
  <p>Are you a personal trainer, Hyrox coach, or fitness content creator? Partner with us and earn ${commission} for every user who subscribes through your link.</p>
</div>

<div class="affiliate-details">
  <h2>How it works</h2>
  <div class="commission-block">
    <div class="amount">Earn ${commission}</div>
    <div class="desc">For every user who subscribes through your unique affiliate link.</div>
  </div>
  <div class="steps-row">
    <div class="step-item"><div class="step-num">Step 1</div><div class="step-label">Apply with your details below</div></div>
    <div class="step-item"><div class="step-num">Step 2</div><div class="step-label">We review and send your affiliate link</div></div>
    <div class="step-item"><div class="step-num">Step 3</div><div class="step-label">Earn on every subscription from your audience</div></div>
  </div>
  <h2>Who it's for</h2>
  <ul class="who-list">
    <li>Personal trainers and strength coaches</li>
    <li>Hyrox coaches and race-prep specialists</li>
    <li>Gym instructors and class coaches</li>
    <li>Fitness content creators (Instagram, YouTube, TikTok)</li>
    <li>Fitness podcasters and newsletter writers</li>
  </ul>
</div>

<div class="affiliate-form-section">
  <h2>Apply to partner</h2>
  ${errorHtml}
  <form method="POST" action="/partners">
    <div class="form-field">
      <label for="name">Your name *</label>
      <input type="text" id="name" name="name" required autocomplete="name" placeholder="Alex Smith" value="${field("name")}">
    </div>
    <div class="form-field">
      <label for="email">Email address *</label>
      <input type="email" id="email" name="email" required autocomplete="email" placeholder="you@example.com" value="${field("email")}">
    </div>
    <div class="form-field">
      <label for="platform">Platform / audience type *</label>
      <select id="platform" name="platform" required>
        <option value="">Select one</option>
        <option value="coach"${selected("coach")}>Personal trainer / coach</option>
        <option value="instagram"${selected("instagram")}>Instagram</option>
        <option value="youtube"${selected("youtube")}>YouTube</option>
        <option value="tiktok"${selected("tiktok")}>TikTok</option>
        <option value="podcast"${selected("podcast")}>Podcast</option>
        <option value="other"${selected("other")}>Other</option>
      </select>
    </div>
    <div class="form-field">
      <label for="audience_size">Audience size (optional)</label>
      <input type="text" id="audience_size" name="audience_size" placeholder="e.g. 500 clients or 12k followers" value="${field("audience_size")}">
    </div>
    <div class="form-field">
      <label for="note">Tell us about your audience (optional)</label>
      <textarea id="note" name="note" placeholder="Who do you coach or create content for? What's their training background?">${field("note")}</textarea>
    </div>
    <button type="submit" class="cta-btn" style="width:100%;">Apply to partner</button>
    <p class="form-footnote">We aim to review applications within 5 business days.</p>
  </form>
</div>
</div>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8").send(
      wrapPage("Partner with Formai", body, {
        description: "Partner with Formai as a coach or content creator and earn commission for every subscriber you refer.",
        canonical: "/partners",
        extraCss: AFFILIATE_CSS,
      }),
    );
  }

  async function postHandler(req, res) {
    const name = (req.body?.name ?? "").toString().trim();
    const rawEmail = (req.body?.email ?? "").toString().trim();
    const platform = (req.body?.platform ?? "").toString().trim();
    const audience = (req.body?.audience_size ?? "").toString().trim().slice(0, 200);
    const note = (req.body?.note ?? "").toString().trim().slice(0, 2000);
    const values = { name, email: rawEmail, platform, audience_size: audience, note };

    if (!name) return renderForm(res, "Please enter your name.", values);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) return renderForm(res, "Please enter a valid email address.", values);
    if (!ALLOWED_PLATFORMS.has(platform)) return renderForm(res, "Please select your platform or audience type.", values);

    const email = rawEmail.toLowerCase();
    try {
      await db.query(
        "INSERT INTO affiliate_applications (name, email, platform, audience_size, note) VALUES ($1, $2, $3, $4, $5)",
        [name, email, platform, audience || null, note || null],
      );
    } catch (err) {
      console.error("affiliate_applications insert error", err);
    }

    const notifyAddress = process.env.AFFILIATE_NOTIFY_EMAIL || process.env.FROM_EMAIL || process.env.SUPPORT_EMAIL || null;
    if (notifyAddress) {
      sendEmail({
        to: notifyAddress,
        subject: `New affiliate application - ${name}`,
        text: `New affiliate application:\n\nName: ${name}\nEmail: ${email}\nPlatform: ${platform}\nAudience size: ${audience || "not provided"}\nNote: ${note || "not provided"}\nTime: ${new Date().toISOString()}`,
        html: `<h2>New affiliate application</h2><table><tr><td><strong>Name</strong></td><td>${escapeHtml(name)}</td></tr><tr><td><strong>Email</strong></td><td>${escapeHtml(email)}</td></tr><tr><td><strong>Platform</strong></td><td>${escapeHtml(platform)}</td></tr><tr><td><strong>Audience</strong></td><td>${escapeHtml(audience || "-")}</td></tr><tr><td><strong>Note</strong></td><td>${escapeHtml(note || "-")}</td></tr></table>`,
      }).catch((err) => console.error("affiliate notify email error", err));
    }

    sendEmail({
      to: email,
      subject: "Thanks for applying to partner with Formai",
      text: `Hi ${name},\n\nThanks for applying to the Formai affiliate programme. We'll review your application and get back to you within 5 business days.\n\nIn the meantime, download Formai and try it yourself: ${process.env.APP_STORE_URL ?? "https://getformai.com/download"}\n\nFormai`,
      html: `<p>Hi ${escapeHtml(name)},</p><p>Thanks for applying to the Formai affiliate programme. We'll review your application and get back to you within 5 business days.</p><p><a href="${escapeHtml(process.env.APP_STORE_URL ?? "https://getformai.com/download")}">Download Formai</a></p>`,
    }).catch((err) => console.error("affiliate confirmation email error", err));

    return res.redirect(302, "/partners/applied");
  }

  return { renderForm, postHandler };
}

export function createAffiliateApplicationsCsvHandler(db = pool) {
  return async function affiliateApplicationsCsvHandler(_req, res) {
    const { rows } = await db.query(
      "SELECT id, name, email, platform, audience_size, note, created_at FROM affiliate_applications ORDER BY created_at DESC",
    );
    const header = "id,name,email,platform,audience_size,note,created_at\n";
    const csv = rows
      .map((row) => [row.id, row.name, row.email, row.platform, row.audience_size, row.note, row.created_at?.toISOString?.() ?? row.created_at].map(csvEscape).join(","))
      .join("\n");
    return res
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .setHeader("Content-Disposition", 'attachment; filename="affiliate-applications.csv"')
      .send(header + csv);
  };
}

const { renderForm: partnersGet, postHandler: partnersPost } = createAffiliateHandlers();

affiliateProgramRouter.get("/partners", (_req, res) => partnersGet(res));
affiliateProgramRouter.post("/partners", express.urlencoded({ extended: false }), partnersPost);

affiliateProgramRouter.get("/partners/applied", (_req, res) => {
  const appStoreUrl = escapeHtml(process.env.APP_STORE_URL ?? "#");
  const body = `<div class="container applied-page">
    <h1>Application received.</h1>
    <p>Thanks for applying. We'll review your details and get back to you within 5 business days.</p>
    <p style="color:#64748B;margin-bottom:32px;">In the meantime, download Formai and try it yourself.</p>
    <a href="${appStoreUrl}" class="cta-btn">Download on App Store</a>
  </div>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8").send(
    wrapPage("Application received", body, {
      description: "Your Formai affiliate application has been received.",
      extraCss: AFFILIATE_CSS,
    }),
  );
});

affiliateProgramRouter.get("/admin/affiliate-applications", requireInternalToken, createAffiliateApplicationsCsvHandler(pool));
