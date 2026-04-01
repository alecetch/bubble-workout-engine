// api/src/routes/debugAllowedExercises.js
import express from "express";
import { pool } from "../db.js";
import { getAllowedExerciseIds } from "../../engine/getAllowedExercises.js";
import { publicInternalError } from "../utils/publicError.js";
import logger from "../utils/logger.js";
import { RequestValidationError, requireUuid, safeString } from "../utils/validate.js";

export const debugAllowedExercisesRouter = express.Router();

let cachedInjuryColumn = null;

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

  const names = new Set(r.rows.map((row) => row.column_name));
  if (names.has("injury_flags_slugs")) {
    cachedInjuryColumn = "injury_flags_slugs";
  } else if (names.has("injury_flags")) {
    cachedInjuryColumn = "injury_flags";
  } else {
    throw new Error("Neither injury_flags_slugs nor injury_flags exists on client_profile");
  }

  return cachedInjuryColumn;
}

debugAllowedExercisesRouter.get("/client_profile/:id/allowed_exercises", async (req, res) => {
  const startedAt = Date.now();
  const request_id = safeString(req.headers["x-request-id"]);
  const client_profile_id = safeString(req.params.id);

  try {
    requireUuid(client_profile_id, "client_profile_id");
  } catch (err) {
    if (!(err instanceof RequestValidationError)) throw err;
    return res.status(400).json({
      ok: false,
      code: "validation_error",
      error: err.message,
    });
  }

  const client = await pool.connect();
  try {
    const injuryColumn = await resolveInjuryColumn(client);

    const profileR = await client.query(
      `
      SELECT
        fitness_rank,
        ${injuryColumn} AS injury_flags_slugs,
        equipment_items_slugs
      FROM client_profile
      WHERE id = $1
      LIMIT 1
      `,
      [client_profile_id],
    );

    if (profileR.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        code: "not_found",
        error: "Client profile not found",
      });
    }

    const profile = profileR.rows[0];
    const fitness_rank = Number.isFinite(profile.fitness_rank) ? profile.fitness_rank : Number(profile.fitness_rank || 0);
    const injury_flags_slugs = Array.isArray(profile.injury_flags_slugs) ? profile.injury_flags_slugs : [];
    const equipment_items_slugs = Array.isArray(profile.equipment_items_slugs) ? profile.equipment_items_slugs : [];

    const allowedIds = await getAllowedExerciseIds(client, {
      fitness_rank,
      injury_flags_slugs,
      equipment_items_slugs,
    });

    const duration_ms = Date.now() - startedAt;

    req.log.info({
      event: "debug.allowed_exercises",
      request_id: request_id || undefined,
      client_profile_id,
      allowed_count: allowedIds.length,
      duration_ms,
    });

    return res.json({
      ok: true,
      client_profile_id,
      inputs: {
        fitness_rank,
        injury_flags_slugs,
        equipment_items_slugs,
      },
      allowed_count: allowedIds.length,
      allowed_ids_preview: allowedIds.slice(0, 50),
      duration_ms,
    });
  } catch (err) {
    const duration_ms = Date.now() - startedAt;

    (req.log || logger).error({
      event: "debug.allowed_exercises_failed",
      request_id: request_id || undefined,
      client_profile_id,
      duration_ms,
      error: err?.message || String(err),
    }, "debug allowed exercises failed");

    return res.status(500).json({
      ok: false,
      code: "internal_error",
      error: publicInternalError(err),
    });
  } finally {
    client.release();
  }
});
