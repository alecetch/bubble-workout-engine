// api/src/routes/readProgram.js
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { makeGuidelineLoadService } from "../services/guidelineLoadService.js";
import { makeNotificationService } from "../services/notificationService.js";
import { makeProgressionDecisionService } from "../services/progressionDecisionService.js";
import { resolveMediaUrl } from "../utils/mediaUrl.js";
import { publicInternalError } from "../utils/publicError.js";
import { RequestValidationError, requireUuid, safeString } from "../utils/validate.js";

export const readProgramRouter = express.Router();

// ---- Helpers ----
class NotFoundError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "NotFoundError";
    this.status = 404;
    this.details = details;
  }
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

const SEGMENT_TYPE_LABELS = {
  single: "Single",
  superset: "Superset",
  giant_set: "Giant Set",
  amrap: "AMRAP",
  emom: "EMOM",
  warmup: "Warm-up",
  cooldown: "Cool-down",
};

const OUTCOME_CHIP = {
  increase_load: "Load increased ↑",
  increase_reps: "Reps progressing ↑",
  increase_sets: "Sets increasing ↑",
  reduce_rest: "Rest reduced ↓",
  hold: "Holding steady",
  deload_local: "Deload this week",
};

const OUTCOME_DETAIL_FALLBACK = {
  increase_load: "Your recent sessions hit the rep target comfortably - load has been increased.",
  increase_reps: "You are ready to push further into the rep range before the next load jump.",
  increase_sets: "Volume is increasing this session.",
  reduce_rest: "Rest periods are tightening as conditioning improves.",
  hold: "The current prescription stays the same - more data needed before changing.",
  deload_local: "Recent sessions showed signs of fatigue or underperformance - load is reduced to recover.",
};

const DECISION_HISTORY_LABEL_PHRASE = {
  increase_load: (delta) => (delta != null ? `Added ${Math.abs(delta)} kg` : "Load increased"),
  increase_reps: () => "Rep target increased",
  increase_sets: () => "Set added",
  reduce_rest: () => "Rest reduced",
  hold: () => "Held steady",
  deload_local: () => "Load reduced (deload)",
};

export function segmentTypeLabel(segment_type) {
  return SEGMENT_TYPE_LABELS[safeString(segment_type)] ?? safeString(segment_type);
}

export function parseEquipmentSlugs(rows) {
  // equipment_items_slugs_csv is a text column (default ''), comma-separated.
  const slugs = [];
  for (const r of rows) {
    const csv = safeString(r.equipment_items_slugs_csv);
    if (!csv) continue;
    for (const part of csv.split(",")) {
      const t = safeString(part);
      if (t) slugs.push(t);
    }
  }
  return uniq(slugs);
}

function normalizeDecisionSentence(value) {
  const trimmed = safeString(value);
  if (!trimmed) return null;
  let sentence = trimmed;
  if (!sentence.endsWith(".")) sentence += ".";
  if (sentence.length > 160) {
    sentence = `${sentence.slice(0, 157).replace(/\s+\S*$/, "")}...`;
  }
  return sentence;
}

function extractDecisionReasons(decisionContext) {
  try {
    const ctx = typeof decisionContext === "object" && decisionContext !== null
      ? decisionContext
      : JSON.parse(String(decisionContext ?? "{}"));
    return Array.isArray(ctx.reasons) ? ctx.reasons : [];
  } catch {
    return [];
  }
}

function extractDecisionEvidence(raw) {
  try {
    const value = typeof raw === "object" && raw !== null
      ? raw
      : JSON.parse(String(raw ?? "{}"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function buildAdaptationDecision(row) {
  if (!row) return null;
  const outcome = safeString(row.decision_outcome);
  if (!outcome) return null;

  const reasons = extractDecisionReasons(row.decision_context_json);
  const displayDetail = normalizeDecisionSentence(reasons[0])
    ?? OUTCOME_DETAIL_FALLBACK[outcome]
    ?? null;

  return {
    outcome,
    primary_lever: safeString(row.primary_lever),
    confidence: safeString(row.confidence),
    recommended_load_kg: row.recommended_load_kg != null ? Number(row.recommended_load_kg) : null,
    recommended_load_delta_kg: row.recommended_load_delta_kg != null ? Number(row.recommended_load_delta_kg) : null,
    recommended_reps_target: row.recommended_reps_target != null ? Number(row.recommended_reps_target) : null,
    recommended_rep_delta: row.recommended_rep_delta != null ? Number(row.recommended_rep_delta) : null,
    display_chip: OUTCOME_CHIP[outcome] ?? outcome,
    display_detail: displayDetail,
    decided_at: row.decided_at instanceof Date ? row.decided_at.toISOString() : String(row.decided_at ?? ""),
  };
}

function buildDecisionHistoryItem(row) {
  const outcome = safeString(row.decision_outcome) ?? "hold";
  const delta = row.recommended_load_delta_kg != null ? Number(row.recommended_load_delta_kg) : null;
  const phraseBuilder = DECISION_HISTORY_LABEL_PHRASE[outcome] ?? (() => outcome);
  const phrase = phraseBuilder(delta);
  const weekNumber = row.week_number ?? null;
  const reasons = extractDecisionReasons(row.decision_context_json);
  const displayReason = normalizeDecisionSentence(reasons[0])
    ?? OUTCOME_DETAIL_FALLBACK[outcome]
    ?? null;

  return {
    id: row.id,
    week_number: weekNumber,
    day_number: row.day_number ?? null,
    scheduled_date: row.scheduled_date ? String(row.scheduled_date).slice(0, 10) : null,
    outcome,
    primary_lever: safeString(row.primary_lever),
    confidence: safeString(row.confidence),
    recommended_load_kg: row.recommended_load_kg != null ? Number(row.recommended_load_kg) : null,
    recommended_load_delta_kg: delta,
    recommended_reps_target: row.recommended_reps_target != null ? Number(row.recommended_reps_target) : null,
    recommended_rep_delta: row.recommended_rep_delta != null ? Number(row.recommended_rep_delta) : null,
    display_label: weekNumber != null ? `Week ${weekNumber} - ${phrase}` : phrase,
    display_reason: displayReason,
    evidence: extractDecisionEvidence(row.evidence_summary_json),
    decided_at: row.decided_at instanceof Date ? row.decided_at.toISOString() : String(row.decided_at ?? ""),
  };
}

function mapError(err) {
  if (err instanceof RequestValidationError || err instanceof NotFoundError) {
    return { status: err.status ?? 400, code: err instanceof NotFoundError ? "not_found" : "validation_error", message: err.message, details: err.details };
  }
  if (err && typeof err === "object") {
    // Common Postgres codes.
    if (err.code === "22P02") return { status: 400, code: "invalid_input", message: "Invalid input format" };
    if (err.code === "23503") return { status: 400, code: "foreign_key_violation", message: "Invalid reference" };
    if (err.code === "23505") return { status: 409, code: "unique_violation", message: "Duplicate conflict" };
    if (err.code === "42P01") return { status: 500, code: "schema_missing", message: "Required table is missing; run migrations" };
  }
  return { status: 500, code: "internal_error", message: publicInternalError(err) };
}

export function createReadProgramHandlers(options = pool) {
  const resolved = options && typeof options.connect === "function"
    ? {
        db: options,
        guidelineLoadService: makeGuidelineLoadService(options),
        progressionDecisionService: makeProgressionDecisionService(options),
        notificationService: makeNotificationService(options),
      }
    : {
        db: options?.db ?? pool,
        guidelineLoadService: options?.guidelineLoadService ?? makeGuidelineLoadService(options?.db ?? pool),
        progressionDecisionService: options?.progressionDecisionService ?? makeProgressionDecisionService(options?.db ?? pool),
        notificationService: options?.notificationService ?? makeNotificationService(options?.db ?? pool),
      };
  const db = resolved.db;
  const guidelineLoadService = resolved.guidelineLoadService;
  const progressionDecisionService = resolved.progressionDecisionService;
  const notificationService = resolved.notificationService;

  function toAuthUserId(req) {
    return safeString(req.auth?.user_id) || safeString(req.auth?.userId);
  }

  function resolveUserId(req) {
    const userId = toAuthUserId(req);
    if (userId) return userId;
    throw new RequestValidationError("Missing authenticated user context");
  }

  async function programOverview(req, res) {
    const { request_id } = req;
    const program_id = safeString(req.params.program_id);
    const selected_program_day_id = safeString(req.query.selected_program_day_id);

    try {
      requireUuid(program_id, "program_id");
      if (selected_program_day_id) requireUuid(selected_program_day_id, "selected_program_day_id");

      const client = await db.connect();
      try {
        const user_id = resolveUserId(req);

      // 1) Program (guard by user_id)
      const prgR = await client.query(
        `
        SELECT
          p.id            AS program_id,
          p.program_title,
          p.program_title  AS title,
          p.program_summary,
          p.program_summary AS summary,
          p.weeks_count,
          p.days_per_week,
          p.start_date,
          p.status,
          p.hero_media_id,
          ma.image_key     AS hero_image_key,
          ma.image_url     AS hero_image_url
        FROM program p
        LEFT JOIN media_assets ma ON ma.id = p.hero_media_id
        WHERE p.id = $1 AND p.user_id = $2
        `,
        [program_id, user_id],
      );

      if (prgR.rowCount === 0) {
        throw new NotFoundError("Program not found");
      }

      const _prgRow = prgR.rows[0];
      const program = {
        ..._prgRow,
        hero_media: _prgRow.hero_image_key
          ? resolveMediaUrl({
              image_key: _prgRow.hero_image_key,
              image_url: _prgRow.hero_image_url,
            })
          : null,
      };

      // 2) Weeks
      const weeksR = await client.query(
        `
        SELECT week_number, focus, notes
        FROM program_week
        WHERE program_id = $1
        ORDER BY week_number
        `,
        [program_id],
      );

      // 3) Calendar pills (left-join calendar -> day; recovery rows have NULL day fields)
      const calR = await client.query(
        `
        SELECT
          c.id,
          c.program_day_id,
          c.program_day_key,
          c.scheduled_date,
          c.scheduled_weekday,
          c.week_number,
          c.global_day_index,
          c.is_training_day,
          d.day_number,
          d.day_label,
          d.session_duration_mins,
          d.is_completed,
          d.has_activity
        FROM program_calendar_day c
        LEFT JOIN program_day d
          ON d.id = c.program_day_id
        WHERE c.program_id = $1
        ORDER BY c.scheduled_date
        `,
        [program_id],
      );

      // 4) Pick selected day:
      // - if selected_program_day_id provided, use it (but must belong to program)
      // - otherwise pick the earliest incomplete training day; fallback to earliest overall
      let selectedDayId = selected_program_day_id;

      if (!selectedDayId) {
        const pickR = await client.query(
          `
          SELECT id AS program_day_id
          FROM program_day
          WHERE program_id = $1
          ORDER BY
            CASE WHEN is_completed = FALSE THEN 0 ELSE 1 END,
            global_day_index ASC
          LIMIT 1
          `,
          [program_id],
        );
        selectedDayId = pickR.rows[0]?.program_day_id || "";
      }

      // 5) Selected day preview (guard belongs to program)
      let selected_day = null;
      let equipment_slugs = [];

      if (selectedDayId) {
        const dayR = await client.query(
          `
          SELECT
            id AS program_day_id,
            program_id,
            scheduled_date,
            week_number,
            day_number,
            global_day_index,
            day_label,
            day_type,
            session_duration_mins,
            day_format_text,
            block_format_main_text,
            block_format_secondary_text,
            block_format_finisher_text
          FROM program_day
          WHERE id = $1 AND program_id = $2
          `,
          [selectedDayId, program_id],
        );

        if (dayR.rowCount > 0) {
          selected_day = dayR.rows[0];

          // Equipment slugs for selected day only (fast + good UX).
          const eqR = await client.query(
            `
            SELECT equipment_items_slugs_csv
            FROM program_exercise
            WHERE program_day_id = $1
            `,
            [selectedDayId],
          );
          equipment_slugs = parseEquipmentSlugs(eqR.rows);

          selected_day = {
            ...selected_day,
            equipment_slugs,
          };
        }
      }

        return res.json({
          ok: true,
          program,
          weeks: weeksR.rows,
          calendar_days: calR.rows,
          selected_day,
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

  async function dayFull(req, res) {
    const { request_id } = req;
    const program_day_id = safeString(req.params.program_day_id);

    try {
      requireUuid(program_day_id, "program_day_id");

      const client = await db.connect();
      try {
        const user_id = resolveUserId(req);

      // 1) Day header (guard by user_id via program)
      const dayR = await client.query(
        `
        SELECT
          d.id AS program_day_id,
          d.program_id,
          d.scheduled_date,
          d.week_number,
          d.day_number,
          d.global_day_index,
          d.day_label,
          d.day_type,
          d.session_duration_mins,
          d.day_format_text,
          d.block_format_main_text,
          d.block_format_secondary_text,
          d.block_format_finisher_text,
          d.is_completed,
          d.has_activity,
          p.client_profile_id,
          d.hero_media_id,
          ma.image_key  AS hero_image_key,
          ma.image_url  AS hero_image_url
        FROM program_day d
        JOIN program p
          ON p.id = d.program_id
        LEFT JOIN media_assets ma ON ma.id = d.hero_media_id
        WHERE d.id = $1 AND p.user_id = $2
        `,
        [program_day_id, user_id],
      );

      if (dayR.rowCount === 0) {
        throw new NotFoundError("Day not found");
      }

      const _dayRow = dayR.rows[0];
      const day = {
        ..._dayRow,
        hero_media: _dayRow.hero_image_key
          ? resolveMediaUrl({
              image_key: _dayRow.hero_image_key,
              image_url: _dayRow.hero_image_url,
            })
          : null,
      };

      // 2) Segments ordered
      const segR = await client.query(
        `
        SELECT
          id AS workout_segment_id,
          segment_key,
          block_key,
          block_order,
          segment_order_in_block,
          segment_type,
          purpose,
          purpose_label,
          segment_title,
          segment_notes,
          rounds,
          score_type,
          primary_score_label,
          secondary_score_label,
          segment_scheme_json,
          segment_duration_seconds,
          segment_duration_mmss,
          post_segment_rest_sec
        FROM workout_segment
        WHERE program_day_id = $1
        ORDER BY block_order, segment_order_in_block
        `,
        [program_day_id],
      );

      // 3) Exercises ordered
      const exR = await client.query(
        `
        SELECT
          id AS program_exercise_id,
          workout_segment_id,
          exercise_id,
          exercise_name,
          order_in_day,
          block_order,
          order_in_block,
          purpose,
          purpose_label,
          sets_prescribed,
          reps_prescribed,
          reps_unit,
          intensity_prescription,
          tempo,
          rest_seconds,
          progression_outcome,
          progression_primary_lever,
          progression_confidence,
          progression_source,
          progression_reasoning_json,
          recommended_load_kg,
          recommended_reps_target,
          recommended_sets,
          recommended_rest_seconds,
          notes,
          is_loadable,
          coaching_cues_json,
          load_hint,
          log_prompt
        FROM program_exercise
        WHERE program_day_id = $1
        ORDER BY order_in_day
        `,
        [program_day_id],
      );

      const programExerciseIds = exR.rows
        .map((row) => row.program_exercise_id)
        .filter((value) => Boolean(safeString(value)));

      let decisionByPeId = new Map();
      if (programExerciseIds.length > 0) {
        const decisionRows = await client.query(
          `
          SELECT DISTINCT ON (epd.program_exercise_id)
            epd.program_exercise_id,
            epd.decision_outcome,
            epd.primary_lever,
            epd.confidence,
            epd.recommended_load_kg,
            epd.recommended_load_delta_kg,
            epd.recommended_reps_target,
            epd.recommended_rep_delta,
            epd.decision_context_json,
            epd.created_at AS decided_at
          FROM exercise_progression_decision epd
          WHERE epd.program_exercise_id = ANY($1::uuid[])
            AND epd.user_id = $2
          ORDER BY epd.program_exercise_id, epd.created_at DESC
          `,
          [programExerciseIds, user_id],
        );
        decisionByPeId = new Map(
          decisionRows.rows.map((row) => [row.program_exercise_id, row]),
        );
      }

      let resolvedClientProfileId = day.client_profile_id ?? null;
      if (!resolvedClientProfileId) {
        const profileR = await client.query(
          `
          SELECT id
          FROM client_profile
          WHERE user_id = $1
          ORDER BY updated_at DESC
          LIMIT 1
          `,
          [user_id],
        );
        resolvedClientProfileId = profileR.rows[0]?.id ?? null;
      }

      let annotatedExercises = exR.rows;
      if (resolvedClientProfileId) {
        try {
          annotatedExercises = await guidelineLoadService.annotateExercisesWithGuidelineLoads({
            exercises: exR.rows,
            clientProfileId: resolvedClientProfileId,
            userId: user_id,
            programType: day.day_type,
          });
        } catch (guidelineErr) {
          req.log.warn(
            { event: "read_program.guideline_load.warning", err: guidelineErr?.message },
            "guideline load annotation failed; returning day without guideline loads",
          );
        }
      }

      // Group exercises by segment id.
      const itemsBySegmentId = new Map();
      for (const ex of annotatedExercises) {
        const key = ex.workout_segment_id;
        if (!key) continue; // Should not happen in current importer.
        if (!itemsBySegmentId.has(key)) itemsBySegmentId.set(key, []);
        itemsBySegmentId.get(key).push(ex);
      }

      const segments = segR.rows.map((seg) => ({
        ...seg,
        segment_type_label: segmentTypeLabel(seg.segment_type),
        items: (itemsBySegmentId.get(seg.workout_segment_id) || []).map((item) => {
          const {
            progression_outcome,
            progression_primary_lever,
            progression_confidence,
            progression_source,
            progression_reasoning_json,
            recommended_load_kg,
            recommended_reps_target,
            recommended_sets,
            recommended_rest_seconds,
            ...rest
          } = item;
          return {
            ...rest,
            progression_recommendation: progression_outcome
              ? {
                  outcome: progression_outcome,
                  primary_lever: progression_primary_lever,
                  confidence: progression_confidence,
                  source: progression_source,
                  reasoning: Array.isArray(progression_reasoning_json)
                    ? progression_reasoning_json
                    : [],
                  recommended_load_kg: recommended_load_kg == null ? null : Number(recommended_load_kg),
                  recommended_reps_target: recommended_reps_target == null ? null : Number(recommended_reps_target),
                  recommended_sets: recommended_sets == null ? null : Number(recommended_sets),
                  recommended_rest_seconds: recommended_rest_seconds == null ? null : Number(recommended_rest_seconds),
                }
              : null,
            adaptation_decision: buildAdaptationDecision(
              decisionByPeId.get(item.program_exercise_id) ?? null,
            ),
          };
        }),
      }));

      // Optionally surface unassigned exercises if any exist.
      const unassigned = annotatedExercises
        .filter((x) => !x.workout_segment_id)
        .map((item) => {
          const {
            progression_outcome,
            progression_primary_lever,
            progression_confidence,
            progression_source,
            progression_reasoning_json,
            recommended_load_kg,
            recommended_reps_target,
            recommended_sets,
            recommended_rest_seconds,
            ...rest
          } = item;
          return {
            ...rest,
            progression_recommendation: progression_outcome
              ? {
                  outcome: progression_outcome,
                  primary_lever: progression_primary_lever,
                  confidence: progression_confidence,
                  source: progression_source,
                  reasoning: Array.isArray(progression_reasoning_json) ? progression_reasoning_json : [],
                  recommended_load_kg: recommended_load_kg == null ? null : Number(recommended_load_kg),
                  recommended_reps_target: recommended_reps_target == null ? null : Number(recommended_reps_target),
                  recommended_sets: recommended_sets == null ? null : Number(recommended_sets),
                  recommended_rest_seconds: recommended_rest_seconds == null ? null : Number(recommended_rest_seconds),
                }
              : null,
            adaptation_decision: buildAdaptationDecision(
              decisionByPeId.get(item.program_exercise_id) ?? null,
            ),
          };
        });
      if (unassigned.length) {
        segments.push({
          workout_segment_id: null,
          segment_key: "UNASSIGNED",
          block_key: "Z",
          block_order: 999,
          segment_order_in_block: 1,
          segment_type: "single",
          segment_type_label: "Single",
          purpose: "accessory",
          purpose_label: "Accessory",
          segment_title: "Unassigned Exercises",
          segment_notes: "Exercises without a segment mapping (check importer/emitter).",
          rounds: 1,
          score_type: "none",
          primary_score_label: "",
          secondary_score_label: "",
          segment_scheme_json: {},
          segment_duration_seconds: 0,
          segment_duration_mmss: "",
          items: unassigned,
        });
      }

        return res.json({
          ok: true,
          day,
          segments,
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

  async function dayComplete(req, res) {
    const { request_id } = req;
    const program_day_id = safeString(req.params.program_day_id);
    const is_completed = req.body?.is_completed !== false; // default true

    try {
      requireUuid(program_day_id, "program_day_id");

      let user_id = "";
      const client = await db.connect();
      try {
        // Accept identity from body (PATCH) or query (fallback).
        user_id = resolveUserId(req);

        const r = await client.query(
          `UPDATE program_day pd
           SET is_completed = $3
           FROM program p
           WHERE pd.id = $1
             AND p.id = pd.program_id
             AND p.user_id = $2
           RETURNING pd.id`,
          [program_day_id, user_id, Boolean(is_completed)],
        );

        if (r.rowCount === 0) throw new NotFoundError("Day not found or access denied");
      } finally {
        client.release();
      }

      if (Boolean(is_completed)) {
        // Fire-and-forget Layer B backstop. The intended primary trigger remains
        // PATCH /api/day/:program_day_id/complete; this path must never delay the response.
        db.query(
          `SELECT
             p.id AS program_id,
             p.program_type,
             cp.fitness_rank
           FROM program_day pd
           JOIN program p
             ON p.id = pd.program_id
           LEFT JOIN client_profile cp
             ON cp.user_id = p.user_id
           WHERE pd.id = $1`,
          [program_day_id],
        )
          .then(async (meta) => {
            const row = meta?.rows?.[0];
            if (!row?.program_id) return null;
            const decisionResult = await progressionDecisionService.applyProgressionRecommendations({
              programId: row.program_id,
              userId: user_id,
              programType: row.program_type,
              fitnessRank: row.fitness_rank ?? 1,
              completedProgramDayId: program_day_id,
            });

            const hasDeload = decisionResult?.decisions?.some((decision) => decision.outcome === "deload_local");
            if (!hasDeload) return decisionResult;

            const prefR = await db.query(
              `SELECT deload_notification_enabled
               FROM notification_preference
               WHERE user_id = $1`,
              [user_id],
            ).catch(() => ({ rows: [] }));
            const deloadEnabled = prefR.rows[0]?.deload_notification_enabled ?? true;
            if (!deloadEnabled) return decisionResult;

            await notificationService.send({
              userId: user_id,
              title: "Easy week incoming",
              body: "Your body showed signs of fatigue - your program has been adjusted to help you recover.",
              data: { event: "deload", programDayId: program_day_id },
              emailSubject: "Recovery week - your program adjusted",
              emailText: [
                "Easy week ahead.",
                "",
                "Based on your recent sessions, your program has been adjusted to reduce load on some exercises.",
                "This is a normal and necessary part of long-term progress.",
                "",
                "Open the app to see what changed.",
              ].join("\n"),
            });

            return decisionResult;
          })
          .catch((err) => {
            req.log?.warn(
              { event: "progression.layer_b.error", err: err?.message, program_day_id },
              "Layer B progression decision failed (non-blocking)",
            );
          });
      }

      return res.json({ ok: true, programDayId: program_day_id, isCompleted: Boolean(is_completed) });
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

  async function exerciseDecisionHistory(req, res) {
    const { request_id } = req;

    try {
      const programExerciseId = requireUuid(req.params.program_exercise_id, "program_exercise_id");
      const user_id = resolveUserId(req);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit ?? "20", 10) || 20));
      const offset = Math.max(0, parseInt(req.query.offset ?? "0", 10) || 0);

      const ownerR = await db.query(
        `
        SELECT pe.id
        FROM program_exercise pe
        JOIN program p ON p.id = pe.program_id
        WHERE pe.id = $1 AND p.user_id = $2
        LIMIT 1
        `,
        [programExerciseId, user_id],
      );

      if (ownerR.rowCount === 0) {
        return res.status(403).json({ ok: false, request_id, error: "not_found_or_forbidden" });
      }

      const [countR, rowsR, nameR] = await Promise.all([
        db.query(
          `SELECT COUNT(*)::int AS total
           FROM exercise_progression_decision
           WHERE program_exercise_id = $1 AND user_id = $2`,
          [programExerciseId, user_id],
        ),
        db.query(
          `
          SELECT
            epd.id,
            epd.decision_outcome,
            epd.primary_lever,
            epd.confidence,
            epd.recommended_load_kg,
            epd.recommended_load_delta_kg,
            epd.recommended_reps_target,
            epd.recommended_rep_delta,
            epd.evidence_summary_json,
            epd.decision_context_json,
            epd.created_at AS decided_at,
            pd.week_number,
            pd.day_number,
            pd.scheduled_date,
            pe.exercise_id
          FROM exercise_progression_decision epd
          LEFT JOIN program_day pd ON pd.id = epd.program_day_id
          LEFT JOIN program_exercise pe ON pe.id = epd.program_exercise_id
          WHERE epd.program_exercise_id = $1 AND epd.user_id = $2
          ORDER BY epd.created_at DESC
          LIMIT $3 OFFSET $4
          `,
          [programExerciseId, user_id, limit, offset],
        ),
        db.query(
          `SELECT
             COALESCE(
               (SELECT ec.name
                FROM exercise_catalogue ec
                JOIN program_exercise pe ON pe.exercise_id = ec.exercise_id
                WHERE pe.id = $1
                LIMIT 1),
               (SELECT pe.exercise_name FROM program_exercise pe WHERE pe.id = $1 LIMIT 1),
               $1
             ) AS exercise_name,
             (SELECT pe.exercise_id FROM program_exercise pe WHERE pe.id = $1 LIMIT 1) AS exercise_id`,
          [programExerciseId],
        ),
      ]);

      const total = countR.rows[0]?.total ?? 0;
      const exerciseName = nameR.rows[0]?.exercise_name ?? programExerciseId;
      const exerciseId = nameR.rows[0]?.exercise_id ?? null;

      return res.json({
        ok: true,
        exercise_id: exerciseId,
        exercise_name: exerciseName,
        total_decisions: total,
        decisions: rowsR.rows.map(buildDecisionHistoryItem),
      });
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

  return { programOverview, dayFull, dayComplete, exerciseDecisionHistory };
}

const handlers = createReadProgramHandlers();
readProgramRouter.use(requireAuth);

// ---- GET /api/program/:program_id/overview ----
// Returns: program header + weeks + calendar pills + selected day preview (incl equipment slugs).
readProgramRouter.get("/program/:program_id/overview", handlers.programOverview);

// ---- GET /api/day/:program_day_id/full ----
// Returns: day header + ordered segments[] with nested items[].
readProgramRouter.get("/day/:program_day_id/full", handlers.dayFull);

// ---- PATCH /api/day/:program_day_id/complete ----
// Marks (or unmarks) a program day as completed.
readProgramRouter.patch("/day/:program_day_id/complete", handlers.dayComplete);

// ---- GET /api/program-exercise/:program_exercise_id/decision-history ----
readProgramRouter.get(
  "/program-exercise/:program_exercise_id/decision-history",
  handlers.exerciseDecisionHistory,
);
