import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER;
const JWT_ACCESS_TTL_SECONDS = Number(process.env.JWT_ACCESS_TTL_SECONDS || 3600);
const JWT_REFRESH_TTL_DAYS = Number(process.env.JWT_REFRESH_TTL_DAYS || 30);

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

  await db.query(
    `
    INSERT INTO auth_refresh_token (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt],
  );

  return { accessToken, refreshToken };
}

export async function registerUser(db, { email, password }) {
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

  const passwordHash = await bcrypt.hash(textPassword, BCRYPT_COST_FACTOR);

  const userResult = await db.query(
    `
    INSERT INTO app_user (subject_id, email, password_hash)
    VALUES ($1, $2, $3)
    RETURNING id
    `,
    [normalizedEmail, normalizedEmail, passwordHash],
  );

  const userId = userResult.rows[0].id;
  const profileResult = await db.query(
    `
    INSERT INTO client_profile (user_id)
    VALUES ($1)
    RETURNING id
    `,
    [userId],
  );
  const clientProfileId = profileResult.rows[0].id;
  const { accessToken, refreshToken } = await issueTokenPair(db, userId, clientProfileId);

  return { accessToken, refreshToken, userId, clientProfileId };
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
  const { accessToken, refreshToken } = await issueTokenPair(db, userRow.id, clientProfileId);

  return { accessToken, refreshToken, userId: userRow.id, clientProfileId };
}

export async function refreshTokens(db, { refreshToken }) {
  const tokenHash = sha256Hex(String(refreshToken || ""));
  const tokenResult = await db.query(
    `
    SELECT id, user_id, expires_at
    FROM auth_refresh_token
    WHERE token_hash = $1
    LIMIT 1
    `,
    [tokenHash],
  );

  if (tokenResult.rowCount === 0) {
    throw { code: "invalid_token", message: "Invalid or expired refresh token" };
  }

  const tokenRow = tokenResult.rows[0];
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
    await db.query(`DELETE FROM auth_refresh_token WHERE id = $1`, [tokenRow.id]);
    throw { code: "invalid_token", message: "Invalid or expired refresh token" };
  }

  await db.query(`DELETE FROM auth_refresh_token WHERE id = $1`, [tokenRow.id]);

  const profileResult = await db.query(
    `
    SELECT id
    FROM client_profile
    WHERE user_id = $1
    LIMIT 1
    `,
    [tokenRow.user_id],
  );

  const clientProfileId = profileResult.rows[0]?.id ?? null;
  const { accessToken, refreshToken: nextRefreshToken } = await issueTokenPair(
    db,
    tokenRow.user_id,
    clientProfileId,
  );

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    userId: tokenRow.user_id,
    clientProfileId,
  };
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
