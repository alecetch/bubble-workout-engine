import express from "express";
import { pool } from "../db.js";
import { requireInternalToken } from "../middleware/auth.js";
import { publicInternalError } from "../utils/publicError.js";
import { safeString, clampInt } from "../utils/validate.js";

export const adminObservabilityRouter = express.Router();

adminObservabilityRouter.use(requireInternalToken);

const VALID_STATUSES = new Set(["started", "pipeline", "importing", "complete", "failed"]);
const VALID_PROGRAM_TYPES = new Set(["hypertrophy", "strength", "conditioning", "hyrox"]);

function asNullableEnum(value, validValues) {
  const text = safeString(value);
  return validValues.has(text) ? text : null;
}

function toIsoDateUtc(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function fillDailyCounts(days, rows) {
  const byDate = new Map(
    (rows ?? []).map((row) => [
      toIsoDateUtc(row.date),
      {
        date: toIsoDateUtc(row.date),
        count: Number(row.count ?? 0),
        success_count: Number(row.success_count ?? 0),
      },
    ]),
  );

  const out = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push(byDate.get(key) ?? { date: key, count: 0, success_count: 0 });
  }
  return out;
}

adminObservabilityRouter.get("/summary", async (req, res) => {
  const days = clampInt(req.query?.days, { defaultValue: 30, min: 1, max: 365 });

  try {
    const [summaryResult, dailyResult, errorsResult] = await Promise.all([
      pool.query(
        `
        SELECT
          COUNT(*)::int AS runs_total,
          COUNT(*) FILTER (WHERE status = 'complete')::int AS runs_success,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS runs_failed,
          AVG(
            CASE
              WHEN status = 'complete' AND completed_at IS NOT NULL AND started_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (completed_at - started_at))
              ELSE NULL
            END
          ) AS mean_duration_s
        FROM generation_run
        WHERE created_at > now() - ($1 * interval '1 day')
        `,
        [days],
      ),
      pool.query(
        `
        SELECT
          DATE(completed_at AT TIME ZONE 'UTC') AS date,
          COUNT(*)::int AS count,
          COUNT(*) FILTER (WHERE status = 'complete')::int AS success_count
        FROM generation_run
        WHERE completed_at IS NOT NULL
          AND completed_at > now() - ($1 * interval '1 day')
        GROUP BY 1
        ORDER BY 1 ASC
        `,
        [days],
      ),
      pool.query(
        `
        SELECT
          error_message AS message,
          COUNT(*)::int AS count
        FROM generation_run
        WHERE status = 'failed'
          AND created_at > now() - ($1 * interval '1 day')
          AND error_message IS NOT NULL
          AND btrim(error_message) <> ''
        GROUP BY error_message
        ORDER BY count DESC, error_message ASC
        LIMIT 5
        `,
        [days],
      ),
    ]);

    const summary = summaryResult.rows[0] ?? {};
    const runsTotal = Number(summary.runs_total ?? 0);
    const runsSuccess = Number(summary.runs_success ?? 0);
    const runsFailed = Number(summary.runs_failed ?? 0);
    const successRate = runsTotal > 0 ? Number(((runsSuccess / runsTotal) * 100).toFixed(1)) : 0;
    const meanDuration = summary.mean_duration_s == null ? null : Number(Number(summary.mean_duration_s).toFixed(1));

    return res.json({
      runs_total: runsTotal,
      runs_success: runsSuccess,
      runs_failed: runsFailed,
      success_rate: successRate,
      mean_duration_s: meanDuration,
      daily_counts: fillDailyCounts(days, dailyResult.rows),
      top_errors: (errorsResult.rows ?? []).map((row) => ({
        message: row.message,
        count: Number(row.count ?? 0),
      })),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

adminObservabilityRouter.get("/runs", async (req, res) => {
  const limit = clampInt(req.query?.limit, { defaultValue: 50, min: 1, max: 200 });
  const offset = clampInt(req.query?.offset, { defaultValue: 0, min: 0, max: 100000 });
  const status = asNullableEnum(req.query?.status, VALID_STATUSES);
  const programType = asNullableEnum(req.query?.program_type, VALID_PROGRAM_TYPES);

  const params = [];
  const where = [];

  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (programType) {
    params.push(programType);
    where.push(`program_type = $${params.length}`);
  }

  params.push(limit);
  const limitParam = params.length;
  params.push(offset);
  const offsetParam = params.length;

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const result = await pool.query(
      `
      SELECT
        id,
        program_id,
        status,
        last_stage,
        program_type,
        config_key,
        step1_stats_json->>'equipment_profile' AS equipment_profile,
        fitness_rank,
        duration_mins,
        days_per_week,
        allowed_exercise_count,
        total_days_expected,
        emitter_rows_count,
        COALESCE((step1_stats_json->>'fill_failed')::int, 0) AS fill_failed,
        completed_at,
        error_message,
        COUNT(*) OVER()::int AS total_count
      FROM generation_run
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${limitParam}
      OFFSET $${offsetParam}
      `,
      params,
    );

    const rows = result.rows ?? [];
    const total = rows[0] ? Number(rows[0].total_count ?? 0) : 0;

    return res.json({
      rows: rows.map((row) => ({
        id: row.id,
        program_id: row.program_id,
        status: row.status,
        last_stage: row.last_stage,
        program_type: row.program_type,
        config_key: row.config_key,
        equipment_profile: row.equipment_profile,
        fitness_rank: row.fitness_rank == null ? null : Number(row.fitness_rank),
        duration_mins: row.duration_mins == null ? null : Number(row.duration_mins),
        days_per_week: row.days_per_week == null ? null : Number(row.days_per_week),
        allowed_exercise_count: row.allowed_exercise_count == null ? null : Number(row.allowed_exercise_count),
        total_days_expected: row.total_days_expected == null ? null : Number(row.total_days_expected),
        emitter_rows_count: row.emitter_rows_count == null ? null : Number(row.emitter_rows_count),
        fill_failed: row.fill_failed == null ? null : Number(row.fill_failed),
        completed_at: row.completed_at,
        error_message: row.error_message,
      })),
      total,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

adminObservabilityRouter.get("/run/:id", async (req, res) => {
  const id = safeString(req.params?.id);
  if (!id) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  try {
    const result = await pool.query(`SELECT * FROM generation_run WHERE id = $1`, [id]);
    const row = result.rows[0] ?? null;
    if (!row) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

adminObservabilityRouter.get("/fill-quality", async (req, res) => {
  const days = clampInt(req.query?.days, { defaultValue: 30, min: 1, max: 365 });

  try {
    const result = await pool.query(
      `
      SELECT
        config_key,
        step1_stats_json->>'equipment_profile' AS equipment_profile,
        COUNT(*)::int AS run_count,
        SUM(COALESCE((step1_stats_json->>'picked_sw2_pref')::int,  0)) AS picked_sw2_pref,
        SUM(COALESCE((step1_stats_json->>'picked_sw_pref')::int,   0)) AS picked_sw_pref,
        SUM(COALESCE((step1_stats_json->>'picked_mp_pref')::int,   0)) AS picked_mp_pref,
        SUM(COALESCE((step1_stats_json->>'picked_sw2_relaxed')::int,0)) AS picked_sw2_relaxed,
        SUM(COALESCE((step1_stats_json->>'picked_sw_relaxed')::int, 0)) AS picked_sw_relaxed,
        SUM(COALESCE((step1_stats_json->>'picked_mp_relaxed')::int, 0)) AS picked_mp_relaxed,
        SUM(COALESCE((step1_stats_json->>'picked_allow_dup')::int,  0)) AS picked_allow_dup,
        SUM(COALESCE((step1_stats_json->>'fill_failed')::int,       0)) AS fill_failed
      FROM generation_run
      WHERE status = 'complete'
        AND step1_stats_json IS NOT NULL
        AND completed_at > now() - ($1 * interval '1 day')
      GROUP BY 1, 2
      ORDER BY 1, 2
      `,
      [days],
    );

    return res.json({
      rows: (result.rows ?? []).map((row) => {
        const pickedSw2Pref = Number(row.picked_sw2_pref ?? 0);
        const pickedSwPref = Number(row.picked_sw_pref ?? 0);
        const pickedMpPref = Number(row.picked_mp_pref ?? 0);
        const pickedSw2Relaxed = Number(row.picked_sw2_relaxed ?? 0);
        const pickedSwRelaxed = Number(row.picked_sw_relaxed ?? 0);
        const pickedMpRelaxed = Number(row.picked_mp_relaxed ?? 0);
        const pickedAllowDup = Number(row.picked_allow_dup ?? 0);
        const fillFailed = Number(row.fill_failed ?? 0);
        const totalPicks =
          pickedSw2Pref +
          pickedSwPref +
          pickedMpPref +
          pickedSw2Relaxed +
          pickedSwRelaxed +
          pickedMpRelaxed +
          pickedAllowDup;
        const failRatePct = totalPicks > 0 ? Number(((fillFailed / totalPicks) * 100).toFixed(1)) : 0;

        return {
          config_key: row.config_key,
          equipment_profile: row.equipment_profile,
          run_count: Number(row.run_count ?? 0),
          picked_sw2_pref: pickedSw2Pref,
          picked_sw_pref: pickedSwPref,
          picked_mp_pref: pickedMpPref,
          picked_sw2_relaxed: pickedSw2Relaxed,
          picked_sw_relaxed: pickedSwRelaxed,
          picked_mp_relaxed: pickedMpRelaxed,
          picked_allow_dup: pickedAllowDup,
          fill_failed: fillFailed,
          total_picks: totalPicks,
          fail_rate_pct: failRatePct,
        };
      }),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

adminObservabilityRouter.get("/exercise-frequency", async (req, res) => {
  const days = clampInt(req.query?.days, { defaultValue: 30, min: 1, max: 365 });
  const limit = clampInt(req.query?.limit, { defaultValue: 20, min: 1, max: 200 });

  try {
    const [topUsedResult, neverUsedResult] = await Promise.all([
      pool.query(
        `
        SELECT pe.exercise_id,
               ec.name,
               ec.movement_class,
               COUNT(*)::int AS count
        FROM program_exercise pe
        JOIN exercise_catalogue ec ON ec.exercise_id = pe.exercise_id
        JOIN program p ON p.id = pe.program_id
        WHERE p.created_at > now() - ($1 * interval '1 day')
        GROUP BY pe.exercise_id, ec.name, ec.movement_class
        ORDER BY count DESC, pe.exercise_id ASC
        LIMIT $2
        `,
        [days, limit],
      ),
      pool.query(
        `
        SELECT ec.exercise_id, ec.name, ec.movement_class
        FROM exercise_catalogue ec
        WHERE ec.is_archived = false
          AND ec.exercise_id NOT IN (
            SELECT DISTINCT pe.exercise_id
            FROM program_exercise pe
            JOIN program p ON p.id = pe.program_id
            WHERE p.created_at > now() - ($1 * interval '1 day')
          )
        ORDER BY ec.movement_class, ec.name
        `,
        [days],
      ),
    ]);

    return res.json({
      top_used: (topUsedResult.rows ?? []).map((row) => ({
        exercise_id: row.exercise_id,
        name: row.name,
        movement_class: row.movement_class,
        count: Number(row.count ?? 0),
      })),
      never_used: (neverUsedResult.rows ?? []).map((row) => ({
        exercise_id: row.exercise_id,
        name: row.name,
        movement_class: row.movement_class,
      })),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

adminObservabilityRouter.get("/config-hits", async (req, res) => {
  const days = clampInt(req.query?.days, { defaultValue: 30, min: 1, max: 365 });

  try {
    const result = await pool.query(
      `
      SELECT
        config_key,
        COUNT(*)::int AS run_count,
        MAX(completed_at) AS last_seen_at
      FROM generation_run
      WHERE completed_at > now() - ($1 * interval '1 day')
        AND config_key IS NOT NULL
      GROUP BY 1
      ORDER BY 1
      `,
      [days],
    );

    const rows = result.rows ?? [];
    const totalRuns = rows.reduce((sum, row) => sum + Number(row.run_count ?? 0), 0);
    const now = Date.now();

    return res.json({
      rows: rows.map((row) => {
        const runCount = Number(row.run_count ?? 0);
        const lastSeenAt = row.last_seen_at;
        const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : null;
        const daysSinceLastSeen =
          Number.isFinite(lastSeenMs) && lastSeenMs != null
            ? Math.floor((now - lastSeenMs) / 86400000)
            : null;

        return {
          config_key: row.config_key,
          run_count: runCount,
          last_seen_at: lastSeenAt,
          pct_of_total: totalRuns > 0 ? Number(((runCount / totalRuns) * 100).toFixed(1)) : 0,
          days_since_last_seen: daysSinceLastSeen,
        };
      }),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

adminObservabilityRouter.get("/narration-adoption", async (req, res) => {
  const days = clampInt(req.query?.days, { defaultValue: 30, min: 1, max: 365 });

  try {
    const result = await pool.query(
      `
      SELECT
        config_key,
        COUNT(*)::int AS run_count,
        AVG((step5_debug_json->>'templates_in')::numeric) AS templates_in_avg,
        SUM(COALESCE((step5_debug_json->'adoption'->'template'->>'warmup_segment_added_days')::int, 0)) AS warmup_segment_added_days_total,
        SUM(COALESCE((step5_debug_json->'adoption'->'template'->>'cooldown_segment_added_days')::int, 0)) AS cooldown_segment_added_days_total,
        SUM(COALESCE((step5_debug_json->'adoption'->'template'->>'used_item_reps_prescribed')::int, 0)) AS used_item_reps_prescribed_total,
        SUM(COALESCE((step5_debug_json->'adoption'->'template'->>'used_item_rir_target')::int, 0)) AS used_item_rir_target_total,
        SUM(COALESCE((step5_debug_json->'adoption'->'template'->>'used_item_tempo_prescribed')::int, 0)) AS used_item_tempo_prescribed_total
      FROM generation_run
      WHERE status = 'complete'
        AND step5_debug_json IS NOT NULL
        AND completed_at > now() - ($1 * interval '1 day')
      GROUP BY 1
      ORDER BY 1
      `,
      [days],
    );

    return res.json({
      rows: (result.rows ?? []).map((row) => ({
        config_key: row.config_key,
        run_count: Number(row.run_count ?? 0),
        templates_in_avg: row.templates_in_avg == null ? null : Number(Number(row.templates_in_avg).toFixed(1)),
        warmup_segment_added_days_total: Number(row.warmup_segment_added_days_total ?? 0),
        cooldown_segment_added_days_total: Number(row.cooldown_segment_added_days_total ?? 0),
        used_item_reps_prescribed_total: Number(row.used_item_reps_prescribed_total ?? 0),
        used_item_rir_target_total: Number(row.used_item_rir_target_total ?? 0),
        used_item_tempo_prescribed_total: Number(row.used_item_tempo_prescribed_total ?? 0),
      })),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});
