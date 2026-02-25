// api/src/routes/importEmitter.js
import { randomUUID } from "node:crypto";
import express from "express";
import { pool } from "../db.js";
import { importEmitterPayload, ValidationError } from "../services/importEmitterService.js";

export const importEmitterRouter = express.Router();

function s(v) {
  return (v ?? "").toString().trim();
}

function mapPgErrorToHttp(err) {
  if (!err || typeof err !== "object") {
    return { status: 500, code: "internal_error", message: "Unhandled error" };
  }

  if (err.code === "23505") {
    return { status: 409, code: "unique_violation", message: "Duplicate data conflicts with existing records" };
  }
  if (err.code === "23503") {
    return { status: 400, code: "foreign_key_violation", message: "Invalid reference in request payload" };
  }
  if (err.code === "23502") {
    return { status: 400, code: "not_null_violation", message: "Missing required field for database insert" };
  }
  if (err.code === "23514") {
    return { status: 400, code: "check_violation", message: "Invalid value violates database check constraint" };
  }

  if (err instanceof ValidationError) {
    return { status: 400, code: "validation_error", message: err.message, details: err.details };
  }

  return { status: 500, code: "internal_error", message: err.message || "Internal server error" };
}

importEmitterRouter.post("/import/emitter", async (req, res) => {
  const request_id = s(req.headers["x-request-id"]) || randomUUID();

  const user_id = s(req.body?.user_id);
  const anchor_date_ms = req.body?.anchor_date_ms;

  let rows = req.body?.rows;
  if (!rows && typeof req.body?.emitter_output === "string") {
    rows = req.body.emitter_output.split(/\r?\n/).filter(Boolean);
  }

  try {
    if (!user_id) {
      throw new ValidationError("Missing user_id");
    }
    if (!Number.isFinite(Number(anchor_date_ms))) {
      throw new ValidationError("Missing anchor_date_ms");
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new ValidationError("Missing rows[]");
    }

    const result = await importEmitterPayload({
      poolOrClient: pool,
      payload: {
        user_id,
        anchor_date_ms,
        rows,
      },
      request_id,
    });

    return res.json({
      ok: true,
      program_id: result.program_id,
      counts: result.counts,
      idempotent: result.idempotent,
    });
  } catch (err) {
    const mapped = mapPgErrorToHttp(err);

    return res.status(mapped.status).json({
      ok: false,
      request_id,
      code: mapped.code,
      error: mapped.message,
      details: mapped.details,
    });
  }
});