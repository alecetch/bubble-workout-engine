import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { getAllowedExerciseIds } from "../../engine/getAllowedExercises.js";
import { publicInternalError } from "../utils/publicError.js";
import { RequestValidationError, requireNonEmpty, requireUuid, safeString } from "../utils/validate.js";

export const programExerciseRouter = express.Router();

class NotFoundError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "NotFoundError";
    this.status = 404;
    this.details = details;
  }
}

function mapError(err) {
  if (err instanceof RequestValidationError || err instanceof NotFoundError) {
    return {
      status: err.status ?? 400,
      code: err instanceof NotFoundError ? "not_found" : "validation_error",
      message: err.message,
      details: err.details,
    };
  }
  if (err && typeof err === "object") {
    if (err.code === "22P02") return { status: 400, code: "invalid_input", message: "Invalid input format" };
    if (err.code === "23503") return { status: 400, code: "foreign_key_violation", message: "Invalid reference" };
    if (err.code === "23505") return { status: 409, code: "unique_violation", message: "Duplicate conflict" };
    if (err.code === "42P01") return { status: 500, code: "schema_missing", message: "Required table is missing; run migrations" };
  }
  return { status: 500, code: "internal_error", message: publicInternalError(err) };
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function asTextArray(value) {
  if (Array.isArray(value)) return value.map((v) => safeString(v)).filter(Boolean);
  const text = safeString(value);
  if (!text) return [];
  return text.split(",").map((v) => safeString(v)).filter(Boolean);
}

function dedupeOptionsByName(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows ?? []) {
    const key = safeString(row?.name).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function swapRationale(matchType, movementPatternPrimary) {
  if (matchType === "same_compound_group") return "Same compound movement group";
  if (matchType === "same_movement_pattern") return "Same movement pattern";
  return `Same primary movement (${movementPatternPrimary ?? "general"})`;
}

function requireExerciseId(value) {
  const exerciseId = requireNonEmpty(value, "exercise_id");
  if (exerciseId.includes("|")) {
    throw new RequestValidationError("exercise_id contains invalid characters");
  }
  return exerciseId;
}

function normalizeReason(value) {
  if (value == null) return null;
  const reason = safeString(value, { maxLength: 500 });
  return reason || null;
}

export function createProgramExerciseHandlers(options = pool) {
  const resolved = options && typeof options.connect === "function"
    ? { db: options, getAllowed: getAllowedExerciseIds }
    : { db: options?.db ?? pool, getAllowed: options?.getAllowed ?? getAllowedExerciseIds };
  const db = resolved.db;
  const getAllowed = resolved.getAllowed;

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

    const names = new Set((r.rows ?? []).map((row) => row.column_name));
    if (names.has("injury_flags_slugs")) {
      cachedInjuryColumn = "injury_flags_slugs";
      return cachedInjuryColumn;
    }
    if (names.has("injury_flags")) {
      cachedInjuryColumn = "injury_flags";
      return cachedInjuryColumn;
    }
    throw new Error("Neither injury_flags_slugs nor injury_flags exists on client_profile");
  }

  function resolveUserId(req) {
    const userId = safeString(req.auth?.user_id) || safeString(req.auth?.userId);
    if (userId) return userId;
    throw new RequestValidationError("Missing authenticated user context");
  }

  async function loadOwnedProgramExercise(client, programExerciseId, userId) {
    const result = await client.query(
      `
      SELECT
        pe.id AS program_exercise_id,
        pe.program_day_id,
        pe.program_id,
        pe.exercise_id,
        pe.exercise_name,
        pe.original_exercise_id,
        pe.purpose,
        pe.order_in_day,
        pd.global_day_index
      FROM program_exercise pe
      JOIN program_day pd
        ON pd.id = pe.program_day_id
      JOIN program p
        ON p.id = pd.program_id
      WHERE pe.id = $1
        AND p.user_id = $2
      LIMIT 1
      `,
      [programExerciseId, userId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundError("Program exercise not found");
    }
    return result.rows[0];
  }

  async function loadUserProfile(client, userId) {
    const injuryColumn = await resolveInjuryColumn(client);
    const result = await client.query(
      `
      SELECT
        fitness_rank,
        ${injuryColumn} AS injury_flags_slugs,
        equipment_items_slugs
      FROM client_profile
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [userId],
    );

    const row = result.rows[0] ?? {};
    return {
      fitness_rank: Number.isFinite(Number(row.fitness_rank)) ? Number(row.fitness_rank) : 0,
      injury_flags_slugs: asTextArray(row.injury_flags_slugs),
      equipment_items_slugs: asTextArray(row.equipment_items_slugs),
    };
  }

  async function swapOptions(req, res) {
    const { request_id } = req;
    const program_exercise_id = safeString(req.params.program_exercise_id);

    try {
      requireUuid(program_exercise_id, "program_exercise_id");

      const client = await db.connect();
      try {
        const userId = resolveUserId(req);
        const current = await loadOwnedProgramExercise(client, program_exercise_id, userId);
        const currentExerciseResult = await client.query(
          `
          SELECT
            exercise_id,
            name,
            swap_group_id_1,
            swap_group_id_2,
            movement_pattern_primary,
            movement_class
          FROM exercise_catalogue
          WHERE exercise_id = $1
          LIMIT 1
          `,
          [current.exercise_id],
        );
        if (currentExerciseResult.rowCount === 0) {
          throw new NotFoundError("Current exercise not found");
        }
        const currentExercise = currentExerciseResult.rows[0];

        const usedResult = await client.query(
          `
          SELECT exercise_id
          FROM program_exercise
          WHERE program_day_id = $1
          `,
          [current.program_day_id],
        );
        const excludedIds = uniq([
          current.exercise_id,
          ...usedResult.rows.map((row) => safeString(row.exercise_id)).filter(Boolean),
        ]);

        const profile = await loadUserProfile(client, userId);
        const allowedIds = await getAllowed(client, profile);
        if (!allowedIds.length) {
          return res.json({ ok: true, current_exercise_id: current.exercise_id, options: [] });
        }

        const candidateResult = await client.query(
          `
          SELECT
            ec.exercise_id,
            ec.name,
            ec.is_loadable,
            ec.swap_group_id_1,
            ec.swap_group_id_2,
            ec.movement_pattern_primary,
            ec.movement_class,
            ec.load_guidance,
            CASE
              WHEN ec.swap_group_id_2 = $1 AND $1 IS NOT NULL AND $1 != ''
                THEN 'same_compound_group'
              WHEN ec.swap_group_id_1 = $2 AND $2 IS NOT NULL AND $2 != ''
                THEN 'same_movement_pattern'
              ELSE 'same_primary_pattern'
            END AS match_type
          FROM exercise_catalogue ec
          WHERE ec.is_archived = false
            AND ec.min_fitness_rank <= $3
            AND NOT (ec.contraindications_slugs && $4::text[])
            AND ec.equipment_items_slugs <@ $5::text[]
            AND ec.exercise_id != $6
            AND ec.exercise_id != ALL($7::text[])
            AND ec.exercise_id = ANY($8::text[])
            AND (
              (ec.swap_group_id_2 = $1 AND $1 IS NOT NULL AND $1 != '')
              OR (ec.swap_group_id_1 = $2 AND $2 IS NOT NULL AND $2 != '')
              OR ec.movement_pattern_primary = $9
            )
          ORDER BY
            CASE
              WHEN ec.swap_group_id_2 = $1 AND $1 IS NOT NULL AND $1 != '' THEN 1
              WHEN ec.swap_group_id_1 = $2 AND $2 IS NOT NULL AND $2 != '' THEN 2
              ELSE 3
            END,
            ec.min_fitness_rank DESC,
            ec.complexity_rank ASC,
            ec.name ASC
          LIMIT 5
          `,
          [
            safeString(currentExercise.swap_group_id_2),
            safeString(currentExercise.swap_group_id_1),
            profile.fitness_rank,
            profile.injury_flags_slugs,
            profile.equipment_items_slugs,
            current.exercise_id,
            excludedIds,
            allowedIds,
            safeString(currentExercise.movement_pattern_primary),
          ],
        );

        const options = dedupeOptionsByName(candidateResult.rows)
          .slice(0, 3)
          .map((row) => ({
            exercise_id: row.exercise_id,
            name: row.name,
            is_loadable: Boolean(row.is_loadable),
            match_type: row.match_type,
            rationale: swapRationale(row.match_type, row.movement_pattern_primary),
            load_guidance: row.load_guidance ?? "",
          }));

        return res.json({
          ok: true,
          current_exercise_id: current.exercise_id,
          options,
        });
      } finally {
        client.release();
      }
    } catch (err) {
      const mapped = mapError(err);
      return res.status(mapped.status).json({
        ok: false,
        request_id,
        code: mapped.code,
        error: mapped.message,
        details: mapped.details,
      });
    }
  }

  async function applySwap(req, res) {
    const { request_id } = req;
    const program_exercise_id = safeString(req.params.program_exercise_id);

    try {
      requireUuid(program_exercise_id, "program_exercise_id");
      const newExerciseId = requireExerciseId(req.body?.exercise_id);
      const reason = normalizeReason(req.body?.reason);

      const client = await db.connect();
      try {
        const userId = resolveUserId(req);
        const current = await loadOwnedProgramExercise(client, program_exercise_id, userId);
        if (newExerciseId === current.exercise_id) {
          throw new RequestValidationError("Exercise is already assigned to this slot");
        }

        const profile = await loadUserProfile(client, userId);
        const allowedIds = await getAllowed(client, profile);
        if (!allowedIds.includes(newExerciseId)) {
          throw new RequestValidationError("Exercise not available for this user profile");
        }

        const duplicateResult = await client.query(
          `
          SELECT 1
          FROM program_exercise
          WHERE program_day_id = $1
            AND exercise_id = $2
            AND id != $3
          LIMIT 1
          `,
          [current.program_day_id, newExerciseId, program_exercise_id],
        );
        if (duplicateResult.rowCount > 0) {
          throw new RequestValidationError("Exercise already used on this day");
        }

        const exerciseResult = await client.query(
          `
          SELECT
            exercise_id,
            name,
            is_loadable,
            equipment_items_slugs,
            coaching_cues_json,
            load_guidance,
            logging_guidance
          FROM exercise_catalogue
          WHERE exercise_id = $1
            AND is_archived = false
          LIMIT 1
          `,
          [newExerciseId],
        );
        if (exerciseResult.rowCount === 0) {
          throw new RequestValidationError("Exercise not available for this user profile");
        }
        const replacement = exerciseResult.rows[0];

        const updateResult = await client.query(
          `
          UPDATE program_exercise
          SET
            exercise_id = $1,
            exercise_name = $2,
            is_loadable = $3,
            equipment_items_slugs_csv = array_to_string($4::text[], ','),
            coaching_cues_json = $5::jsonb,
            load_hint = COALESCE($6, ''),
            log_prompt = COALESCE($7, ''),
            original_exercise_id = CASE
              WHEN original_exercise_id IS NULL THEN $8
              ELSE original_exercise_id
            END,
            substitution_reason = $9,
            progression_outcome = NULL,
            progression_primary_lever = NULL,
            progression_confidence = NULL,
            progression_source = NULL,
            progression_reasoning_json = '[]'::jsonb,
            recommended_load_kg = NULL,
            recommended_reps_target = NULL,
            recommended_sets = NULL,
            recommended_rest_seconds = NULL
          WHERE program_id = $10
            AND purpose = $11
            AND order_in_day = $12
            AND exercise_id = $13
            AND (
              id = $14
              OR program_day_id IN (
                SELECT id
                FROM program_day
                WHERE program_id = $10
                  AND global_day_index >= $15
              )
            )
          RETURNING id, original_exercise_id
          `,
          [
            replacement.exercise_id,
            replacement.name,
            Boolean(replacement.is_loadable),
            Array.isArray(replacement.equipment_items_slugs) ? replacement.equipment_items_slugs : [],
            JSON.stringify(replacement.coaching_cues_json ?? []),
            replacement.load_guidance ?? "",
            replacement.logging_guidance ?? "",
            current.exercise_id,
            reason,
            current.program_id,
            current.purpose,
            current.order_in_day,
            current.exercise_id,
            program_exercise_id,
            current.global_day_index,
          ],
        );
        if (updateResult.rowCount === 0) {
          throw new NotFoundError("Program exercise not found");
        }

        return res.json({
          ok: true,
          program_exercise_id,
          exercise_id: replacement.exercise_id,
          exercise_name: replacement.name,
          original_exercise_id: updateResult.rows[0]?.original_exercise_id ?? current.original_exercise_id ?? current.exercise_id,
        });
      } finally {
        client.release();
      }
    } catch (err) {
      const mapped = mapError(err);
      return res.status(mapped.status).json({
        ok: false,
        request_id,
        code: mapped.code,
        error: mapped.message,
        details: mapped.details,
      });
    }
  }

  return { swapOptions, applySwap };
}

const handlers = createProgramExerciseHandlers();
programExerciseRouter.use(requireAuth);
programExerciseRouter.get("/program-exercise/:program_exercise_id/swap-options", handlers.swapOptions);
programExerciseRouter.post("/program-exercise/:program_exercise_id/swap", handlers.applySwap);
