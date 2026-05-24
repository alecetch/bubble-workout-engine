import crypto from "node:crypto";
import express from "express";
import { pool } from "../db.js";
import { requireInternalToken, requireTrustedAdminOrigin } from "../middleware/auth.js";
import { publicInternalError } from "../utils/publicError.js";
import { ALL_PROGRAM_TYPES, VALID_PRESETS } from "./adminPreview.js";
import {
  readReviewMatrix,
  runFullReview,
} from "../services/programQualityService.js";

function isNonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim());
}

function isIntArrayInRange(value, min, max) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((item) => Number.isInteger(Number(item)) && Number(item) >= min && Number(item) <= max);
}

export function validateProgramQualityRequest(body = {}) {
  const errors = [];
  if (!isNonEmptyStringArray(body.config_keys)) errors.push("config_keys must be a non-empty array of strings");
  if (!isNonEmptyStringArray(body.program_types)) {
    errors.push("program_types must be a non-empty array of strings");
  } else if (!body.program_types.every((type) => ALL_PROGRAM_TYPES.includes(String(type)))) {
    errors.push(`program_types must only contain: ${ALL_PROGRAM_TYPES.join(", ")}`);
  }
  if (!isIntArrayInRange(body.fitness_ranks, 0, 3)) errors.push("fitness_ranks must be non-empty integers from 0 to 3");
  if (!isNonEmptyStringArray(body.equipment_presets)) {
    errors.push("equipment_presets must be a non-empty array of strings");
  } else if (!body.equipment_presets.every((preset) => VALID_PRESETS.includes(String(preset)))) {
    errors.push(`equipment_presets must only contain: ${VALID_PRESETS.join(", ")}`);
  }
  if (!isIntArrayInRange(body.days_per_week, 1, 7)) errors.push("days_per_week must be non-empty integers from 1 to 7");
  if (!isIntArrayInRange(body.duration_mins, 20, 120)) errors.push("duration_mins must be non-empty integers from 20 to 120");
  if (body.include_preview_rows !== undefined && typeof body.include_preview_rows !== "boolean") {
    errors.push("include_preview_rows must be a boolean");
  }
  if (body.include_ai_packet !== undefined && typeof body.include_ai_packet !== "boolean") {
    errors.push("include_ai_packet must be a boolean");
  }
  return errors;
}

function normalizeRequestBody(body) {
  return {
    config_keys: body.config_keys.map((v) => String(v).trim()),
    program_types: body.program_types.map((v) => String(v).trim()),
    fitness_ranks: body.fitness_ranks.map((v) => Number(v)),
    equipment_presets: body.equipment_presets.map((v) => String(v).trim()),
    days_per_week: body.days_per_week.map((v) => Number(v)),
    duration_mins: body.duration_mins.map((v) => Number(v)),
    include_preview_rows: body.include_preview_rows === true,
    include_ai_packet: body.include_ai_packet === true,
  };
}

function matrixHash(requestBody) {
  return crypto.createHash("sha256").update(JSON.stringify(requestBody)).digest("hex");
}

export function createAdminProgramQualityRouter({
  db = pool,
  reviewRunner = runFullReview,
  matrixReader = readReviewMatrix,
} = {}) {
  const router = express.Router();
  router.use(requireInternalToken, requireTrustedAdminOrigin);

  router.get("/api/program-quality/matrix", async (_req, res) => {
    const matrix = await matrixReader();
    return res.json({ ok: true, matrix });
  });

  router.post("/api/program-quality/review", async (req, res) => {
    const errors = validateProgramQualityRequest(req.body ?? {});
    if (errors.length) {
      return res.status(400).json({ ok: false, error: errors.join("; ") });
    }
    const requestBody = normalizeRequestBody(req.body);
    try {
      const review = await reviewRunner({ db, requestBody });
      return res.json({
        ok: true,
        requested_at: new Date().toISOString(),
        matrix_hash: matrixHash(requestBody),
        summary: review.summary,
        checks: review.checks,
        ...(requestBody.include_preview_rows ? { preview_rows: review.preview_rows ?? [] } : {}),
        ...(requestBody.include_ai_packet ? { ai_packet: review.ai_packet } : {}),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  router.get("/api/program-quality/packet", async (_req, res) => {
    try {
      const matrix = await matrixReader();
      const requestBody = {
        ...matrix.default_matrix,
        include_ai_packet: true,
        include_preview_rows: true,
      };
      const review = await reviewRunner({ db, requestBody });
      const response = {
        ok: true,
        requested_at: new Date().toISOString(),
        matrix_hash: matrixHash(requestBody),
        summary: review.summary,
        checks: review.checks,
        preview_rows: review.preview_rows ?? [],
        ai_packet: review.ai_packet,
      };
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="program-quality-packet.json"');
      return res.send(JSON.stringify(response, null, 2));
    } catch (err) {
      return res.status(500).json({ ok: false, error: publicInternalError(err) });
    }
  });

  return router;
}

export const adminProgramQualityRouter = createAdminProgramQualityRouter();
