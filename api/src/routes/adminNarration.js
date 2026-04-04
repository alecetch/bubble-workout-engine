import express from "express";
import { pool } from "../db.js";
import { requireInternalToken, requireTrustedAdminOrigin } from "../middleware/auth.js";
import { publicInternalError } from "../utils/publicError.js";
import { auditLog } from "../utils/auditLog.js";
import { safeString } from "../utils/validate.js";

export const adminNarrationRouter = express.Router();

adminNarrationRouter.use(requireInternalToken, requireTrustedAdminOrigin);

const VALID_SCOPES = new Set(["program", "week", "day", "segment", "transition", "exercise"]);
const VALID_FIELDS = new Set([
  "PROGRAM_TITLE", "PROGRAM_SUMMARY", "PROGRESSION_BLURB", "SAFETY_BLURB",
  "WEEK_TITLE", "WEEK_FOCUS", "WEEK_NOTES",
  "DAY_TITLE", "DAY_GOAL", "TIME_BUDGET_HINT",
  "WARMUP_TITLE", "WARMUP_GENERAL_HEAT", "RAMP_SETS_TEXT",
  "SEGMENT_TITLE", "SEGMENT_EXECUTION", "SEGMENT_INTENT",
  "SETUP_NOTE", "TRANSITION_NOTE", "PACE_NOTE",
  "EXERCISE_LINE", "CUE_LINE", "LOAD_HINT", "LOGGING_PROMPT",
]);
const VALID_PURPOSES = new Set(["main", "secondary", "accessory"]);
const VALID_SEGMENT_TYPES = new Set(["single", "superset", "giant_set", "amrap", "emom"]);
const VALID_PROGRAM_TYPES = new Set(["hypertrophy", "strength", "hyrox", "conditioning"]);
const VALID_PHASES = new Set(["BASELINE", "BUILD", "PEAK", "CONSOLIDATE", "DELOAD"]);

const STATIC_EXPECTED_COMBOS = [
  { scope: "program", field: "PROGRAM_TITLE", purpose: null, segment_type: null },
  { scope: "program", field: "PROGRAM_SUMMARY", purpose: null, segment_type: null },
  { scope: "program", field: "PROGRESSION_BLURB", purpose: null, segment_type: null },
  { scope: "program", field: "SAFETY_BLURB", purpose: null, segment_type: null },
  { scope: "week", field: "WEEK_TITLE", purpose: null, segment_type: null },
  { scope: "week", field: "WEEK_FOCUS", purpose: null, segment_type: null },
  { scope: "week", field: "WEEK_NOTES", purpose: null, segment_type: null },
  { scope: "day", field: "DAY_TITLE", purpose: null, segment_type: null },
  { scope: "day", field: "DAY_GOAL", purpose: null, segment_type: null },
  { scope: "day", field: "TIME_BUDGET_HINT", purpose: null, segment_type: null },
  { scope: "day", field: "WARMUP_TITLE", purpose: null, segment_type: null },
  { scope: "day", field: "WARMUP_GENERAL_HEAT", purpose: null, segment_type: null },
  { scope: "day", field: "RAMP_SETS_TEXT", purpose: null, segment_type: null },
  { scope: "transition", field: "PACE_NOTE", purpose: null, segment_type: null },
  { scope: "exercise", field: "CUE_LINE", purpose: null, segment_type: null },
  { scope: "exercise", field: "LOAD_HINT", purpose: null, segment_type: null },
  { scope: "exercise", field: "LOGGING_PROMPT", purpose: null, segment_type: null },
];

function toNullableText(value) {
  const text = safeString(value);
  return text || null;
}

function normalizeFocusValue(value) {
  const text = safeString(value).trim().toLowerCase();
  return text || null;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJsonObjectInput(value) {
  if (value == null || value === "") return { value: null };
  if (isPlainObject(value)) return { value };
  if (typeof value !== "string") return { error: "applies_json must be an object or null" };
  try {
    const parsed = JSON.parse(value);
    if (parsed === null) return { value: null };
    if (!isPlainObject(parsed)) return { error: "applies_json must be an object or null" };
    return { value: parsed };
  } catch {
    return { error: "applies_json must be valid JSON" };
  }
}

function parseTextPoolInput(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return { error: "text_pool_json must be valid JSON" };
    }
  }
  if (!Array.isArray(parsed)) {
    return { error: "text_pool_json must be a JSON array of non-empty strings" };
  }
  const normalized = parsed.map((item) => safeString(item)).filter(Boolean);
  if (normalized.length === 0) {
    return { error: "text_pool_json must contain at least one non-empty string" };
  }
  return normalized;
}

function parsePriority(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 1) return parsed;
  }
  return null;
}

export function validateTemplatePayload(body, { requireTemplateId }) {
  const templateId = safeString(body?.template_id);
  const scope = safeString(body?.scope);
  const field = safeString(body?.field);
  const purpose = toNullableText(body?.purpose);
  const segmentType = toNullableText(body?.segment_type);
  const priority = parsePriority(body?.priority);
  const isActive = typeof body?.is_active === "boolean" ? body.is_active : true;

  if (requireTemplateId) {
    if (!templateId) return { error: "template_id is required" };
    if (/\s/.test(templateId)) return { error: "template_id must not contain whitespace" };
  }

  if (!VALID_SCOPES.has(scope)) {
    return { error: "scope must be one of program, week, day, segment, transition, exercise" };
  }

  if (!VALID_FIELDS.has(field)) {
    return { error: `field must be one of: ${[...VALID_FIELDS].sort().join(", ")}` };
  }
  if (purpose && !VALID_PURPOSES.has(purpose)) {
    return { error: "purpose must be one of main, secondary, accessory" };
  }
  if (segmentType && !VALID_SEGMENT_TYPES.has(segmentType)) {
    return { error: "segment_type must be one of single, superset, giant_set, amrap, emom" };
  }
  if (priority == null) return { error: "priority must be an integer >= 1" };

  const textPool = parseTextPoolInput(body?.text_pool_json);
  if (textPool?.error) return textPool;

  const applies = parseJsonObjectInput(body?.applies_json);
  if (applies.error) return applies;
  if (applies.value) {
    if (typeof applies.value.program_type === "string") {
      applies.value.program_type = applies.value.program_type.trim().toLowerCase() || undefined;
    }
    if (typeof applies.value.day_focus === "string") {
      applies.value.day_focus = applies.value.day_focus.trim().toLowerCase() || undefined;
    }
    if (typeof applies.value.phase === "string") {
      applies.value.phase = applies.value.phase.trim() || undefined;
    }

    if (applies.value.program_type && !VALID_PROGRAM_TYPES.has(applies.value.program_type)) {
      return { error: `applies_json.program_type must be one of: ${[...VALID_PROGRAM_TYPES].join(", ")}` };
    }
    if (applies.value.phase && !VALID_PHASES.has(applies.value.phase)) {
      return { error: `applies_json.phase must be one of: ${[...VALID_PHASES].join(", ")}` };
    }

    Object.keys(applies.value).forEach((key) => {
      if (applies.value[key] === undefined) delete applies.value[key];
    });
  }

  return {
    value: {
      template_id: templateId,
      scope,
      field,
      purpose,
      segment_type: segmentType,
      priority,
      text_pool_json: textPool,
      applies_json: applies.value,
      is_active: isActive,
    },
  };
}

export function normalizeTemplates(rows) {
  return (rows ?? []).map((row) => {
    const applies = isPlainObject(row?.applies_json) ? row.applies_json : {};
    const poolValue = Array.isArray(row?.text_pool_json) ? row.text_pool_json : [];
    return {
      rule_number: Number.isFinite(Number(row?.rule_number)) ? Number(row.rule_number) : null,
      template_id: safeString(row?.template_id),
      scope: safeString(row?.scope),
      field: safeString(row?.field),
      purpose: safeString(row?.purpose),
      segment_type: safeString(row?.segment_type),
      applies_program_type: safeString(applies.program_type).toLowerCase(),
      applies_day_focus: safeString(applies.day_focus).toLowerCase(),
      applies_phase: safeString(applies.phase),
      priority: parsePriority(row?.priority) ?? 1,
      text_pool_json: poolValue,
      raw: row,
    };
  });
}

function scoreTemplateMatch(template, combo, matchCtx) {
  if (!template) return null;
  if (template.scope !== combo.scope) return null;
  if (template.field !== combo.field) return null;

  const programType = safeString(matchCtx?.program_type);
  const dayFocus = safeString(matchCtx?.day_focus);
  const phase = safeString(matchCtx?.phase);
  const hasProgramType = Boolean(template.applies_program_type);
  const hasDayFocus = Boolean(template.applies_day_focus);
  const hasPhase = Boolean(template.applies_phase);

  if (hasProgramType && template.applies_program_type !== programType) return null;
  if (hasDayFocus && template.applies_day_focus !== dayFocus) return null;
  if (hasPhase && template.applies_phase !== phase) return null;

  let score = 1;
  const purpose = safeString(combo.purpose);
  const segmentType = safeString(combo.segment_type);
  const hasPurpose = Boolean(template.purpose);
  const hasSegmentType = Boolean(template.segment_type);

  if (purpose && hasPurpose && template.purpose === purpose) score += 4;
  else if (hasPurpose) score -= 1;

  if (segmentType && hasSegmentType && template.segment_type === segmentType) score += 4;
  else if (hasSegmentType) score -= 1;

  if (purpose && segmentType && template.purpose === purpose && template.segment_type === segmentType) {
    score += 10;
  }
  if (hasProgramType) score += 3;
  if (hasDayFocus) score += 3;
  if (hasPhase) score += 3;

  return score;
}

function findWinningTemplate(templates, combo, matchCtx) {
  let best = null;

  for (const template of templates) {
    const score = scoreTemplateMatch(template, combo, matchCtx);
    if (score == null) continue;
    if (!best || score > best.score || (score === best.score && template.priority < best.template.priority)) {
      best = { template, score };
    }
  }

  return best;
}

function deriveExpectedCombos(blockSemantics) {
  const combos = [...STATIC_EXPECTED_COMBOS];
  const semantics = isPlainObject(blockSemantics) ? blockSemantics : {};
  for (const rawSem of Object.values(semantics)) {
    if (!isPlainObject(rawSem)) continue;
    const purpose = toNullableText(rawSem.purpose);
    const segmentType = toNullableText(rawSem.preferred_segment_type);
    if (!purpose || !segmentType) continue;
    combos.push(
      { scope: "segment", field: "SEGMENT_TITLE", purpose, segment_type: segmentType },
      { scope: "segment", field: "SEGMENT_EXECUTION", purpose: null, segment_type: segmentType },
      { scope: "segment", field: "SEGMENT_INTENT", purpose, segment_type: null },
      { scope: "transition", field: "SETUP_NOTE", purpose: null, segment_type: segmentType },
      { scope: "transition", field: "TRANSITION_NOTE", purpose: null, segment_type: segmentType },
      { scope: "exercise", field: "EXERCISE_LINE", purpose, segment_type: null },
    );
  }

  const deduped = new Map();
  for (const combo of combos) {
    const key = [combo.scope, combo.field, combo.purpose ?? "", combo.segment_type ?? ""].join("|");
    if (!deduped.has(key)) deduped.set(key, combo);
  }
  return Array.from(deduped.values());
}

async function fetchTemplateById(templateId) {
  const result = await pool.query(
    `
    SELECT
      template_id,
      scope,
      field,
      purpose,
      segment_type,
      priority,
      text_pool_json,
      applies_json,
      is_active,
      created_at,
      updated_at
    FROM public.narration_template
    WHERE template_id = $1
    `,
    [templateId],
  );
  return result.rows?.[0] ?? null;
}

adminNarrationRouter.get("/narration/templates", async (req, res) => {
  try {
    const where = [];
    const params = [];

    const addParam = (value) => {
      params.push(value);
      return `$${params.length}`;
    };

    const scope = safeString(req.query?.scope);
    const field = safeString(req.query?.field);
    const purpose = safeString(req.query?.purpose);
    const segmentType = safeString(req.query?.segment_type);
    const programType = safeString(req.query?.program_type);
    const q = safeString(req.query?.q);
    const isActiveRaw = safeString(req.query?.is_active).toLowerCase();

    if (scope) where.push(`scope = ${addParam(scope)}`);
    if (field) where.push(`field = ${addParam(field)}`);
    if (purpose) where.push(`purpose = ${addParam(purpose)}`);
    if (segmentType) where.push(`segment_type = ${addParam(segmentType)}`);
    if (programType) where.push(`applies_json->>'program_type' = ${addParam(programType)}`);
    if (isActiveRaw === "true" || isActiveRaw === "false") {
      where.push(`is_active = ${addParam(isActiveRaw === "true")}`);
    }
    if (q) {
      const param = addParam(`%${q}%`);
      where.push(`(template_id ILIKE ${param} OR text_pool_json::text ILIKE ${param})`);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const result = await pool.query(
      `
      SELECT
        ROW_NUMBER() OVER (ORDER BY priority ASC NULLS LAST, template_id ASC) AS rule_number,
        template_id,
        scope,
        field,
        purpose,
        segment_type,
        priority,
        text_pool_json,
        applies_json,
        is_active,
        created_at,
        updated_at
      FROM public.narration_template
      ${whereClause}
      ORDER BY priority ASC NULLS LAST, template_id ASC
      `,
      params,
    );

    return res.json({ templates: result.rows ?? [] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

adminNarrationRouter.get("/narration/templates/:template_id", async (req, res) => {
  try {
    const template = await fetchTemplateById(req.params.template_id);
    if (!template) {
      return res.status(404).json({ ok: false, error: "Template not found" });
    }
    return res.json({ template });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

adminNarrationRouter.post("/narration/templates", async (req, res) => {
  try {
    const parsed = validateTemplatePayload(req.body, { requireTemplateId: true });
    if (parsed.error) {
      return res.status(400).json({ ok: false, error: parsed.error });
    }

    const template = parsed.value;
    const existing = await fetchTemplateById(template.template_id);
    if (existing) {
      return res.status(409).json({ ok: false, error: "template_id already exists" });
    }

    const result = await pool.query(
      `
      INSERT INTO public.narration_template (
        template_id,
        scope,
        field,
        purpose,
        segment_type,
        priority,
        text_pool_json,
        applies_json,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
      RETURNING
        template_id,
        scope,
        field,
        purpose,
        segment_type,
        priority,
        text_pool_json,
        applies_json,
        is_active,
        created_at,
        updated_at
      `,
      [
        template.template_id,
        template.scope,
        template.field,
        template.purpose,
        template.segment_type,
        template.priority,
        JSON.stringify(template.text_pool_json),
        template.applies_json == null ? null : JSON.stringify(template.applies_json),
        template.is_active,
      ],
    );

    await auditLog(req, {
      action: "create",
      entity: "narration_template",
      entityId: result.rows[0].template_id,
      detail: {
        scope: result.rows[0].scope,
        field: result.rows[0].field,
        purpose: result.rows[0].purpose,
        segment_type: result.rows[0].segment_type,
        is_active: result.rows[0].is_active,
      },
    });

    return res.json({ ok: true, template: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

adminNarrationRouter.put("/narration/templates/:template_id", async (req, res) => {
  try {
    const templateId = safeString(req.params.template_id);
    if (!templateId) {
      return res.status(400).json({ ok: false, error: "template_id is required" });
    }
    const parsed = validateTemplatePayload(req.body, { requireTemplateId: true });
    if (parsed.error) {
      return res.status(400).json({ ok: false, error: parsed.error });
    }

    const template = parsed.value;
    if (template.template_id !== templateId) {
      const existing = await fetchTemplateById(template.template_id);
      if (existing) {
        return res.status(409).json({ ok: false, error: "template_id already exists" });
      }
    }
    const result = await pool.query(
      `
      UPDATE public.narration_template
      SET
        template_id = $2,
        scope = $3,
        field = $4,
        purpose = $5,
        segment_type = $6,
        priority = $7,
        text_pool_json = $8::jsonb,
        applies_json = $9::jsonb,
        is_active = $10,
        updated_at = now()
      WHERE template_id = $1
      RETURNING
        template_id,
        scope,
        field,
        purpose,
        segment_type,
        priority,
        text_pool_json,
        applies_json,
        is_active,
        created_at,
        updated_at
      `,
      [
        templateId,
        template.template_id,
        template.scope,
        template.field,
        template.purpose,
        template.segment_type,
        template.priority,
        JSON.stringify(template.text_pool_json),
        template.applies_json == null ? null : JSON.stringify(template.applies_json),
        template.is_active,
      ],
    );

    if (!result.rows?.length) {
      return res.status(404).json({ ok: false, error: "Template not found" });
    }

    await auditLog(req, {
      action: "update",
      entity: "narration_template",
      entityId: result.rows[0].template_id,
      detail: {
        scope: result.rows[0].scope,
        field: result.rows[0].field,
        purpose: result.rows[0].purpose,
        segment_type: result.rows[0].segment_type,
        is_active: result.rows[0].is_active,
      },
    });

    return res.json({ ok: true, template: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

adminNarrationRouter.delete("/narration/templates/:template_id", async (req, res) => {
  try {
    const result = await pool.query(
      `
      UPDATE public.narration_template
      SET is_active = false, updated_at = now()
      WHERE template_id = $1
      RETURNING template_id
      `,
      [req.params.template_id],
    );

    if (!result.rows?.length) {
      return res.status(404).json({ ok: false, error: "Template not found" });
    }

    await auditLog(req, {
      action: "deactivate",
      entity: "narration_template",
      entityId: result.rows[0].template_id,
      detail: { is_active: false },
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});

adminNarrationRouter.get("/narration/coverage", async (req, res) => {
  try {
    const programType = safeString(req.query?.program_type);
    if (!programType) {
      return res.status(400).json({ ok: false, error: "program_type is required" });
    }

    const cfgResult = await pool.query(
      `
      SELECT config_key, program_generation_config_json
      FROM public.program_generation_config
      WHERE program_type = $1 AND is_active = true
      ORDER BY updated_at DESC, config_key ASC
      LIMIT 1
      `,
      [programType],
    );

    if (!cfgResult.rows?.length) {
      return res.status(404).json({ ok: false, error: "Active config not found for program_type" });
    }

    const configRow = cfgResult.rows[0];
    const configJson = isPlainObject(configRow.program_generation_config_json)
      ? configRow.program_generation_config_json
      : {};
    const blockSemantics = configJson?.segmentation?.block_semantics;
    const expectedCombos = deriveExpectedCombos(blockSemantics);

    // Add per-day_focus variants of day-scope combos derived from the config's day templates.
    // This allows templates with applies_day_focus (e.g. simulation-specific day titles)
    // to appear in coverage rather than always being reported as "missing".
    const dayFocusValues = [...new Set(
      (configJson?.builder?.day_templates ?? [])
        .map((t) => normalizeFocusValue(t?.focus))
        .filter(Boolean),
    )];
    const staticDayCombos = STATIC_EXPECTED_COMBOS.filter((c) => c.scope === "day");
    for (const df of dayFocusValues) {
      for (const c of staticDayCombos) {
        expectedCombos.push({ ...c, day_focus: df });
      }
    }

    const templateResult = await pool.query(
      `
      SELECT
        template_id,
        scope,
        field,
        purpose,
        segment_type,
        priority,
        text_pool_json,
        applies_json,
        is_active,
        created_at,
        updated_at
      FROM public.narration_template
      WHERE is_active = true
      ORDER BY priority ASC NULLS LAST, template_id ASC
      `,
    );

    const templates = normalizeTemplates(templateResult.rows);
    const knownFocusValues = [...dayFocusValues];
    const knownFocusSet = new Set(knownFocusValues);
    const orphanedTemplates = templates
      .filter((template) => template.applies_day_focus)
      .filter((template) => !knownFocusSet.has(normalizeFocusValue(template.applies_day_focus)))
      .map((template) => ({
        template_id: template.template_id,
        applies_day_focus: template.applies_day_focus,
        known_focus_values: knownFocusValues,
      }));
    const summary = { specific: 0, generic_fallback: 0, missing: 0 };

    const expected = expectedCombos.map((combo) => {
      const matchCtx = { program_type: programType, day_focus: combo.day_focus ?? "" };
      const winner = findWinningTemplate(templates, combo, matchCtx);
      let coverage = "missing";
      let winningTemplateId = null;
      let winningScore = null;

      if (winner) {
        winningTemplateId = winner.template.template_id;
        winningScore = winner.score;
        coverage = (winner.template.applies_program_type || winner.template.applies_day_focus)
          ? "specific"
          : "generic_fallback";
      }

      summary[coverage] += 1;
      return {
        scope: combo.scope,
        field: combo.field,
        purpose: combo.purpose,
        segment_type: combo.segment_type,
        day_focus: combo.day_focus ?? null,
        coverage,
        winning_template_id: winningTemplateId,
        winning_score: winningScore,
      };
    });

    return res.json({
      program_type: programType,
      config_key: configRow.config_key,
      expected,
      orphaned_templates: orphanedTemplates,
      summary,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: publicInternalError(err) });
  }
});
