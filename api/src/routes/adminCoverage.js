import express from "express";
import { pool } from "../db.js";
import { requireInternalToken } from "../middleware/auth.js";

export const adminCoverageRouter = express.Router();

adminCoverageRouter.use(requireInternalToken);

const PRESETS = [
  { code: "no_equipment", label: "No Equipment", column: "no_equipment" },
  { code: "minimal_equipment", label: "Minimal Equipment", column: "minimal_equipment" },
  { code: "decent_home_gym", label: "Decent Home Gym", column: "decent_home_gym" },
  { code: "commercial_gym", label: "Commercial Gym", column: "commercial_gym" },
  { code: "crossfit_hyrox_gym", label: "CrossFit / HYROX Gym", column: "crossfit_hyrox_gym" },
];

const RANKS = [
  { value: 0, label: "Beginner" },
  { value: 1, label: "Intermediate" },
  { value: 2, label: "Advanced" },
  { value: 3, label: "Elite" },
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function flagIsTrue(value) {
  if (typeof value === "boolean") return value === true;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function buildPresetValuesSql(presets, startParam = 1) {
  const placeholders = [];
  const params = [];
  for (let i = 0; i < presets.length; i++) {
    const p = presets[i];
    const pCode = startParam + i * 2;
    const pSlugs = pCode + 1;
    placeholders.push(`($${pCode}::text, $${pSlugs}::text[])`);
    params.push(p.code, p.equipment_slugs);
  }
  return {
    sql: placeholders.join(", "),
    params,
    nextParam: startParam + presets.length * 2,
  };
}

async function fetchSlotCounts(client, presets, slot) {
  const sw = asText(slot.sw) || null;
  const sw2 = asText(slot.sw2) || null;
  const swAny = asArray(slot.swAny)
    .map((v) => asText(v))
    .filter(Boolean);
  const mp = asText(slot.mp) || null;
  const requirePref = asText(slot.requirePref) || null;
  const unconstrained = !sw && !sw2 && swAny.length === 0 && !mp;

  const presetValues = buildPresetValuesSql(presets, 1);
  const swParam = presetValues.nextParam;
  const sw2Param = swParam + 1;
  const swAnyParam = swParam + 2;
  const mpParam = swParam + 3;
  const requirePrefParam = swParam + 4;
  const unconstrainedParam = swParam + 5;

  const sql = `
    WITH preset_values(preset_code, preset_slugs) AS (
      VALUES ${presetValues.sql}
    ),
    rank_values(rank_value) AS (
      VALUES (0), (1), (2), (3)
    ),
    combinations AS (
      SELECT p.preset_code, p.preset_slugs, r.rank_value
      FROM preset_values p
      CROSS JOIN rank_values r
    )
    SELECT
      c.preset_code,
      c.rank_value,
      COUNT(ec.*)::int AS cnt
    FROM combinations c
    LEFT JOIN exercise_catalogue ec
      ON ec.is_archived = false
      AND COALESCE(ec.min_fitness_rank, 0) <= c.rank_value
      AND (ec.movement_class IS NULL OR ec.movement_class NOT IN ('cardio','conditioning','locomotion'))
      AND COALESCE(ec.equipment_items_slugs, '{}'::text[]) <@ c.preset_slugs
      AND (
        $${unconstrainedParam}::boolean = true
        OR ($${swParam}::text IS NOT NULL AND ec.swap_group_id_1 = $${swParam})
        OR ($${sw2Param}::text IS NOT NULL AND ec.swap_group_id_2 = $${sw2Param})
        OR (
          $${swAnyParam}::text[] IS NOT NULL
          AND cardinality($${swAnyParam}::text[]) > 0
          AND ec.swap_group_id_1 = ANY($${swAnyParam})
        )
        OR ($${mpParam}::text IS NOT NULL AND ec.movement_pattern_primary = $${mpParam})
      )
      AND (
        $${requirePrefParam}::text IS NULL
        OR (
          ec.preferred_in_json IS NOT NULL
          AND ec.preferred_in_json @> to_jsonb($${requirePrefParam}::text)
        )
      )
    GROUP BY c.preset_code, c.rank_value
  `;

  const params = [
    ...presetValues.params,
    sw,
    sw2,
    swAny.length > 0 ? swAny : null,
    mp,
    requirePref,
    unconstrained,
  ];

  const result = await client.query(sql, params);
  const counts = {};
  for (const preset of presets) {
    for (const rank of RANKS) {
      counts[`${preset.code}_${rank.value}`] = 0;
    }
  }
  for (const row of result.rows ?? []) {
    counts[`${row.preset_code}_${row.rank_value}`] = Number(row.cnt ?? 0);
  }
  return counts;
}

adminCoverageRouter.get("/coverage-report", async (_req, res) => {
  try {
    const equipmentRows = await pool.query(`
      SELECT
        exercise_slug,
        no_equipment,
        minimal_equipment,
        decent_home_gym,
        commercial_gym,
        crossfit_hyrox_gym
      FROM equipment_items
    `);

    const presetSlugsByCode = new Map(PRESETS.map((p) => [p.code, []]));
    for (const row of equipmentRows.rows ?? []) {
      const slug = asText(row.exercise_slug);
      if (!slug) continue;
      for (const preset of PRESETS) {
        if (flagIsTrue(row[preset.column])) {
          presetSlugsByCode.get(preset.code).push(slug);
        }
      }
    }

    const presets = PRESETS.map((p) => ({
      code: p.code,
      label: p.label,
      equipment_slugs: Array.from(new Set(presetSlugsByCode.get(p.code) ?? [])).sort(),
    }));

    const cfgResult = await pool.query(`
      SELECT
        config_key,
        program_type,
        program_generation_config_json
      FROM public.program_generation_config
      WHERE is_active = true
      ORDER BY program_type ASC, config_key ASC
    `);

    const rows = [];
    for (const cfg of cfgResult.rows ?? []) {
      const configJson = asJsonObject(cfg.program_generation_config_json);
      const dayTemplates = asArray(configJson?.builder?.day_templates);
      for (let i = 0; i < dayTemplates.length; i++) {
        const day = asObject(dayTemplates[i]);
        const orderedSlots = asArray(day.ordered_slots);
        for (const rawSlot of orderedSlots) {
          const slot = asObject(rawSlot);
          const counts = await fetchSlotCounts(pool, presets, slot);
          rows.push({
            config_key: cfg.config_key,
            program_type: cfg.program_type,
            day_key: asText(day.day_key) || `day${i + 1}`,
            day_index: i + 1,
            day_focus: asText(day.focus) || null,
            slot: asText(slot.slot) || "",
            sw: asText(slot.sw) || null,
            sw2: asText(slot.sw2) || null,
            swAny: asArray(slot.swAny).map((v) => asText(v)).filter(Boolean) || null,
            mp: asText(slot.mp) || null,
            requirePref: asText(slot.requirePref) || null,
            counts,
          });
        }
      }
    }

    return res.json({ presets, ranks: RANKS, rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});
