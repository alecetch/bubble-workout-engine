import express from "express";
import { pool } from "../db.js";
import { requireInternalToken, requireTrustedAdminOrigin } from "../middleware/auth.js";
import { publicInternalError } from "../utils/publicError.js";
import { auditLog } from "../utils/auditLog.js";
import { safeString } from "../utils/validate.js";

export const adminRepRulesRouter = express.Router();

adminRepRulesRouter.use(requireInternalToken, requireTrustedAdminOrigin);

const PRESCRIPTION_FIELDS = new Set([
  "rep_low",
  "rep_high",
  "reps_unit",
  "time_equivalent_low_sec",
  "time_equivalent_high_sec",
  "rest_after_set_sec",
  "rest_after_round_sec",
  "priority",
  "logging_prompt_mode",
  "notes_style",
  "is_active",
]);

const MATCHING_FIELDS = new Set([
  "segment_type",
  "purpose",
  "movement_pattern",
  "swap_group_id_1",
  "swap_group_id_2",
  "equipment_slug",
]);

const KNOWN_REPS_UNITS = new Set(["reps", "m", "cal", "seconds"]);

const SELECT_COLUMNS = `
  id,
  rule_id,
  program_type,
  schema_version,
  is_active,
  day_type,
  purpose,
  segment_type,
  movement_pattern,
  swap_group_id_1,
  swap_group_id_2,
  equipment_slug,
  rep_low,
  rep_high,
  reps_unit,
  rir_target,
  rir_min,
  rir_max,
  tempo_eccentric,
  tempo_pause_bottom,
  tempo_concentric,
  tempo_pause_top,
  rest_after_set_sec,
  rest_after_round_sec,
  logging_prompt_mode,
  notes_style,
  priority,
  time_equivalent_low_sec,
  time_equivalent_high_sec,
  created_at,
  updated_at
`;

function toNullableText(value) {
  const text = safeString(value);
  return text || null;
}

function toNullableInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseBool(value) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

async function fetchRuleDimensions() {
  const { rows } = await pool.query(`
    SELECT
      COALESCE(array_agg(DISTINCT movement_pattern_primary) FILTER (WHERE movement_pattern_primary IS NOT NULL AND movement_pattern_primary <> ''), '{}') AS movement_patterns,
      COALESCE(array_agg(DISTINCT swap_group_id_1) FILTER (WHERE swap_group_id_1 IS NOT NULL AND swap_group_id_1 <> ''), '{}') AS swap_group_id_1s,
      COALESCE(array_agg(DISTINCT swap_group_id_2) FILTER (WHERE swap_group_id_2 IS NOT NULL AND swap_group_id_2 <> ''), '{}') AS swap_group_id_2s
    FROM public.exercise_catalogue
    WHERE is_archived = FALSE
  `);
  const row = rows?.[0] || {};
  return {
    movement_pattern: (row.movement_patterns || []).map(safeString).filter(Boolean).sort(),
    swap_group_id_1: (row.swap_group_id_1s || []).map(safeString).filter(Boolean).sort(),
    swap_group_id_2: (row.swap_group_id_2s || []).map(safeString).filter(Boolean).sort(),
  };
}

function validateMatchingValue(field, value, validValues) {
  if (value === null || value === undefined || value === "") return null;
  if (validValues.includes(value)) return null;
  return `${field} must be an existing value from exercise_catalogue`;
}

// ── GET /admin/rep-rules ─────────────────────────────────────────────────────

adminRepRulesRouter.get("/rep-rules/rules", async (req, res) => {
  try {
    const where = [];
    const params = [];

    const addParam = (value) => {
      params.push(value);
      return `$${params.length}`;
    };

    const programType = safeString(req.query?.program_type);
    const dayType = safeString(req.query?.day_type);
    const isActiveRaw = safeString(req.query?.is_active).toLowerCase();

    if (programType) where.push(`program_type = ${addParam(programType)}`);

    if (dayType === "__none__") {
      where.push(`day_type IS NULL`);
    } else if (dayType) {
      where.push(`day_type = ${addParam(dayType)}`);
    }

    if (isActiveRaw === "true") where.push(`is_active = ${addParam(true)}`);
    else if (isActiveRaw === "false") where.push(`is_active = ${addParam(false)}`);

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT ${SELECT_COLUMNS}
       FROM public.program_rep_rule
       ${whereClause}
       ORDER BY
         program_type ASC,
         COALESCE(day_type, '') ASC,
         priority DESC NULLS LAST,
         rule_id ASC`,
      params,
    );

    return res.json({ rules: result.rows ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

adminRepRulesRouter.get("/rep-rules/dimensions", async (_req, res) => {
  try {
    const dimensions = await fetchRuleDimensions();
    return res.json({ ok: true, dimensions });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

// ── PATCH /admin/rep-rules/:rule_id ─────────────────────────────────────────

adminRepRulesRouter.patch("/rep-rules/rules/:rule_id", async (req, res) => {
  try {
    const ruleId = safeString(req.params.rule_id);
    if (!ruleId) return res.status(400).json({ ok: false, error: "rule_id is required" });

    // Check rule exists
    const existing = await pool.query(
      `SELECT rule_id FROM public.program_rep_rule WHERE rule_id = $1`,
      [ruleId],
    );
    if (!existing.rows?.length) {
      return res.status(404).json({ ok: false, error: "Rule not found" });
    }

    // Extract only whitelisted fields from body
    const body = req.body ?? {};
    const dimensions = await fetchRuleDimensions();
    const setClauses = [];
    const params = [];

    const addParam = (value) => {
      params.push(value);
      return `$${params.length}`;
    };

    for (const key of [...MATCHING_FIELDS, ...PRESCRIPTION_FIELDS]) {
      if (!(key in body)) continue;

      const rawValue = body[key];

      if (MATCHING_FIELDS.has(key)) {
        const textVal = toNullableText(rawValue);
        if (["movement_pattern", "swap_group_id_1", "swap_group_id_2"].includes(key)) {
          const msg = validateMatchingValue(key, textVal, dimensions[key]);
          if (msg) return res.status(400).json({ ok: false, error: msg });
        }
        setClauses.push(`${key} = ${addParam(textVal)}`);
        continue;
      }

      if (key === "is_active") {
        const boolVal = parseBool(rawValue);
        if (boolVal === null) {
          return res.status(400).json({ ok: false, error: "is_active must be a boolean" });
        }
        setClauses.push(`is_active = ${addParam(boolVal)}`);
        continue;
      }

      if (key === "reps_unit") {
        const unit = safeString(rawValue);
        if (!KNOWN_REPS_UNITS.has(unit)) {
          return res.status(400).json({
            ok: false,
            error: `reps_unit must be one of: ${[...KNOWN_REPS_UNITS].join(", ")}`,
          });
        }
        setClauses.push(`reps_unit = ${addParam(unit)}`);
        continue;
      }

      if (["rep_low", "rep_high", "rest_after_set_sec", "rest_after_round_sec"].includes(key)) {
        const n = toInt(rawValue, null);
        if (n === null || n < 0) {
          return res.status(400).json({ ok: false, error: `${key} must be an integer >= 0` });
        }
        setClauses.push(`${key} = ${addParam(n)}`);
        continue;
      }

      if (["time_equivalent_low_sec", "time_equivalent_high_sec"].includes(key)) {
        const n = toNullableInt(rawValue);
        setClauses.push(`${key} = ${addParam(n)}`);
        continue;
      }

      if (key === "priority") {
        const n = toInt(rawValue, null);
        if (n === null || n < 1) {
          return res.status(400).json({ ok: false, error: "priority must be an integer >= 1" });
        }
        setClauses.push(`priority = ${addParam(n)}`);
        continue;
      }

      // logging_prompt_mode, notes_style — nullable text
      setClauses.push(`${key} = ${addParam(toNullableText(rawValue))}`);
    }

    if (!setClauses.length) {
      return res.status(400).json({ ok: false, error: "No editable fields provided" });
    }

    setClauses.push(`updated_at = now()`);
    params.push(ruleId);

    const result = await pool.query(
      `UPDATE public.program_rep_rule
       SET ${setClauses.join(", ")}
       WHERE rule_id = $${params.length}
       RETURNING ${SELECT_COLUMNS}`,
      params,
    );

    await auditLog(req, {
      action: "update",
      entity: "program_rep_rule",
      entityId: ruleId,
      detail: Object.fromEntries(
        [...MATCHING_FIELDS, ...PRESCRIPTION_FIELDS]
          .filter((k) => k in body)
          .map((k) => [k, body[k]]),
      ),
    });

    return res.json({ ok: true, rule: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

// ── POST /admin/rep-rules ────────────────────────────────────────────────────

adminRepRulesRouter.post("/rep-rules/rules", async (req, res) => {
  try {
    const body = req.body ?? {};

    const ruleId = safeString(body.rule_id);
    if (!ruleId) return res.status(400).json({ ok: false, error: "rule_id is required" });
    if (/\s/.test(ruleId)) return res.status(400).json({ ok: false, error: "rule_id must not contain whitespace" });

    const programType = safeString(body.program_type);
    if (!programType) return res.status(400).json({ ok: false, error: "program_type is required" });

    const dayType = safeString(body.day_type);
    if (!dayType) {
      return res.status(400).json({
        ok: false,
        error: "day_type is required for new rules (base rules must be added via seed migration)",
      });
    }

    const repLow = toNullableInt(body.rep_low);
    if (repLow === null || repLow < 0) {
      return res.status(400).json({ ok: false, error: "rep_low must be an integer >= 0" });
    }

    const repHigh = toNullableInt(body.rep_high);
    if (repHigh === null || repHigh < 0) {
      return res.status(400).json({ ok: false, error: "rep_high must be an integer >= 0" });
    }

    const timeEquivalentLowSec = toNullableInt(body.time_equivalent_low_sec);
    if (timeEquivalentLowSec !== null && timeEquivalentLowSec < 0) {
      return res.status(400).json({ ok: false, error: "time_equivalent_low_sec must be an integer >= 0" });
    }

    const timeEquivalentHighSec = toNullableInt(body.time_equivalent_high_sec);
    if (timeEquivalentHighSec !== null && timeEquivalentHighSec < 0) {
      return res.status(400).json({ ok: false, error: "time_equivalent_high_sec must be an integer >= 0" });
    }

    const repsUnit = safeString(body.reps_unit);
    if (!KNOWN_REPS_UNITS.has(repsUnit)) {
      return res.status(400).json({
        ok: false,
        error: `reps_unit must be one of: ${[...KNOWN_REPS_UNITS].join(", ")}`,
      });
    }

    const priority = body.priority !== undefined ? toInt(body.priority, null) : 100;
    if (priority === null || priority < 1) {
      return res.status(400).json({ ok: false, error: "priority must be an integer >= 1" });
    }

    const dimensions = await fetchRuleDimensions();
    const movementPattern = toNullableText(body.movement_pattern);
    const swapGroupId1 = toNullableText(body.swap_group_id_1);
    const swapGroupId2 = toNullableText(body.swap_group_id_2);
    for (const [field, value] of [
      ["movement_pattern", movementPattern],
      ["swap_group_id_1", swapGroupId1],
      ["swap_group_id_2", swapGroupId2],
    ]) {
      const msg = validateMatchingValue(field, value, dimensions[field]);
      if (msg) return res.status(400).json({ ok: false, error: msg });
    }

    // Check for duplicate rule_id
    const existing = await pool.query(
      `SELECT rule_id FROM public.program_rep_rule WHERE rule_id = $1`,
      [ruleId],
    );
    if (existing.rows?.length) {
      return res.status(409).json({ ok: false, error: "rule_id already exists" });
    }

    const result = await pool.query(
      `INSERT INTO public.program_rep_rule (
        rule_id,
        program_type,
        schema_version,
        is_active,
        day_type,
        purpose,
        segment_type,
        movement_pattern,
        swap_group_id_1,
        swap_group_id_2,
        equipment_slug,
        rep_low,
        rep_high,
        reps_unit,
        time_equivalent_low_sec,
        time_equivalent_high_sec,
        rir_min,
        rir_max,
        rir_target,
        rest_after_set_sec,
        rest_after_round_sec,
        logging_prompt_mode,
        notes_style,
        priority
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
      RETURNING ${SELECT_COLUMNS}`,
      [
        ruleId,
        programType,
        toInt(body.schema_version, 1),
        parseBool(body.is_active) ?? true,
        dayType,
        toNullableText(body.purpose),
        toNullableText(body.segment_type),
        movementPattern,
        swapGroupId1,
        swapGroupId2,
        toNullableText(body.equipment_slug),
        repLow,
        repHigh,
        repsUnit,
        timeEquivalentLowSec,
        timeEquivalentHighSec,
        toNullableInt(body.rir_min),
        toNullableInt(body.rir_max),
        toNullableInt(body.rir_target),
        toInt(body.rest_after_set_sec, 0),
        toInt(body.rest_after_round_sec, 0),
        toNullableText(body.logging_prompt_mode),
        toNullableText(body.notes_style),
        priority,
      ],
    );

    await auditLog(req, {
      action: "create",
      entity: "program_rep_rule",
      entityId: ruleId,
      detail: { program_type: programType, day_type: dayType, rep_low: repLow, rep_high: repHigh, reps_unit: repsUnit },
    });

    return res.json({ ok: true, rule: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});
