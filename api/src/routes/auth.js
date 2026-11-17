import express from "express";
import rateLimit from "express-rate-limit";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { invalidatePasswordChangedAt, requireAuth } from "../middleware/requireAuth.js";
import { loginUser, logoutUser, refreshTokens, registerUser } from "../services/authService.js";
import { hashResetCode, resetCodeMatches, sendPasswordChangedEmail, sendPasswordResetEmail } from "../services/emailService.js";
import { publicInternalError } from "../utils/publicError.js";

import { PgRateLimitStore } from "../middleware/pgRateLimitStore.js";
import { makeAuthThrottle, accountKeyForUser, PASSWORD_THROTTLED } from "../services/authThrottle.js";

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  store: new PgRateLimitStore({ prefix: "auth:cred:ip:", failMode: "open" }),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: "rate_limited", error: "Too many attempts. Try again later." },
});

export const authRouter = express.Router();

async function transaction(db, work) {
  const client = typeof db.connect === 'function' && typeof db.release !== 'function' ? await db.connect() : db;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); throw err; }
  finally { if (client !== db) client.release(); }
}

function notifyPasswordChanged({ userId, email, changedAt }, { schedule, sendChanged }, log) {
  invalidatePasswordChangedAt(userId);
  const send = async () => {
    try { await sendChanged({ to: email, changedAt }); log?.info?.({ event: 'auth.password_changed.notified' }); }
    catch { log?.warn?.({ event: 'auth.password_changed.notify_failed' }); }
  };
  try { schedule(send); } catch { log?.warn?.({ event: 'auth.password_changed.notify_failed' }); }
}

export function createChangePasswordHandler(db = pool, { throttle = makeAuthThrottle({ db }), schedule = fn => setImmediate(fn), sendChanged = sendPasswordChangedEmail } = {}) {
  return async function changePassword(req, res) {
    const { currentPassword, newPassword } = req.body ?? {};
    try {
      if (!currentPassword || typeof currentPassword !== 'string') return res.status(400).json({ ok: false, code: 'validation_error', error: 'currentPassword is required.' });
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 72) return res.status(400).json({ ok: false, code: 'validation_error', error: 'newPassword must be 8-72 characters.' });
      const userId = req.auth?.user_id;
      const key = accountKeyForUser(userId);
      if (!(await throttle.checkPasswordAttempts(key)).allowed) return res.status(429).json(PASSWORD_THROTTLED);
      const result = await transaction(db, async client => {
        const row = (await client.query('SELECT password_hash, email FROM app_user WHERE id = $1 LIMIT 1 FOR UPDATE', [userId])).rows[0];
        if (!row?.password_hash) return { status: 400, body: { ok: false, code: 'validation_error', error: 'Account does not use password login.' } };
        if (!await bcrypt.compare(currentPassword, row.password_hash)) return { status: 401, body: { ok: false, code: 'invalid_credentials', error: 'Current password is incorrect.' } };
        const hash = await bcrypt.hash(newPassword, 12);
        const update = await client.query('UPDATE app_user SET password_hash = $1, password_changed_at = now(), updated_at = now() WHERE id = $2 RETURNING password_changed_at', [hash, userId]);
        await client.query('DELETE FROM password_reset_token WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM auth_refresh_token WHERE user_id = $1', [userId]);
        return { status: 200, body: { ok: true }, userId, email: row.email, changedAt: update.rows[0]?.password_changed_at ?? new Date() };
      });
      if (result.status === 401) await throttle.notePasswordFailure(key);
      if (result.status === 200) notifyPasswordChanged(result, { schedule, sendChanged }, req.log);
      return res.status(result.status).json(result.body);
    } catch { req.log?.error?.({ event: 'auth.change_password.error' }); return res.status(500).json({ ok: false, code: 'internal_error', error: 'Internal server error' }); }
  };
}

authRouter.post("/register", credentialLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};
  const referredByCode = typeof req.body?.referredByCode === "string" ? req.body.referredByCode.trim() : null;
  try {
    const result = await registerUser(pool, { email, password, referredByCode });
    return res.status(201).json({
      ok: true,
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      user_id: result.userId,
      client_profile_id: result.clientProfileId,
      subscription_status: result.subscriptionStatus,
      trial_expires_at: result.trialExpiresAt,
    });
  } catch (err) {
    if (err.code === "validation_error") {
      return res.status(400).json({ ok: false, code: err.code, error: err.message });
    }
    if (err.code === "email_in_use") {
      return res.status(409).json({ ok: false, code: err.code, error: err.message });
    }
    req.log?.error?.({ event: "auth.register.error" });
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
      subscription_status: result.subscriptionStatus,
      trial_expires_at: result.trialExpiresAt,
    });
  } catch (err) {
    if (err.code === "validation_error") {
      return res.status(400).json({ ok: false, code: err.code, error: err.message });
    }
    if (err.code === "rate_limited") return res.status(429).json(PASSWORD_THROTTLED);
    if (err.code === "invalid_credentials") {
      return res.status(401).json({ ok: false, code: err.code, error: err.message });
    }
    req.log?.error?.({ event: "auth.login.error" });
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
    req.log?.error?.({ event: "auth.refresh.error" });
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  }
});

export function createPasswordResetLimiters({ storeFactory = options => new PgRateLimitStore(options) } = {}) {
  const create = (max, prefix) => rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    store: storeFactory({ prefix, failMode: 'open' }),
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, code: 'rate_limited', error: 'Too many attempts. Try again later.' },
  });
  return {
    forgotLimiter: create(10, 'auth:forgot:ip:'),
    resetCodeLimiter: create(20, 'auth:reset-code:ip:'),
  };
}
const { forgotLimiter, resetCodeLimiter } = createPasswordResetLimiters();

export function createForgotPasswordHandler({ db = pool, schedule = fn => setImmediate(fn), throttle = makeAuthThrottle({ db }), sendReset = sendPasswordResetEmail } = {}) {
  return async function forgotPassword(req, res) {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    let allowed = false;
    try { if (valid) ({ allowed } = await throttle.noteResetRequest(email)); }
    catch { req.log?.error?.({ event: 'auth.forgot_password.async_error' }); }
    res.status(200).json({ ok: true });
    if (!allowed) { req.log?.info?.({ event: 'auth.reset_request.throttled' }); return; }
    const issueResetCode = async () => {
      try {
        const code = String(randomInt(0, 1000000)).padStart(6, '0');
        const issued = await transaction(db, async client => {
          const row = (await client.query('SELECT id FROM app_user WHERE lower(email) = $1 LIMIT 1 FOR UPDATE', [email])).rows[0];
          if (!row) return false;
          await client.query('DELETE FROM password_reset_token WHERE user_id = $1 AND used_at IS NULL', [row.id]);
          await client.query('INSERT INTO password_reset_token (user_id, code_hash, expires_at, attempts) VALUES ($1,$2,$3,0)', [row.id, hashResetCode(code), new Date(Date.now() + 900000)]);
          return true;
        });
        if (issued) await sendReset({ to: email, code });
      } catch { req.log?.error?.({ event: 'auth.forgot_password.async_error' }); }
    };
    try { schedule(issueResetCode); } catch { req.log?.error?.({ event: 'auth.forgot_password.async_error' }); }
  };
}

export function createResetPasswordHandler({ db = pool, schedule = fn => setImmediate(fn), sendChanged = sendPasswordChangedEmail } = {}) {
  return async function resetPassword(req, res) {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    const newPassword = String(req.body?.new_password || '');
    const invalid = { status: 400, body: { ok: false, code: 'invalid_code', error: 'Invalid or expired code.' } };
    try {
      if (!email || !code || newPassword.length < 8 || newPassword.length > 72) return res.status(400).json({ ok: false, code: 'validation_error', error: 'Invalid request.' });
      const result = await transaction(db, async client => {
        const user = (await client.query('SELECT id FROM app_user WHERE lower(email) = $1 LIMIT 1 FOR UPDATE', [email])).rows[0];
        if (!user) return invalid;
        const row = (await client.query('SELECT id,code_hash,attempts FROM password_reset_token WHERE user_id = $1 AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE', [user.id])).rows[0];
        if (!row) return invalid;
        if (row.attempts >= 5) { await client.query('DELETE FROM password_reset_token WHERE id=$1', [row.id]); return invalid; }
        if (!resetCodeMatches(code, row.code_hash)) { await client.query('UPDATE password_reset_token SET attempts=attempts+1 WHERE id=$1', [row.id]); return invalid; }
        const hash = await bcrypt.hash(newPassword,12);
        const update = await client.query('UPDATE app_user SET password_hash=$1, password_changed_at=now(), updated_at=now() WHERE id=$2 RETURNING password_changed_at', [hash,user.id]);
        await client.query('DELETE FROM password_reset_token WHERE user_id=$1', [user.id]);
        await client.query('DELETE FROM auth_refresh_token WHERE user_id=$1', [user.id]);
        return { status:200, body:{ok:true}, userId:user.id, email, changedAt:update.rows[0].password_changed_at };
      });
      if (result.status === 200) notifyPasswordChanged(result, { schedule, sendChanged }, req.log);
      return res.status(result.status).json(result.body);
    } catch { req.log?.error?.({ event:'auth.reset_password.error' }); return res.status(500).json({ok:false,code:'internal_error',error:'Internal server error'}); }
  };
}

authRouter.post('/forgot-password', forgotLimiter, createForgotPasswordHandler());
authRouter.post('/reset-password', resetCodeLimiter, createResetPasswordHandler());

authRouter.post("/change-password", credentialLimiter, requireAuth, createChangePasswordHandler());

authRouter.post("/logout", async (req, res) => {
  const refreshToken = req.body?.refresh_token;
  try {
    await logoutUser(pool, { refreshToken });
    return res.status(200).json({ ok: true });
  } catch (err) {
    req.log?.error?.({ event: "auth.logout.error" });
    return res.status(500).json({ ok: false, code: "internal_error", error: publicInternalError(err) });
  }
});
