import express from "express";
import rateLimit from "express-rate-limit";
import { pool } from "../db.js";
import { loginUser, logoutUser, refreshTokens, registerUser } from "../services/authService.js";
import { publicInternalError } from "../utils/publicError.js";

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: "rate_limited", error: "Too many attempts. Try again later." },
});

export const authRouter = express.Router();

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
