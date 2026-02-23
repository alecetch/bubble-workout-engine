// api/src/routes/importEmitter.js
import express from "express";
import { pool } from "../db.js";

export const importEmitterRouter = express.Router();

function s(v) {
  return (v ?? "").toString().trim();
}
function toInt(v, fallback = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
function safeJsonParse(v, fallback) {
  try {
    if (v == null) return fallback;
    if (typeof v === "object") return v;
    const t = String(v).trim();
    if (!t) return fallback;
    return JSON.parse(t);
  } catch {
    return fallback;
  }
}

// Convert ms -> UTC date (YYYY-MM-DD) for SQL DATE
function utcDateFromMs(ms) {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Floor to UTC midnight in ms
function floorUtcDayMs(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function splitRow(line) {
  // emitter already strips newlines inside fields; '|' is delimiter; it also replaced '|' inside text with '/'
  return String(line).split("|");
}

/**
 * Expected row formats:
 * PRG: 9 cols
 * WEEK: 4 cols
 * DAY: 14 cols
 * SEG: 19 cols
 * EX: 26 cols
 */
function parseEmitterRows(rows) {
  const parsed = {
    prg: null,
    weeks: [],
    days: [],
    segs: [],
    exs: [],
  };

  for (const line of rows) {
    if (!line) continue;
    const cols = splitRow(line);
    const rowType = cols[0];

    if (rowType === "PRG") {
      parsed.prg = {
        program_title: s(cols[1]),
        program_summary: s(cols[2]),
        weeks_count: toInt(cols[3], 0),
        days_per_week: toInt(cols[4], 0),
        program_outline_json: safeJsonParse(cols[5], {}),
        start_offset_days: toInt(cols[6], 0),
        start_weekday: s(cols[7]),
        preferred_days_sorted_json: safeJsonParse(cols[8], []),
      };
    } else if (rowType === "WEEK") {
      parsed.weeks.push({
        week_number: toInt(cols[1], 0),
        focus: s(cols[2]),
        notes: s(cols[3]),
      });
    } else if (rowType === "DAY") {
      parsed.days.push({
        week_number: toInt(cols[1], 0),
        day_number: toInt(cols[2], 0),
        global_day_index: toInt(cols[3], 0),
        day_label: s(cols[4]),
        day_type: s(cols[5]),
        session_duration_mins: toInt(cols[6], 0),
        day_format_text: s(cols[7]),
        block_format_main_text: s(cols[8]),
        block_format_secondary_text: s(cols[9]),
        block_format_finisher_text: s(cols[10]),
        scheduled_offset_days: toInt(cols[11], 0),
        scheduled_weekday: s(cols[12]),
        program_day_key: s(cols[13]),
      });
    } else if (rowType === "SEG") {
      parsed.segs.push({
        segment_key: s(cols[1]),
        segment_type: s(cols[2]),
        segment_title: s(cols[3]),
        score_type: s(cols[4]),
        primary_score_label: s(cols[5]),
        secondary_score_label: s(cols[6]),
        rounds: toInt(cols[7], 1),
        segment_notes: s(cols[8]),
        segment_scheme_json: safeJsonParse(cols[9], {}),
        segment_duration_seconds: toInt(cols[10], 0),
        segment_duration_mmss: s(cols[11]),
        block_key: s(cols[12]),
        segment_order_in_block: toInt(cols[13], 1),
        block_order: toInt(cols[14], 1),
        purpose: s(cols[15]),
        purpose_label: s(cols[16]),
        reserved: s(cols[17]),
        program_day_key: s(cols[18]),
      });
    } else if (rowType === "EX") {
      parsed.exs.push({
        exercise_id: s(cols[1]),
        order_in_day: toInt(cols[2], 0),
        block_order: toInt(cols[3], 0),
        purpose: s(cols[4]),
        purpose_label: s(cols[5]),
        order_in_block: toInt(cols[6], 0),
        sets_prescribed: toInt(cols[7], 0),
        reps_prescribed: s(cols[8]),
        reps_unit: s(cols[9]) || "reps",
        intensity_prescription: s(cols[10]),
        tempo: s(cols[11]),
        rest_seconds: toInt(cols[12], 0),
        notes: s(cols[13]),
        block_key: s(cols[14]),
        segment_key: s(cols[17]),
        segment_type: s(cols[18]),
        segment_rounds: toInt(cols[20], 1),
        item_index_in_segment: toInt(cols[22], 0),
        reserved_json: safeJsonParse(cols[23], {}),
        program_day_key: s(cols[25]),
      });
    }
  }

  if (!parsed.prg) throw new Error("No PRG row found in emitter rows");

  return parsed;
}

importEmitterRouter.post("/import/emitter", express.json({ limit: "10mb" }), async (req, res) => {
  const user_id = s(req.body?.user_id);
  const anchor_date_ms = req.body?.anchor_date_ms;

  let rows = req.body?.rows;

  // allow raw string with newlines too
  if (!rows && typeof req.body?.emitter_output === "string") {
    rows = req.body.emitter_output.split(/\r?\n/).filter(Boolean);
  }

  if (!user_id) return res.status(400).json({ ok: false, error: "Missing user_id" });
  if (!Number.isFinite(Number(anchor_date_ms))) return res.status(400).json({ ok: false, error: "Missing anchor_date_ms" });
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ ok: false, error: "Missing rows[]" });

  const anchorDayMs = floorUtcDayMs(Number(anchor_date_ms));
  const parsed = parseEmitterRows(rows);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Insert program
    // NOTE: adjust column names here ONLY if your actual program table differs.
    const prg = parsed.prg;

    // Compute program-level start_date ONCE
const programStartMs =
  anchorDayMs + prg.start_offset_days * 24 * 60 * 60 * 1000;

const start_date = utcDateFromMs(programStartMs);

    const insertProgramSql = `
      INSERT INTO program (
        user_id,
        program_title,
        program_summary,
        weeks_count,
        days_per_week,
        program_outline_json,
        start_date,
        start_offset_days,
        start_weekday,
        preferred_days_sorted_json
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::date,$8,$9,$10::jsonb)
      RETURNING id
    `;

    const programResult = await client.query(insertProgramSql, [
      user_id,
      prg.program_title,
      prg.program_summary,
      prg.weeks_count,
      prg.days_per_week,
      JSON.stringify(prg.program_outline_json || {}),
      start_date,
      prg.start_offset_days,
      prg.start_weekday,
      JSON.stringify(prg.preferred_days_sorted_json || []),
    ]);

    const program_id = programResult.rows[0].id;

    // 2) Insert weeks + map week_number -> program_week_id
    const weekIdByNumber = new Map();

    for (const w of parsed.weeks) {
      const r = await client.query(
        `
        INSERT INTO program_week (program_id, week_number, focus, notes)
        VALUES ($1,$2,$3,$4)
        RETURNING id
        `,
        [program_id, w.week_number, w.focus, w.notes]
      );
      weekIdByNumber.set(w.week_number, r.rows[0].id);
    }

    // 3) Insert days + map program_day_key -> program_day_id
    const dayIdByKey = new Map();

for (const d of parsed.days) {
  const program_week_id = weekIdByNumber.get(d.week_number);
  if (!program_week_id)
    throw new Error(`No program_week_id found for week_number=${d.week_number}`);

  const scheduledDateMs =
    anchorDayMs + d.scheduled_offset_days * 24 * 60 * 60 * 1000;

  const scheduled_date = utcDateFromMs(scheduledDateMs);

      const r = await client.query(
        `
        INSERT INTO program_day (
          program_id,
          program_week_id,
          week_number,
          day_number,
          global_day_index,
          program_day_key,
          day_label,
          day_type,
          session_duration_mins,
          day_format_text,
          block_format_main_text,
          block_format_secondary_text,
          block_format_finisher_text,
          scheduled_offset_days,
          scheduled_weekday,
          scheduled_date
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::date)
        RETURNING id
        `,
        [
          program_id,
          program_week_id,
          d.week_number,
          d.day_number,
          d.global_day_index,
          d.program_day_key,
          d.day_label,
          d.day_type,
          d.session_duration_mins,
          d.day_format_text,
          d.block_format_main_text,
          d.block_format_secondary_text,
          d.block_format_finisher_text,
          d.scheduled_offset_days,
          d.scheduled_weekday,
          scheduled_date,
        ]
      );

      dayIdByKey.set(d.program_day_key, r.rows[0].id);

      // 4) Calendar day row (training day = true)
      await client.query(
        `
        INSERT INTO program_calendar_day (
          program_id,
          program_week_id,
          program_day_id,
          week_number,
          scheduled_offset_days,
          scheduled_weekday,
          scheduled_date,
          global_day_index,
          is_training_day,
          program_day_key
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8,true,$9)
        `,
        [
          program_id,
          program_week_id,
          r.rows[0].id,
          d.week_number,
          d.scheduled_offset_days,
          d.scheduled_weekday,
          scheduled_date,
          d.global_day_index,
          d.program_day_key,
        ]
      );
    }

// After inserting all days:
if (!dayIdByKey.size) {
  throw new Error(
    `No days inserted. parsed.days=${parsed.days.length}. First DAY keys: ${
      parsed.days.slice(0, 5).map(d => d.program_day_key).join(", ")
    }`
  );
}

if (!dayIdByKey.has("PD_W1_D1")) {
  throw new Error(
    `DAY map does not include PD_W1_D1. Keys inserted: ${
      Array.from(dayIdByKey.keys()).slice(0, 20).join(", ")
    }`
  );
}

    // 5) Insert segments + map (program_day_key, segment_key) -> workout_segment_id
    const segmentIdByDayAndKey = new Map();

    for (const seg of parsed.segs) {
      const program_day_id = dayIdByKey.get(seg.program_day_key);
      if (!program_day_id) throw new Error(`No program_day_id found for program_day_key=${seg.program_day_key}`);

      const programStartMs = anchorDayMs + (prg.start_offset_days * 24 * 60 * 60 * 1000);
const start_date = utcDateFromMs(programStartMs);
      const r = await client.query(
        `
        INSERT INTO workout_segment (
          program_id,
          program_day_id,
          program_day_key,
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
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19)
        RETURNING id
        `,
        [
          program_id,
          program_day_id,
          seg.program_day_key,
          seg.segment_key,
          seg.block_key,
          seg.block_order,
          seg.segment_order_in_block,
          seg.segment_type,
          seg.purpose,
          seg.purpose_label,
          seg.segment_title,
          seg.segment_notes,
          seg.rounds,
          seg.score_type || "none",
          seg.primary_score_label,
          seg.secondary_score_label,
          JSON.stringify(seg.segment_scheme_json || {}),
          seg.segment_duration_seconds,
          seg.segment_duration_mmss,
        ]
      );

      segmentIdByDayAndKey.set(`${seg.program_day_key}::${seg.segment_key}`, r.rows[0].id);
    }

    // 6) Insert exercises
    for (const ex of parsed.exs) {
      const program_day_id = dayIdByKey.get(ex.program_day_key);
      if (!program_day_id) throw new Error(`No program_day_id found for program_day_key=${ex.program_day_key}`);

      const workout_segment_id = segmentIdByDayAndKey.get(`${ex.program_day_key}::${ex.segment_key}`) || null;

      await client.query(
        `
        INSERT INTO program_exercise (
          program_id,
          program_day_id,
          workout_segment_id,
          program_day_key,
          segment_key,
          segment_type,
          exercise_id,
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
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        `,
        [
          program_id,
          program_day_id,
          workout_segment_id,
          ex.program_day_key,
          ex.segment_key,
          ex.segment_type,
          ex.exercise_id,
          ex.order_in_day,
          ex.block_order,
          ex.order_in_block,
          ex.purpose,
          ex.purpose_label,
          ex.sets_prescribed,
          ex.reps_prescribed,
          ex.reps_unit,
          ex.intensity_prescription,
          ex.tempo,
          ex.rest_seconds,
          ex.notes,
        ]
      );
    }

    await client.query("COMMIT");

    return res.json({
      ok: true,
      program_id,
      counts: {
        weeks: parsed.weeks.length,
        days: parsed.days.length,
        segments: parsed.segs.length,
        exercises: parsed.exs.length,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  } finally {
    client.release();
  }
});