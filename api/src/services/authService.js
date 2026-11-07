import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { generateReferralCode } from "../utils/referralCode.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER;
const JWT_ACCESS_TTL_SECONDS = Number(process.env.JWT_ACCESS_TTL_SECONDS || 3600);
const JWT_REFRESH_TTL_DAYS = Number(process.env.JWT_REFRESH_TTL_DAYS || 30);

export const REFRESH_REUSE_GRACE_SECONDS = 60;

const BCRYPT_COST_FACTOR = 12;
const MAX_PASSWORD_LENGTH = 72;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validateEmailAndPassword(email, password) {
  const normalizedEmail = normalizeEmail(email);
  const textPassword = String(password || "");

  if (!EMAIL_RE.test(normalizedEmail)) {
    throw { code: "validation_error", message: "Email must be a valid email address" };
  }
  if (textPassword.length < 8 || textPassword.length > MAX_PASSWORD_LENGTH) {
    throw { code: "validation_error", message: "Password must be 8 to 72 characters" };
  }

  return { normalizedEmail, textPassword };
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function issueTokenPair(db, userId) {
  const accessToken = jwt.sign({ sub: userId, iss: JWT_ISSUER }, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: JWT_ACCESS_TTL_SECONDS,
  });

  const refreshToken = randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(refreshToken);
  const expiresAt = new Date(Date.now() + JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  const inserted = await db.query(
    `
    INSERT INTO auth_refresh_token (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
    RETURNING id
    `,
    [userId, tokenHash, expiresAt],
  );

  return { accessToken, refreshToken, refreshTokenId: inserted.rows[0].id };
}

export async function registerUser(db, { email, password, referredByCode = null }) {
  const { normalizedEmail, textPassword } = validateEmailAndPassword(email, password);

  const existingUser = await db.query(
    `
    SELECT id
    FROM app_user
    WHERE lower(email) = $1
    LIMIT 1
    `,
    [normalizedEmail],
  );

  if (existingUser.rowCount > 0) {
    throw { code: "email_in_use", message: "Email already registered" };
  }

  let referrerId = null;
  if (referredByCode) {
    const referrerResult = await db.query(
      `SELECT id FROM app_user WHERE referral_code = $1 LIMIT 1`,
      [referredByCode],
    );
    if (referrerResult.rowCount > 0) {
      referrerId = referrerResult.rows[0].id;
    }
  }

  const passwordHash = await bcrypt.hash(textPassword, BCRYPT_COST_FACTOR);
  const newReferralCode = generateReferralCode();

  let userResult;
  for (let attempt = 0; attempt < 2; attempt++) {
    const codeToTry = attempt === 0 ? newReferralCode : generateReferralCode();
    try {
      userResult = await db.query(
        `
        INSERT INTO app_user (subject_id, email, password_hash, referral_code, referred_by_code)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        `,
        [normalizedEmail, normalizedEmail, passwordHash, codeToTry, referredByCode],
      );
      break;
    } catch (insertErr) {
      if (insertErr.code === "23505" && insertErr.constraint === "idx_app_user_referral_code" && attempt === 0) {
        continue;
      }
      throw insertErr;
    }
  }

  const userId = userResult.rows[0].id;
  const profileResult = await db.query(
    `
    INSERT INTO client_profile (user_id)
    VALUES ($1)
    RETURNING id
    `,
    [userId],
  );

  if (referrerId) {
    await db.query(
      `INSERT INTO referral_conversion (referrer_user_id, referred_user_id, referred_code)
       VALUES ($1, $2, $3)
       ON CONFLICT (referred_user_id) DO NOTHING`,
      [referrerId, userId, referredByCode],
    );
  }

  const clientProfileId = profileResult.rows[0].id;
  const { accessToken, refreshToken } = await issueTokenPair(db, userId);
  const subResult = await db.query(
    "SELECT subscription_status, trial_expires_at FROM app_user WHERE id = $1",
    [userId],
  );
  const { subscription_status, trial_expires_at } = subResult.rows[0] ?? {};

  return {
    accessToken,
    refreshToken,
    userId,
    clientProfileId,
    subscriptionStatus: subscription_status,
    trialExpiresAt: trial_expires_at,
  };
}

export async function loginUser(db, { email, password }) {
  const { normalizedEmail, textPassword } = validateEmailAndPassword(email, password);

  const userResult = await db.query(
    `
    SELECT id, password_hash
    FROM app_user
    WHERE lower(email) = $1
    LIMIT 1
    `,
    [normalizedEmail],
  );

  if (userResult.rowCount === 0) {
    throw { code: "invalid_credentials", message: "Invalid email or password" };
  }

  const userRow = userResult.rows[0];
  const passwordHash = userRow.password_hash || "";
  const isValidPassword = await bcrypt.compare(textPassword, passwordHash);
  if (!isValidPassword) {
    throw { code: "invalid_credentials", message: "Invalid email or password" };
  }

  const profileResult = await db.query(
    `
    SELECT id
    FROM client_profile
    WHERE user_id = $1
    LIMIT 1
    `,
    [userRow.id],
  );

  const clientProfileId = profileResult.rows[0]?.id ?? null;
  const { accessToken, refreshToken } = await issueTokenPair(db, userRow.id);
  const subResult = await db.query(
    "SELECT subscription_status, trial_expires_at FROM app_user WHERE id = $1",
    [userRow.id],
  );
  const { subscription_status, trial_expires_at } = subResult.rows[0] ?? {};

  return {
    accessToken,
    refreshToken,
    userId: userRow.id,
    clientProfileId,
    subscriptionStatus: subscription_status,
    trialExpiresAt: trial_expires_at,
  };
}

export async function refreshTokens(db, { refreshToken }) {
  // pg.Client also has connect(); caller-owned clients must stay in their transaction.
  const ownsTransaction = typeof db.connect === "function" && !(db instanceof pg.Client) && typeof db.release !== "function";
  const client = ownsTransaction ? await db.connect() : db;
  try {
    if (ownsTransaction) await client.query("BEGIN");
    const tokenHash = sha256Hex(String(refreshToken || ""));
    const tokenResult = await client.query(`
      SELECT id, user_id, expires_at, rotated_at
      FROM auth_refresh_token WHERE token_hash = $1
      LIMIT 1 FOR UPDATE`, [tokenHash]);
    const tokenRow = tokenResult.rows[0];
    const now = Date.now();
    if (!tokenRow || new Date(tokenRow.expires_at).getTime() <= now ||
        (tokenRow.rotated_at && now - new Date(tokenRow.rotated_at).getTime() > REFRESH_REUSE_GRACE_SECONDS * 1000)) {
      throw { code: "invalid_token", message: "Invalid or expired refresh token" };
    }
    const profileResult = await client.query("SELECT id FROM client_profile WHERE user_id = $1 LIMIT 1", [tokenRow.user_id]);
    const { accessToken, refreshToken: nextRefreshToken, refreshTokenId } = await issueTokenPair(client, tokenRow.user_id);
    if (!tokenRow.rotated_at) {
      await client.query("UPDATE auth_refresh_token SET rotated_at = now(), replaced_by = $2 WHERE id = $1", [tokenRow.id, refreshTokenId]);
    }
    await client.query("DELETE FROM auth_refresh_token WHERE user_id = $1 AND rotated_at < now() - interval '1 day'", [tokenRow.user_id]);
    if (ownsTransaction) await client.query("COMMIT");
    return { accessToken, refreshToken: nextRefreshToken, userId: tokenRow.user_id, clientProfileId: profileResult.rows[0]?.id ?? null };
  } catch (error) {
    if (ownsTransaction) {
      try { await client.query("ROLLBACK"); } catch { /* retain the original error */ }
    }
    throw error;
  } finally {
    if (ownsTransaction) client.release();
  }
}

export async function logoutUser(db, { refreshToken }) {
  const tokenHash = sha256Hex(String(refreshToken || ""));
  await db.query(
    `
    DELETE FROM auth_refresh_token
    WHERE token_hash = $1
    `,
    [tokenHash],
  );

  return { ok: true };
}

export { sha256Hex };
