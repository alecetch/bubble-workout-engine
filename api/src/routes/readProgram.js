// api/src/routes/readProgram.js
import express from "express";
import { pool } from "../db.js";

export const readProgramRouter = express.Router();

// ---- Helpers ----
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

function isUuid(v) {
  // Accept standard UUID v4/v1 formats (case-insensitive)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s(v));
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function parseEquipmentSlugs(rows) {
  // equipment_items_slugs_csv is a text column (default ''), comma-separated
  const slugs = [];
  for (const r of rows) {
    const csv = s(r.equipment_items_slugs_csv);
    if (!csv) continue;
    for (const part of csv.split(",")) {
      const t = s(part);
      if (t) slugs.push(t);
    }
  }
  return uniq(slugs);
}

function mapError(err) {
  if (err instanceof ValidationError) {
    return { status: err.status ?? 400, code: "validation_error", message: err.message, details: err.details };
  }
  if (err && typeof err === "object") {
    // Common Postgres codes
    if (err.code === "22P02") return { status: 400, code: "invalid_input", message: "Invalid input format" };
    if (err.code === "23503") return { status: 400, code: "foreign_key_violation", message: "Invalid reference" };
    if (err.code === "23505") return { status: 409, code: "unique_violation", message: "Duplicate conflict" };
  }
  return { status: 500, code: "internal_error", message: err?.message || "Internal server error" };
}

// ---- GET /api/program/:program_id/overview ----
// Returns: program header + weeks + calendar pills + selected day preview (incl equipment slugs)
readProgramRouter.get("/program/:program_id/overview", async (req, res) => {
  const program_id = s(req.params.program_id);
  const user_id = s(req.query.user_id);
  const selected_program_day_id = s(req.query.selected_program_day_id);

  try {
    if (!isUuid(program_id)) throw new ValidationError("Invalid program_id");
    if (!isUuid(user_id)) throw new ValidationError("Invalid user_id");
    if (selected_program_day_id && !isUuid(selected_program_day_id)) {
      throw new ValidationError("Invalid selected_program_day_id");
    }

    const client = await pool.connect();
    try {
      // 1) Program (guard by user_id)
      const prgR = await client.query(
        `
        SELECT
          id AS program_id,
          program_title,
          program_summary,
          weeks_count,
          days_per_week,
          start_date,
          status
        FROM program
        WHERE id = $1 AND user_id = $2
        `,
        [program_id, user_id],
      );

      if (prgR.rowCount === 0) {
        // Don’t leak existence if wrong user_id
        return res.status(404).json({ ok: false, code: "not_found", error: "Program not found" });
      }

      const program = prgR.rows[0];

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

      // 3) Calendar pills (join calendar -> day for label/state)
      const calR = await client.query(
        `
        SELECT
          c.program_day_id,
          c.program_day_key,
          c.scheduled_date,
          c.scheduled_weekday,
          c.week_number,
          d.day_number,
          c.global_day_index,
          d.day_label,
          d.session_duration_mins,
          d.is_completed,
          d.has_activity
        FROM program_calendar_day c
        JOIN program_day d
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

          // Equipment slugs for selected day only (fast + good UX)
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
      code: mapped.code,
      error: mapped.message,
      details: mapped.details,
    });
  }
});

// ---- GET /api/day/:program_day_id/full ----
// Returns: day header + ordered segments[] with nested items[]
readProgramRouter.get("/day/:program_day_id/full", async (req, res) => {
  const program_day_id = s(req.params.program_day_id);
  const user_id = s(req.query.user_id);

  try {
    if (!isUuid(program_day_id)) throw new ValidationError("Invalid program_day_id");
    if (!isUuid(user_id)) throw new ValidationError("Invalid user_id");

    const client = await pool.connect();
    try {
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
          d.has_activity
        FROM program_day d
        JOIN program p
          ON p.id = d.program_id
        WHERE d.id = $1 AND p.user_id = $2
        `,
        [program_day_id, user_id],
      );

      if (dayR.rowCount === 0) {
        return res.status(404).json({ ok: false, code: "not_found", error: "Day not found" });
      }

      const day = dayR.rows[0];

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
          segment_duration_mmss
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
          notes
        FROM program_exercise
        WHERE program_day_id = $1
        ORDER BY order_in_day
        `,
        [program_day_id],
      );

      // Group exercises by segment id
      const itemsBySegmentId = new Map();
      for (const ex of exR.rows) {
        const key = ex.workout_segment_id;
        if (!key) continue; // should not happen in your current importer
        if (!itemsBySegmentId.has(key)) itemsBySegmentId.set(key, []);
        itemsBySegmentId.get(key).push(ex);
      }

      const segments = segR.rows.map((seg) => ({
        ...seg,
        items: itemsBySegmentId.get(seg.workout_segment_id) || [],
      }));

      // Optionally surface unassigned exercises if any exist
      const unassigned = exR.rows.filter((x) => !x.workout_segment_id);
      if (unassigned.length) {
        segments.push({
          workout_segment_id: null,
          segment_key: "UNASSIGNED",
          block_key: "Z",
          block_order: 999,
          segment_order_in_block: 1,
          segment_type: "single",
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
      code: mapped.code,
      error: mapped.message,
      details: mapped.details,
    });
  }
});