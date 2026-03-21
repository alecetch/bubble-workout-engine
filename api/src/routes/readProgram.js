// api/src/routes/readProgram.js
import express from "express";
import { pool } from "../db.js";
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

export function createReadProgramHandlers(db = pool) {
  async function resolveUserId(client, query) {
    const user_id = safeString(query.user_id);
    const bubble_user_id = safeString(query.bubble_user_id);

    if (user_id) {
      requireUuid(user_id, "user_id");
      return user_id;
    }

    if (!bubble_user_id) {
      throw new RequestValidationError("Provide user_id or bubble_user_id");
    }

    const r = await client.query(
      `
      SELECT id
      FROM app_user
      WHERE bubble_user_id = $1
      LIMIT 1
      `,
      [bubble_user_id],
    );

    if (r.rowCount === 0) {
      throw new NotFoundError("User not found for bubble_user_id");
    }

    return r.rows[0].id;
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
        const user_id = await resolveUserId(client, req.query);

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
      // - otherwise pick earliest scheduled_date >= CURRENT_DATE; fallback to earliest overall
      let selectedDayId = selected_program_day_id;

      if (!selectedDayId) {
        const pickR = await client.query(
          `
          SELECT id AS program_day_id
          FROM program_day
          WHERE program_id = $1
          ORDER BY
            CASE WHEN scheduled_date >= CURRENT_DATE THEN 0 ELSE 1 END,
            scheduled_date ASC,
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
        const user_id = await resolveUserId(client, req.query);

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
          notes,
          is_loadable
        FROM program_exercise
        WHERE program_day_id = $1
        ORDER BY order_in_day
        `,
        [program_day_id],
      );

      // Group exercises by segment id.
      const itemsBySegmentId = new Map();
      for (const ex of exR.rows) {
        const key = ex.workout_segment_id;
        if (!key) continue; // Should not happen in current importer.
        if (!itemsBySegmentId.has(key)) itemsBySegmentId.set(key, []);
        itemsBySegmentId.get(key).push(ex);
      }

      const segments = segR.rows.map((seg) => ({
        ...seg,
        segment_type_label: segmentTypeLabel(seg.segment_type),
        items: itemsBySegmentId.get(seg.workout_segment_id) || [],
      }));

      // Optionally surface unassigned exercises if any exist.
      const unassigned = exR.rows.filter((x) => !x.workout_segment_id);
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

      const client = await db.connect();
      try {
        // Accept identity from body (PATCH) or query (fallback).
        const user_id = await resolveUserId(client, { ...req.query, ...req.body });

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

        return res.json({ ok: true, programDayId: program_day_id, isCompleted: Boolean(is_completed) });
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

  return { programOverview, dayFull, dayComplete };
}

const handlers = createReadProgramHandlers();

// ---- GET /api/program/:program_id/overview ----
// Returns: program header + weeks + calendar pills + selected day preview (incl equipment slugs).
readProgramRouter.get("/program/:program_id/overview", handlers.programOverview);

// ---- GET /api/day/:program_day_id/full ----
// Returns: day header + ordered segments[] with nested items[].
readProgramRouter.get("/day/:program_day_id/full", handlers.dayFull);

// ---- PATCH /api/day/:program_day_id/complete ----
// Marks (or unmarks) a program day as completed.
readProgramRouter.patch("/day/:program_day_id/complete", handlers.dayComplete);
