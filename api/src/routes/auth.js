import express from "express";
import rateLimit from "express-rate-limit";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { loginUser, logoutUser, refreshTokens, registerUser } from "../services/authService.js";
import { hashCode, sendPasswordResetEmail } from "../services/emailService.js";
import { publicInternalError } from "../utils/publicError.js";

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: "rate_limited", error: "Too many attempts. Try again later." },
});

export const authRouter = express.Router();

export function createChangePasswordHandler(db = pool) {
  return async function changePassword(req, res) {
    const { currentPassword, newPassword } = req.body ?? {};
    try {
      if (!currentPassword || typeof currentPassword !== "string") {
        return res.status(400).json({ ok: false, code: "validation_error", error: "currentPassword is required." });
      }
      if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 72) {
        return res.status(400).json({ ok: false, code: "validation_error", error: "newPassword must be 8-72 characters." });
      }

      const userId = req.auth?.user_id;
      const { rows } = await db.query(
        "SELECT password_hash FROM app_user WHERE id = $1 LIMIT 1",
        [userId],
      );
      if (!rows.length || !rows[0].password_hash) {
        return res.status(400).json({ ok: false, code: "validation_error", error: "Account does not use password login." });
      }

      const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
      if (!valid) {
        return res.status(401).json({ ok: false, code: "invalid_credentials", error: "Current password is incorrect." });
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await db.query(
        "UPDATE app_user SET password_hash = $1, updated_at = now() WHERE id = $2",
        [newHash, userId],
      );
      await db.query("DELETE FROM auth_refresh_token WHERE user_id = $1", [userId]);

      return res.json({ ok: true });
    } catch (err) {
      req.log.error({ event: "auth.change_password.error", err: err?.message });
      return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
    }
  };
}

authRouter.post("/register", credentialLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};
  try {
    const result = await registerUser(pool, { email, password });
    return res.status(201).json({
      ok: true,
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      user_id: result.userId,
      client_profile_id: result.clientProfileId,
    });
  } catch (err) {
    if (err.code === "validation_error") {
      return res.status(400).json({ ok: false, code: err.code, error: err.message });
    }
    if (err.code === "email_in_use") {
      return res.status(409).json({ ok: false, code: err.code, error: err.message });
    }
    req.log.error({ event: "auth.register.error", err: err?.message });
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  }
});

authRouter.post("/login", credentialLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};
  try {
    const result = await loginUser(pool, { email, password });
    return res.status(200).json({
      ok: true,
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      user_id: result.userId,
      client_profile_id: result.clientProfileId,
    });
  } catch (err) {
    if (err.code === "validation_error") {
      return res.status(400).json({ ok: false, code: err.code, error: err.message });
    }
    if (err.code === "invalid_credentials") {
      return res.status(401).json({ ok: false, code: err.code, error: err.message });
    }
    req.log.error({ event: "auth.login.error", err: err?.message });
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  }
});

authRouter.post("/refresh", async (req, res) => {
  const refreshToken = req.body?.refresh_token;
  try {
    const result = await refreshTokens(pool, { refreshToken });
    return res.status(200).json({
      ok: true,
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
    });
  } catch (err) {
    if (err.code === "invalid_token") {
      return res.status(401).json({ ok: false, code: err.code, error: err.message });
    }
    req.log.error({ event: "auth.refresh.error", err: err?.message });
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  }
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: "rate_limited", error: "Too many attempts. Try again later." },
});

// POST /api/auth/forgot-password
// Always returns 200 to prevent email enumeration.
authRouter.post("/forgot-password", resetLimiter, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  try {
    const userResult = await pool.query(
      `SELECT id FROM app_user WHERE lower(email) = $1 LIMIT 1`,
      [email],
    );
    if (userResult.rowCount > 0) {
      const userId = userResult.rows[0].id;
      // Invalidate any existing unused codes for this user.
      await pool.query(
        `DELETE FROM password_reset_token WHERE user_id = $1 AND used_at IS NULL`,
        [userId],
      );
      const code = String(randomInt(0, 1000000)).padStart(6, "0");
      const codeHash = hashCode(code);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await pool.query(
        `INSERT INTO password_reset_token (user_id, code_hash, expires_at) VALUES ($1, $2, $3)`,
        [userId, codeHash, expiresAt],
      );
      await sendPasswordResetEmail({ to: email, code });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    req.log.error({ event: "auth.forgot_password.error", err: err?.message });
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  }
});

// POST /api/auth/reset-password
authRouter.post("/reset-password", resetLimiter, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const code = String(req.body?.code || "").trim();
  const newPassword = String(req.body?.new_password || "");
  try {
    if (!email || !code || newPassword.length < 8 || newPassword.length > 72) {
      return res.status(400).json({ ok: false, code: "validation_error", error: "Invalid request." });
    }
    const userResult = await pool.query(
      `SELECT id FROM app_user WHERE lower(email) = $1 LIMIT 1`,
      [email],
    );
    if (userResult.rowCount === 0) {
      return res.status(400).json({ ok: false, code: "invalid_code", error: "Invalid or expired code." });
    }
    const userId = userResult.rows[0].id;
    const codeHash = hashCode(code);
    const tokenResult = await pool.query(
      `SELECT id FROM password_reset_token
       WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL AND expires_at > now()
       LIMIT 1`,
      [userId, codeHash],
    );
    if (tokenResult.rowCount === 0) {
      return res.status(400).json({ ok: false, code: "invalid_code", error: "Invalid or expired code." });
    }
    const tokenId = tokenResult.rows[0].id;
    const { hash: bcrypt } = await import("bcryptjs");
    const passwordHash = await bcrypt(newPassword, 12);
    await pool.query(
      `UPDATE app_user SET password_hash = $1, updated_at = now() WHERE id = $2`,
      [passwordHash, userId],
    );
    await pool.query(
      `UPDATE password_reset_token SET used_at = now() WHERE id = $1`,
      [tokenId],
    );
    // Revoke all refresh tokens so existing sessions must re-login.
    await pool.query(`DELETE FROM auth_refresh_token WHERE user_id = $1`, [userId]);
    return res.status(200).json({ ok: true });
  } catch (err) {
    req.log.error({ event: "auth.reset_password.error", err: err?.message });
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  }
});

authRouter.post("/change-password", credentialLimiter, requireAuth, createChangePasswordHandler());

authRouter.post("/logout", async (req, res) => {
  const refreshToken = req.body?.refresh_token;
  try {
    await logoutUser(pool, { refreshToken });
    return res.status(200).json({ ok: true });
  } catch (err) {
    req.log.error({ event: "auth.logout.error", err: err?.message });
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  }
});
