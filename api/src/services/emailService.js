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

import { createHash } from "node:crypto";
import { createTransport } from "nodemailer";

const PROVIDER = (process.env.EMAIL_PROVIDER || "console").trim().toLowerCase();
const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || "noreply@formai.local";
const APP_NAME = process.env.EMAIL_APP_NAME || "Formai";

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

export async function sendEmail({ to, subject, text, html }) {
  if (PROVIDER === "resend") return sendViaResend({ to, subject, text, html });
  if (PROVIDER === "smtp") return sendViaSmtp({ to, subject, text, html });
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

  return sendEmail({ to, subject, text, html });
}

// ── Hash helper (shared with auth routes) ───────────────────────────────────

export function hashCode(code) {
  return createHash("sha256").update(String(code)).digest("hex");
}
