import { randomUUID } from "node:crypto";
import express from "express";
import { fetchInputs } from "../../bubbleClient.js";
import { runPipeline } from "../../engine/runPipeline.js";
import { getAllowedExerciseIds } from "../../engine/getAllowedExercises.js";
import { pool } from "../db.js";
import { importEmitterPayload } from "../services/importEmitterService.js";

export const generateProgramRouter = express.Router();

let cachedInjuryColumn = null;

function s(v) {
  return (v ?? "").toString().trim();
}

function mapError(status, code, error) {
  return { status, body: { ok: false, code, error } };
}

async function resolveInjuryColumn(client) {
  if (cachedInjuryColumn) return cachedInjuryColumn;

  const r = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_profile'
      AND column_name IN ('injury_flags_slugs', 'injury_flags')
    `,
  );

  const cols = new Set(r.rows.map((x) => x.column_name));
  if (cols.has("injury_flags_slugs")) {
    cachedInjuryColumn = "injury_flags_slugs";
    return cachedInjuryColumn;
  }
  if (cols.has("injury_flags")) {
    cachedInjuryColumn = "injury_flags";
    return cachedInjuryColumn;
  }

  throw new Error("client_profile missing injury flags column (injury_flags_slugs or injury_flags)");
}

generateProgramRouter.post("/program/generate", async (req, res) => {
  const request_id = s(req.headers["x-request-id"]) || randomUUID();

  const bubble_user_id = s(req.body?.bubble_user_id);
  const bubble_client_profile_id = s(req.body?.bubble_client_profile_id);
  const programType = s(req.body?.programType) || "hypertrophy";

  const anchorInput = req.body?.anchor_date_ms;
  const anchor_date_ms = anchorInput == null ? Date.now() : Number(anchorInput);

  if (!bubble_user_id) {
    const e = mapError(400, "validation_error", "Missing bubble_user_id");
    return res.status(e.status).json(e.body);
  }
  if (!bubble_client_profile_id) {
    const e = mapError(400, "validation_error", "Missing bubble_client_profile_id");
    return res.status(e.status).json(e.body);
  }
  if (!Number.isFinite(anchor_date_ms)) {
    const e = mapError(400, "validation_error", "anchor_date_ms must be a finite number");
    return res.status(e.status).json(e.body);
  }

  const client = await pool.connect();
  try {
    const userR = await client.query(
      `
      SELECT id
      FROM app_user
      WHERE bubble_user_id = $1
      LIMIT 1
      `,
      [bubble_user_id],
    );

    if (userR.rowCount === 0) {
      const e = mapError(404, "not_found", "User not bootstrapped");
      return res.status(e.status).json(e.body);
    }

    const pg_user_id = userR.rows[0].id;
    const injuryColumn = await resolveInjuryColumn(client);

    const profileR = await client.query(
      `
      SELECT
        id,
        fitness_rank,
        equipment_items_slugs,
        ${injuryColumn} AS injury_flags_slugs
      FROM client_profile
      WHERE bubble_client_profile_id = $1
        AND user_id = $2
      LIMIT 1
      `,
      [bubble_client_profile_id, pg_user_id],
    );

    if (profileR.rowCount === 0) {
      const e = mapError(404, "not_found", "Client profile not found");
      return res.status(e.status).json(e.body);
    }

    const profile = profileR.rows[0];
    const fitness_rank = Number.isFinite(profile.fitness_rank)
      ? profile.fitness_rank
      : Number(profile.fitness_rank || 0);

    const injury_flags_slugs = Array.isArray(profile.injury_flags_slugs)
      ? profile.injury_flags_slugs
      : [];

    const equipment_items_slugs = Array.isArray(profile.equipment_items_slugs)
      ? profile.equipment_items_slugs
      : [];

    const allowedIds = await getAllowedExerciseIds(client, {
      fitness_rank,
      injury_flags_slugs,
      equipment_items_slugs,
    });

    const inputs = await fetchInputs({ clientProfileId: bubble_client_profile_id });
    if (!inputs || typeof inputs !== "object") {
      const e = mapError(400, "validation_error", "Failed to load generation inputs");
      return res.status(e.status).json(e.body);
    }

    inputs.allowed_exercise_ids = allowedIds;
    inputs.pg_user_id = pg_user_id;
    inputs.pg_client_profile_id = profile.id;

    const pipelineOut = await runPipeline({
      inputs,
      programType,
      request: req.body,
    });

    // Existing emitter is reused via runPipeline -> engine/steps/06_emitPlan.js as pipelineOut.rows.
    const rows = Array.isArray(pipelineOut?.rows)
      ? pipelineOut.rows
      : Array.isArray(pipelineOut?.plan?.rows)
        ? pipelineOut.plan.rows
        : null;

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Pipeline did not produce emitter rows");
    }

    const importResult = await importEmitterPayload({
      poolOrClient: client,
      payload: {
        user_id: pg_user_id,
        anchor_date_ms,
        rows,
      },
      request_id,
    });

    return res.json({
      ok: true,
      program_id: importResult.program_id,
      idempotent: importResult.idempotent,
      counts: importResult.counts,
      allowed_count: allowedIds.length,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: "internal_error",
      error: err?.message || "Internal server error",
    });
  } finally {
    client.release();
  }
});