import { RequestValidationError, safeString } from "../utils/validate.js";

const SOURCE_PRIORITY = {
  manual: 4,
  manual_update: 4,
  fitness_test: 3,
  history_import: 2,
  onboarding: 1,
  skipped: 0,
};

function sourcePriority(src) {
  return SOURCE_PRIORITY[src] ?? 1;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAnchorLiftInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("anchorLifts entries must be objects");
  }

  return {
    estimationFamily: safeString(value.estimationFamily ?? value.estimation_family).toLowerCase(),
    exerciseId: safeString(value.exerciseId ?? value.exercise_id) || null,
    loadKg: toNumber(value.loadKg ?? value.load_kg),
    reps: value.reps == null ? null : Number.parseInt(String(value.reps), 10),
    rir: toNumber(value.rir),
    skipped: Boolean(value.skipped),
    source: safeString(value.source) || null,
    sourceDetailJson: (value.sourceDetailJson ?? value.source_detail_json) || {},
  };
}

export function makeAnchorLiftService(db) {
  async function upsertAnchorLifts(clientProfileId, anchorLifts = []) {
    if (!Array.isArray(anchorLifts)) {
      throw new RequestValidationError("anchorLifts must be an array");
    }

    const normalized = anchorLifts.map(normalizeAnchorLiftInput);
    const exerciseIds = [...new Set(normalized.map((lift) => lift.exerciseId).filter(Boolean))];

    const exerciseFamilyMap = new Map();
    if (exerciseIds.length > 0) {
      const result = await db.query(
        `
        SELECT
          exercise_id,
          COALESCE(load_estimation_metadata->>'estimation_family', '') AS estimation_family
        FROM exercise_catalogue
        WHERE exercise_id = ANY($1::text[])
        `,
        [exerciseIds],
      );

      for (const row of result.rows) {
        exerciseFamilyMap.set(row.exercise_id, safeString(row.estimation_family).toLowerCase());
      }
    }

    const saved = [];
    for (const lift of normalized) {
      const catalogFamily = lift.exerciseId ? exerciseFamilyMap.get(lift.exerciseId) : "";
      const estimationFamily = lift.estimationFamily || catalogFamily;

      if (!estimationFamily) {
        throw new RequestValidationError("anchor lift estimationFamily is required");
      }

      if (!lift.skipped) {
        if (!lift.exerciseId) {
          throw new RequestValidationError(`anchor lift ${estimationFamily} exerciseId is required`);
        }
        if (!exerciseFamilyMap.has(lift.exerciseId)) {
          throw new RequestValidationError(`Unknown anchor lift exerciseId: ${lift.exerciseId}`);
        }
        if (catalogFamily && catalogFamily !== estimationFamily) {
          throw new RequestValidationError(
            `anchor lift estimationFamily mismatch for exerciseId: ${lift.exerciseId}`,
          );
        }
        if (lift.loadKg == null || lift.loadKg <= 0) {
          throw new RequestValidationError(`anchor lift ${estimationFamily} loadKg must be greater than 0`);
        }
        if (!Number.isInteger(lift.reps) || lift.reps < 1 || lift.reps > 30) {
          throw new RequestValidationError(`anchor lift ${estimationFamily} reps must be between 1 and 30`);
        }
        if (lift.rir != null && (lift.rir < 0 || lift.rir > 10)) {
          throw new RequestValidationError(`anchor lift ${estimationFamily} rir must be between 0 and 10`);
        }
      }

      const incomingSource = lift.source || (lift.skipped ? "skipped" : "onboarding");
      const incomingPriority = sourcePriority(incomingSource);
      const existingR = await db.query(
        `SELECT source
         FROM client_anchor_lift
         WHERE client_profile_id = $1
           AND estimation_family = $2`,
        [clientProfileId, estimationFamily],
      );
      const existingSource = existingR.rows[0]?.source ?? null;
      if (existingSource && sourcePriority(existingSource) > incomingPriority) {
        continue;
      }

      const result = await db.query(
        `
        INSERT INTO client_anchor_lift (
          client_profile_id,
          estimation_family,
          exercise_id,
          load_kg,
          reps,
          rir,
          skipped,
          source,
          source_detail_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (client_profile_id, estimation_family)
        DO UPDATE SET
          exercise_id = EXCLUDED.exercise_id,
          load_kg = EXCLUDED.load_kg,
          reps = EXCLUDED.reps,
          rir = EXCLUDED.rir,
          skipped = EXCLUDED.skipped,
          source = EXCLUDED.source,
          source_detail_json = EXCLUDED.source_detail_json,
          updated_at = now()
        RETURNING *
        `,
        [
          clientProfileId,
          estimationFamily,
          lift.skipped ? null : lift.exerciseId,
          lift.skipped ? null : lift.loadKg,
          lift.skipped ? null : lift.reps,
          lift.skipped ? null : lift.rir,
          lift.skipped,
          incomingSource,
          JSON.stringify(lift.sourceDetailJson ?? {}),
        ],
      );
      saved.push(result.rows[0]);
    }

    return saved;
  }

  async function getAnchorLifts(clientProfileId) {
    const result = await db.query(
      `
      SELECT *
      FROM client_anchor_lift
      WHERE client_profile_id = $1
        AND skipped = false
      ORDER BY estimation_family ASC, updated_at DESC
      `,
      [clientProfileId],
    );
    return result.rows;
  }

  return {
    upsertAnchorLifts,
    getAnchorLifts,
  };
}
