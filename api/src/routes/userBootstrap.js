// api/src/routes/userBootstrap.js
import express from "express";
import { pool } from "../db.js";
import { requireInternalToken } from "../middleware/auth.js";

export const userBootstrapRouter = express.Router();

class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "ValidationError";
    this.status = 400;
    this.details = details;
  }
}

function s(v) {
  return (v ?? "").toString().trim();
}

function mapError(err) {
  if (err instanceof ValidationError) {
    return { status: err.status ?? 400, code: "validation_error", message: err.message, details: err.details };
  }
  if (err && typeof err === "object") {
    if (err.code === "23505") {
      return { status: 409, code: "unique_violation", message: "User mapping already exists" };
    }
    if (err.code === "42P01") {
      return { status: 500, code: "schema_missing", message: "app_user table is missing; run migrations" };
    }
  }
  return { status: 500, code: "internal_error", message: err?.message || "Internal server error" };
}

userBootstrapRouter.post("/user/bootstrap", requireInternalToken, express.json({ limit: "1mb" }), async (req, res) => {
  const bubble_user_id = s(req.body?.bubble_user_id);

  try {
    if (!bubble_user_id) {
      throw new ValidationError("Missing bubble_user_id");
    }

    // Soft validation for v1: accept any non-empty id-like string.
    if (bubble_user_id.length < 6) {
      throw new ValidationError("bubble_user_id must be a non-empty Bubble user id-like string");
    }

    const client = await pool.connect();
    try {
      const upsertR = await client.query(
        `
        INSERT INTO app_user (bubble_user_id)
        VALUES ($1)
        ON CONFLICT (bubble_user_id)
        DO UPDATE SET updated_at = now()
        RETURNING id, bubble_user_id
        `,
        [bubble_user_id],
      );

      const row = upsertR.rows[0];
      return res.json({
        ok: true,
        user_id: row.id,
        bubble_user_id: row.bubble_user_id,
      });
    } finally {
      client.release();
    }
  } catch (err) {
    const mapped = mapError(err);
    return res.status(mapped.status).json({
      ok: false,
      request_id: req.request_id,
      code: mapped.code,
      error: mapped.message,
      details: mapped.details,
    });
  }
});