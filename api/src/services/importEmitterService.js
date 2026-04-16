// api/src/services/importEmitterService.js
import { createHash } from "node:crypto";
import logger from "../utils/logger.js";
import { programCalendarDayHasUserIdColumn } from "./programCalendarDaySchema.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPECTED_COLS = {
  PRG: 9,
  WEEK: 4,
  DAY: 14,
  SEG: 20,
  EX: 26,
};

export class ValidationError extends Error {
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

function utcDateFromMs(ms) {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function floorUtcDayMs(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function splitRow(line) {
  return String(line).split("|");
}

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function hashImportPayload(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function parseEmitterRows(rows) {
  const parsed = {
    prg: null,
    weeks: [],
    days: [],
    segs: [],
    exs: [],
  };

  for (let i = 0; i < rows.length; i += 1) {
    const line = rows[i];
    if (line == null || String(line).trim() === "") continue;

    const cols = splitRow(line);
    const rowType = s(cols[0]).toUpperCase();

    if (!EXPECTED_COLS[rowType]) {
      throw new ValidationError(`Unknown emitter row type '${rowType}' at row ${i + 1}`);
    }

    if (cols.length !== EXPECTED_COLS[rowType]) {
      throw new ValidationError(
        `${rowType} row ${i + 1} expected ${EXPECTED_COLS[rowType]} columns, got ${cols.length}`,
      );
    }

    if (rowType === "PRG") {
      if (parsed.prg) {
        throw new ValidationError("Multiple PRG rows found; exactly one PRG row is required");
      }
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
      continue;
    }

    if (rowType === "WEEK") {
      parsed.weeks.push({
        week_number: toInt(cols[1], 0),
        focus: s(cols[2]),
        notes: s(cols[3]),
      });
      continue;
    }

    if (rowType === "DAY") {
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
      continue;
    }

    if (rowType === "SEG") {
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
        program_day_key: s(cols[18]),
        post_segment_rest_sec: toInt(cols[19], 0),
      });
      continue;
    }

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
      segment_key: s(cols[17]),
      segment_type: s(cols[18]),
      program_day_key: s(cols[25]),
    });
  }

  if (!parsed.prg) {
    throw new ValidationError("No PRG row found in emitter rows");
  }

  return parsed;
}

function validateParsed(parsed, { requireTitleSummary = true } = {}) {
  const errors = [];
  const { prg, weeks, days, segs, exs } = parsed;

  if (requireTitleSummary) {
    if (!prg.program_title) errors.push("PRG.program_title is required");
    if (!prg.program_summary) errors.push("PRG.program_summary is required");
  }
  if (!Number.isInteger(prg.weeks_count) || prg.weeks_count < 1) errors.push("PRG.weeks_count must be >= 1");
  if (!Number.isInteger(prg.days_per_week) || prg.days_per_week < 1 || prg.days_per_week > 7) {
    errors.push("PRG.days_per_week must be between 1 and 7");
  }
  if (!prg.start_weekday) errors.push("PRG.start_weekday is required");
  if (!Array.isArray(prg.preferred_days_sorted_json)) {
    errors.push("PRG.preferred_days_sorted_json must be a JSON array");
  }
  if (!isPlainObject(prg.program_outline_json)) {
    errors.push("PRG.program_outline_json must be a JSON object");
  }

  if (!weeks.length) errors.push("At least one WEEK row is required");
  if (!days.length) errors.push("At least one DAY row is required");

  const weekNumbers = new Set();
  for (const w of weeks) {
    if (!Number.isInteger(w.week_number) || w.week_number < 1) {
      errors.push(`Invalid WEEK.week_number=${w.week_number}`);
      continue;
    }
    if (weekNumbers.has(w.week_number)) {
      errors.push(`Duplicate WEEK.week_number=${w.week_number}`);
    }
    weekNumbers.add(w.week_number);
  }

  const dayKeySet = new Set();
  const dayByWeekAndNumber = new Set();
  const globalDaySet = new Set();

  for (const d of days) {
    if (!weekNumbers.has(d.week_number)) {
      errors.push(`DAY references missing week_number=${d.week_number}`);
    }
    if (!Number.isInteger(d.day_number) || d.day_number < 1 || d.day_number > 7) {
      errors.push(`Invalid DAY.day_number=${d.day_number}`);
    }
    if (!Number.isInteger(d.global_day_index) || d.global_day_index < 1) {
      errors.push(`Invalid DAY.global_day_index=${d.global_day_index}`);
    }
    if (!d.program_day_key) {
      errors.push("DAY.program_day_key is required");
    } else if (dayKeySet.has(d.program_day_key)) {
      errors.push(`Duplicate DAY.program_day_key=${d.program_day_key}`);
    } else {
      dayKeySet.add(d.program_day_key);
    }

    const wkDayKey = `${d.week_number}::${d.day_number}`;
    if (dayByWeekAndNumber.has(wkDayKey)) {
      errors.push(`Duplicate DAY week/day pair ${wkDayKey}`);
    }
    dayByWeekAndNumber.add(wkDayKey);

    if (globalDaySet.has(d.global_day_index)) {
      errors.push(`Duplicate DAY.global_day_index=${d.global_day_index}`);
    }
    globalDaySet.add(d.global_day_index);

    if (!d.scheduled_weekday) {
      errors.push(`DAY.scheduled_weekday required for ${d.program_day_key || wkDayKey}`);
    }
  }

  const segByDayAndKey = new Set();
  const segByDayOrder = new Set();
  for (const seg of segs) {
    if (!dayKeySet.has(seg.program_day_key)) {
      errors.push(`SEG references missing DAY.program_day_key=${seg.program_day_key}`);
    }
    if (!seg.segment_key) errors.push(`SEG.segment_key missing on day=${seg.program_day_key}`);
    if (!seg.block_key) errors.push(`SEG.block_key missing on day=${seg.program_day_key}`);
    if (!seg.segment_type) errors.push(`SEG.segment_type missing on day=${seg.program_day_key}`);
    if (!seg.purpose) errors.push(`SEG.purpose missing on day=${seg.program_day_key}`);
    if (!Number.isInteger(seg.rounds) || seg.rounds < 1) {
      errors.push(`SEG.rounds must be >= 1 for day=${seg.program_day_key}, segment=${seg.segment_key}`);
    }

    const daySeg = `${seg.program_day_key}::${seg.segment_key}`;
    if (segByDayAndKey.has(daySeg)) {
      errors.push(`Duplicate SEG key ${daySeg}`);
    }
    segByDayAndKey.add(daySeg);

    const dayOrder = `${seg.program_day_key}::${seg.block_order}::${seg.segment_order_in_block}`;
    if (segByDayOrder.has(dayOrder)) {
      errors.push(`Duplicate SEG ordering ${dayOrder}`);
    }
    segByDayOrder.add(dayOrder);
  }

  const exByDayOrder = new Set();
  const exBySegmentOrderAndExercise = new Set();
  for (const ex of exs) {
    if (!dayKeySet.has(ex.program_day_key)) {
      errors.push(`EX references missing DAY.program_day_key=${ex.program_day_key}`);
    }
    if (!ex.exercise_id) errors.push(`EX.exercise_id missing on day=${ex.program_day_key}`);
    if (!ex.segment_key) errors.push(`EX.segment_key missing on day=${ex.program_day_key}`);
    if (!ex.segment_type) errors.push(`EX.segment_type missing on day=${ex.program_day_key}`);
    if (!ex.purpose) errors.push(`EX.purpose missing on day=${ex.program_day_key}`);
    if (!Number.isInteger(ex.order_in_day) || ex.order_in_day < 1) {
      errors.push(`EX.order_in_day must be >= 1 for exercise=${ex.exercise_id}`);
    }
    if (!Number.isInteger(ex.block_order) || ex.block_order < 1) {
      errors.push(`EX.block_order must be >= 1 for exercise=${ex.exercise_id}`);
    }
    if (!Number.isInteger(ex.order_in_block) || ex.order_in_block < 1) {
      errors.push(`EX.order_in_block must be >= 1 for exercise=${ex.exercise_id}`);
    }
    if (!Number.isInteger(ex.sets_prescribed) || ex.sets_prescribed < 0) {
      errors.push(`EX.sets_prescribed must be >= 0 for exercise=${ex.exercise_id}`);
    }
    if (!Number.isInteger(ex.rest_seconds) || ex.rest_seconds < 0) {
      errors.push(`EX.rest_seconds must be >= 0 for exercise=${ex.exercise_id}`);
    }

    const dayOrder = `${ex.program_day_key}::${ex.order_in_day}`;
    if (exByDayOrder.has(dayOrder)) {
      errors.push(`Duplicate EX order_in_day ${dayOrder}`);
    }
    exByDayOrder.add(dayOrder);

    const segOrderEx = `${ex.program_day_key}::${ex.segment_key}::${ex.order_in_block}::${ex.exercise_id}`;
    if (exBySegmentOrderAndExercise.has(segOrderEx)) {
      errors.push(`Duplicate EX key ${segOrderEx}`);
    }
    exBySegmentOrderAndExercise.add(segOrderEx);

    const segRef = `${ex.program_day_key}::${ex.segment_key}`;
    if (!segByDayAndKey.has(segRef)) {
      errors.push(`EX references missing SEG ${segRef}`);
    }
  }

  if (errors.length) {
    throw new ValidationError("Emitter validation failed", errors);
  }
}

function getRowsFromPayload(payload) {
  const directRows = payload?.rows;
  if (Array.isArray(directRows)) return directRows;

  if (typeof payload?.emitter_output === "string") {
    return payload.emitter_output.split(/\r?\n/).filter(Boolean);
  }

  return null;
}

export async function importEmitterPayload({ poolOrClient, payload, request_id }) {
  const user_id = s(payload?.user_id);
  const anchor_date_ms = payload?.anchor_date_ms;
  const rows = getRowsFromPayload(payload);
  const existing_program_id = s(payload?.program_id) || null;

  if (!user_id) {
    throw new ValidationError("Missing user_id");
  }
  if (!Number.isFinite(Number(anchor_date_ms))) {
    throw new ValidationError("Missing anchor_date_ms");
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ValidationError("Missing rows[]");
  }

  const anchorDayMs = floorUtcDayMs(Number(anchor_date_ms));
  const parsed = parseEmitterRows(rows);
  validateParsed(parsed, { requireTitleSummary: !existing_program_id });

  const prg = parsed.prg;
  const programStartMs = anchorDayMs + prg.start_offset_days * DAY_MS;
  const start_date = utcDateFromMs(programStartMs);

  const import_signature = hashImportPayload({
    user_id,
    anchor_day_ms: anchorDayMs,
    prg: parsed.prg,
    weeks: parsed.weeks,
    days: parsed.days,
    segs: parsed.segs,
    exs: parsed.exs,
  });

  const dayKeys = parsed.days.map((d) => d.program_day_key);
  const counts = {
    weeks: parsed.weeks.length,
    days: parsed.days.length,
    segments: parsed.segs.length,
    exercises: parsed.exs.length,
  };

  const startedAt = Date.now();
  const isPoolClient = poolOrClient && typeof poolOrClient.release === "function";
  const isPool = poolOrClient && typeof poolOrClient.connect === "function" && !isPoolClient;

  const client = isPool ? await poolOrClient.connect() : poolOrClient;
  const ownClient = isPool;
  if (!client || typeof client.query !== "function") {
    throw new Error("importEmitterPayload requires a pg Pool or pg Client");
  }
  const hasProgramCalendarDayUserId = await programCalendarDayHasUserIdColumn(client);

  try {
    logger.info({ event: "import_emitter.started",
      request_id,
      user_id,
      rows_count: rows.length,
      counts,
    });

    await client.query("BEGIN");

    // Advisory lock keyed by program_id in attach mode, otherwise by content hash.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [
      existing_program_id ?? import_signature,
    ]);

    let program_id;

    if (existing_program_id) {
      // Attach mode: program was pre-created by caller. Skip INSERT program.
      // Idempotency: if weeks already exist this payload was already imported.
      const weekCheck = await client.query(
        `SELECT COUNT(*) AS cnt FROM program_week WHERE program_id = $1`,
        [existing_program_id],
      );
      if (parseInt(weekCheck.rows[0].cnt, 10) > 0) {
        await client.query("COMMIT");

        logger.info({ event: "import_emitter.attach_idempotent",
          request_id,
          user_id,
          program_id: existing_program_id,
          duration_ms: Date.now() - startedAt,
        });

        return { program_id: existing_program_id, counts, idempotent: true };
      }

      program_id = existing_program_id;
    } else {
      // Legacy mode: full content-match idempotency check + INSERT program.
      const idempotentCheck = await client.query(
        `
        SELECT p.id
        FROM program p
        WHERE p.user_id = $1
          AND p.program_title = $2
          AND p.program_summary = $3
          AND p.weeks_count = $4
          AND p.days_per_week = $5
          AND p.program_outline_json = $6::jsonb
          AND p.start_date = $7::date
          AND p.start_offset_days = $8
          AND p.start_weekday = $9
          AND p.preferred_days_sorted_json = $10::jsonb
          AND (SELECT count(*) FROM program_week w WHERE w.program_id = p.id) = $11
          AND (SELECT count(*) FROM program_day d WHERE d.program_id = p.id) = $12
          AND (SELECT count(*) FROM workout_segment s WHERE s.program_id = p.id) = $13
          AND (SELECT count(*) FROM program_exercise e WHERE e.program_id = p.id) = $14
          AND NOT EXISTS (
            SELECT 1
            FROM unnest($15::text[]) AS dk(day_key)
            LEFT JOIN program_day d2
              ON d2.program_id = p.id
             AND d2.program_day_key = dk.day_key
            WHERE d2.id IS NULL
          )
        ORDER BY p.created_at DESC
        LIMIT 1
        `,
        [
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
          parsed.weeks.length,
          parsed.days.length,
          parsed.segs.length,
          parsed.exs.length,
          dayKeys,
        ],
      );

      if (idempotentCheck.rowCount > 0) {
        const existing_id = idempotentCheck.rows[0].id;
        await client.query("COMMIT");

        logger.info({ event: "import_emitter.idempotent_hit",
          request_id,
          user_id,
          program_id: existing_id,
          duration_ms: Date.now() - startedAt,
        });

        return { program_id: existing_id, counts, idempotent: true };
      }

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

      program_id = programResult.rows[0].id;
    }

    const weekIdByNumber = new Map();
    for (const w of parsed.weeks) {
      const r = await client.query(
        `
        INSERT INTO program_week (program_id, week_number, focus, notes)
        VALUES ($1,$2,$3,$4)
        RETURNING id
        `,
        [program_id, w.week_number, w.focus, w.notes],
      );
      weekIdByNumber.set(w.week_number, r.rows[0].id);
    }

    const dayIdByKey = new Map();
    for (const d of parsed.days) {
      const program_week_id = weekIdByNumber.get(d.week_number);
      if (!program_week_id) {
        throw new ValidationError(`No program_week found for DAY week_number=${d.week_number}`);
      }

      const scheduledDateMs = programStartMs + d.scheduled_offset_days * DAY_MS;
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
        ],
      );

      const program_day_id = r.rows[0].id;
      dayIdByKey.set(d.program_day_key, program_day_id);

      if (hasProgramCalendarDayUserId) {
        await client.query(
          `
          INSERT INTO program_calendar_day (
            program_id,
            user_id,
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
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,true,$10)
          `,
          [
            program_id,
            payload.user_id,
            program_week_id,
            program_day_id,
            d.week_number,
            d.scheduled_offset_days,
            d.scheduled_weekday,
            scheduled_date,
            d.global_day_index,
            d.program_day_key,
          ],
        );
      } else {
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
            program_day_id,
            d.week_number,
            d.scheduled_offset_days,
            d.scheduled_weekday,
            scheduled_date,
            d.global_day_index,
            d.program_day_key,
          ],
        );
      }
    }

    const segmentIdByDayAndKey = new Map();
    for (const seg of parsed.segs) {
      const program_day_id = dayIdByKey.get(seg.program_day_key);
      if (!program_day_id) {
        throw new ValidationError(`No program_day found for SEG program_day_key=${seg.program_day_key}`);
      }

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
          segment_duration_mmss,
          post_segment_rest_sec
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,$20)
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
          seg.post_segment_rest_sec,
        ],
      );

      segmentIdByDayAndKey.set(`${seg.program_day_key}::${seg.segment_key}`, r.rows[0].id);
    }

    for (const ex of parsed.exs) {
      const program_day_id = dayIdByKey.get(ex.program_day_key);
      if (!program_day_id) {
        throw new ValidationError(`No program_day found for EX program_day_key=${ex.program_day_key}`);
      }

      const workout_segment_id = segmentIdByDayAndKey.get(`${ex.program_day_key}::${ex.segment_key}`) || null;
      if (!workout_segment_id) {
        throw new ValidationError(
          `No workout_segment found for EX day=${ex.program_day_key}, segment=${ex.segment_key}`,
        );
      }

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
        ],
      );
    }

    // Backfill exercise fields from catalogue in one round-trip.
    await client.query(
      `
      UPDATE program_exercise pe
      SET
        exercise_name = ec.name,
        is_loadable = ec.is_loadable,
        equipment_items_slugs_csv = array_to_string(ec.equipment_items_slugs, ','),
        coaching_cues_json = ec.coaching_cues_json,
        load_hint = coalesce(ec.load_guidance, ''),
        log_prompt = coalesce(ec.logging_guidance, ''),
        notes = ''
      FROM exercise_catalogue ec
      WHERE pe.exercise_id = ec.exercise_id
        AND pe.program_id = $1
      `,
      [program_id],
    );

    await client.query("COMMIT");

    logger.info({ event: "import_emitter.committed",
      request_id,
      user_id,
      program_id,
      duration_ms: Date.now() - startedAt,
    });

    const result = { program_id, counts, idempotent: false };

    if (existing_program_id) {
      // Return parsed PRG fields so caller can UPDATE the pre-created program row.
      result.prg_data = {
        program_title: prg.program_title,
        program_summary: prg.program_summary,
        weeks_count: prg.weeks_count,
        days_per_week: prg.days_per_week,
        program_outline_json: prg.program_outline_json,
        start_date,
        start_offset_days: prg.start_offset_days,
        start_weekday: prg.start_weekday,
        preferred_days_sorted_json: prg.preferred_days_sorted_json,
      };
    }

    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      logger.error({ event: "import_emitter.rollback_failed",
        request_id,
        user_id,
        error: rollbackErr.message,
      });
    }

    throw err;
  } finally {
    if (ownClient) client.release();
  }
}
