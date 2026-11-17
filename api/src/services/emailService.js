/**
 * emailService.js
 *
 * Provider abstraction for transactional email.
 * Controlled by EMAIL_PROVIDER env var:
 *
 *   console  — logs to stdout only (CI / fallback)
 *   smtp     — sends via SMTP (Mailpit on local dev)
 *   resend   — uses the Resend API (production on Fly)
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getBrand } from '../config/brand.js';
import { createTransport } from "nodemailer";

const PROVIDER = (process.env.EMAIL_PROVIDER || "console").trim().toLowerCase();
const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || "noreply@forma.fit";
const APP_NAME = process.env.EMAIL_APP_NAME || "Forma";

// ── Resend (production) ──────────────────────────────────────────────────────

async function sendViaResend({ to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: `${APP_NAME} <${FROM_ADDRESS}>`, to, subject, text, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

// ── SMTP / Mailpit (local dev) ───────────────────────────────────────────────

function getSmtpTransport() {
  return createTransport({
    host: process.env.EMAIL_SMTP_HOST || "mailpit",
    port: Number(process.env.EMAIL_SMTP_PORT || 1025),
    secure: false,
    ignoreTLS: true,
  });
}

async function sendViaSmtp({ to, subject, text, html }) {
  const transport = getSmtpTransport();
  await transport.sendMail({ from: `${APP_NAME} <${FROM_ADDRESS}>`, to, subject, text, html });
}

// ── Console (CI / fallback) ──────────────────────────────────────────────────

function sendViaConsole({ to, subject, text }) {
  console.log(`\n[emailService] ── EMAIL (console mode) ──`);
  console.log(`  To:      ${to}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Body:\n${text}`);
  console.log(`────────────────────────────────────────\n`);
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function sendEmail({ to, subject, text, html, sensitive = false }) {
  if (PROVIDER === "resend") return sendViaResend({ to, subject, text, html });
  if (PROVIDER === "smtp") return sendViaSmtp({ to, subject, text, html });
  if (sensitive) { console.log('[emailService] Sensitive auth email suppressed in console mode.'); return; }
  return sendViaConsole({ to, subject, text, html });
}

// ── Reset-code email template ────────────────────────────────────────────────

export async function sendPasswordResetEmail({ to, code }) {
  const subject = `${APP_NAME} — your password reset code`;

  const text = [
    `Your ${APP_NAME} password reset code is:`,
    ``,
    `  ${code}`,
    ``,
    `Enter this code in the app to reset your password.`,
    `It expires in 15 minutes and can only be used once.`,
    ``,
    `If you didn't request a reset, you can ignore this email.`,
  ].join("\n");

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="margin:0 0 8px">${APP_NAME}</h2>
      <p style="color:#6b7280;margin:0 0 24px">Password reset</p>
      <p style="margin:0 0 16px">Enter the code below in the app to reset your password.</p>
      <div style="background:#f3f4f6;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px">
        <span style="font-size:40px;font-weight:700;letter-spacing:8px;font-family:monospace">${code}</span>
      </div>
      <p style="color:#6b7280;font-size:13px;margin:0">
        This code expires in 15 minutes and can only be used once.<br>
        If you didn't request a reset, you can ignore this email.
      </p>
    </div>
  `.trim();

  return sendEmail({ to, subject, text, html, sensitive: true });
}

// ── Hash helper (shared with auth routes) ───────────────────────────────────

export function resetHmacSecret(env = process.env) {
  if (typeof env.PASSWORD_RESET_HMAC_SECRET === 'string' && env.PASSWORD_RESET_HMAC_SECRET.length >= 32) return env.PASSWORD_RESET_HMAC_SECRET;
  return createHmac('sha256', env.JWT_SECRET).update('password-reset-v1').digest();
}

export function hashResetCode(code, secret = resetHmacSecret()) {
  return createHmac('sha256', secret).update(String(code)).digest('hex');
}

export function resetCodeMatches(code, storedHex, secret = resetHmacSecret()) {
  if (typeof storedHex !== 'string' || !/^[0-9a-f]{64}$/i.test(storedHex)) return false;
  const stored = Buffer.from(storedHex, 'hex');
  const candidate = Buffer.from(hashResetCode(code, secret), 'hex');
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

export async function sendPasswordChangedEmail({ to, changedAt }) {
  const brand = getBrand();
  const support = process.env.SUPPORT_EMAIL ?? brand.supportEmail;
  const text = `Your password was changed on ${new Date(changedAt).toUTCString()}. If this wasn't you, reset your password straight away and contact ${support}.`;
  return sendEmail({ to, subject: `Your ${brand.name} password was changed`, text, sensitive: true });
}
