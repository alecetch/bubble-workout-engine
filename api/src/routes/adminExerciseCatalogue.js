/**
 * adminExerciseCatalogue.js
 * Exercise Catalogue admin API — coverage optimisation tool.
 *
 * All mutations are staged in a server-side session queue and written to
 * a Flyway repeatable migration file on commit.  The database is never
 * touched directly by these endpoints.
 */

import express from "express";
import { pool } from "../db.js";
import { requireInternalToken } from "../middleware/auth.js";
import { writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Three levels up from api/src/routes/ → repo root → migrations/
const MIGRATIONS_DIR = join(__dirname, "../../migrations");
const MIGRATION_FILE = "R__exercise_catalogue_edits.sql";

export const adminExerciseCatalogueRouter = express.Router();
adminExerciseCatalogueRouter.use(requireInternalToken);

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESETS = [
  { code: "no_equipment",       label: "No Equipment" },
  { code: "minimal_equipment",  label: "Minimal Equipment" },
  { code: "decent_home_gym",    label: "Decent Home Gym" },
  { code: "commercial_gym",     label: "Commercial Gym" },
  { code: "crossfit_hyrox_gym", label: "CrossFit / HYROX Gym" },
];

const RANKS = [0, 1, 2, 3];
const EXCLUDED_MOVEMENT_CLASSES = new Set(["cardio", "conditioning", "locomotion"]);
const JSONB_FIELDS = new Set([
  "contraindications_json", "equipment_json", "preferred_in_json",
  "target_regions_json", "warmup_hooks",
]);
const ARRAY_FIELDS = new Set(["contraindications_slugs", "equipment_items_slugs"]);
const VALID_MOVEMENT_CLASSES = new Set([
  "compound", "isolation", "engine", "core", "carry",
]);

// ── Module-level cache & session ─────────────────────────────────────────────

let _cache = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Single global pending queue (single-admin tool)
const _pending = []; // { action, exercise_id, changes, sql, queued_at }

function invalidateCache() { _cache = null; }

// ── SQL helpers ───────────────────────────────────────────────────────────────

function sqlLiteral(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlArray(arr) {
  const a = Array.isArray(arr) ? arr : [];
  if (a.length === 0) return "'{}'::text[]";
  return `ARRAY[${a.map(sqlLiteral).join(", ")}]::text[]`;
}

function sqlJsonb(val) {
  return `${sqlLiteral(JSON.stringify(val))}::jsonb`;
}

function buildSetClause(changes) {
  const parts = [];
  for (const [key, value] of Object.entries(changes)) {
    if (JSONB_FIELDS.has(key)) parts.push(`${key} = ${sqlJsonb(value)}`);
    else if (ARRAY_FIELDS.has(key)) parts.push(`${key} = ${sqlArray(value)}`);
    else parts.push(`${key} = ${sqlLiteral(value)}`);
  }
  parts.push("updated_at = now()");
  return parts.join(",\n      ");
}

function buildEditSql(exercise_id, changes) {
  return (
    `UPDATE exercise_catalogue\n` +
    `  SET ${buildSetClause(changes)}\n` +
    `  WHERE exercise_id = ${sqlLiteral(exercise_id)};`
  );
}

function buildInsertSql(exercise) {
  const COLS = [
    "exercise_id", "name", "movement_class", "movement_pattern_primary",
    "min_fitness_rank", "is_archived", "is_loadable", "complexity_rank",
    "contraindications_json", "contraindications_slugs", "density_rating",
    "engine_anchor", "engine_role", "equipment_items_slugs", "equipment_json",
    "form_cues", "impact_level", "lift_class", "preferred_in_json",
    "swap_group_id_1", "swap_group_id_2", "target_regions_json", "warmup_hooks",
    "slug", "creator", "strength_primary_region", "strength_equivalent",
  ];
  const vals = COLS.map(k => {
    const v = exercise[k];
    if (JSONB_FIELDS.has(k)) return sqlJsonb(v ?? (k === "preferred_in_json" ? [] : []));
    if (ARRAY_FIELDS.has(k)) return sqlArray(v ?? []);
    return sqlLiteral(v ?? null);
  });
  const updates = COLS.filter(k => k !== "exercise_id")
    .map(k => `  ${k} = EXCLUDED.${k}`);
  return (
    `INSERT INTO exercise_catalogue (\n  ${COLS.join(", ")}\n) VALUES (\n  ${vals.join(",\n  ")}\n)\n` +
    `ON CONFLICT (exercise_id) DO UPDATE SET\n${updates.join(",\n")};`
  );
}

// ── In-memory eligibility engine ─────────────────────────────────────────────

function preferredTags(ex) {
  const p = ex.preferred_in_json;
  if (Array.isArray(p)) return p;
  if (typeof p === "string") { try { return JSON.parse(p); } catch { return []; } }
  return [];
}

function isEligible(ex, presetSlugsSet, rankValue, slot) {
  if (ex.is_archived) return false;
  if ((ex.min_fitness_rank ?? 0) > rankValue) return false;
  if (ex.movement_class && EXCLUDED_MOVEMENT_CLASSES.has(ex.movement_class)) return false;

  const eqSlugs = ex.equipment_items_slugs ?? [];
  if (!eqSlugs.every(s => presetSlugsSet.has(s))) return false;

  const { sw, sw2, swAny = [], mp } = slot;
  const unconstrained = !sw && !sw2 && (!Array.isArray(swAny) || swAny.length === 0) && !mp;
  if (!unconstrained) {
    const swMatch  = sw        && ex.swap_group_id_1 === sw;
    const sw2Match = sw2       && ex.swap_group_id_2 === sw2;
    const swAnyMatch = Array.isArray(swAny) && swAny.length > 0 && swAny.includes(ex.swap_group_id_1);
    const mpMatch  = mp        && ex.movement_pattern_primary === mp;
    if (!swMatch && !sw2Match && !swAnyMatch && !mpMatch) return false;
  }

  const rp = slot.requirePref;
  if (rp) {
    if (!preferredTags(ex).includes(rp)) return false;
  }

  return true;
}

// ── Compute coverage impact for a set of exercises ───────────────────────────

function computeImpact(baseExercises, modifiedExercises, presets, gapRows) {
  const presetSets = new Map(presets.map(p => [p.code, new Set(p.equipment_slugs)]));

  const gaps_newly_filled = [];
  const slots_improved    = [];
  const slots_degraded    = [];

  for (const gap of gapRows) {
    for (const preset of presets) {
      const pSet = presetSets.get(preset.code);
      for (const rank of RANKS) {
        const slot = { sw: gap.sw, sw2: gap.sw2, swAny: gap.swAny, mp: gap.mp, requirePref: gap.requirePref };
        const before = baseExercises.filter(ex => isEligible(ex, pSet, rank, slot)).length;
        const after  = modifiedExercises.filter(ex => isEligible(ex, pSet, rank, slot)).length;
        if (after === before) continue;
        const entry = {
          config_key: gap.config_key, day_key: gap.day_key,
          slot: gap.slot, preset: preset.code, rank,
          before, after,
        };
        if (before === 0 && after > 0)     gaps_newly_filled.push(entry);
        else if (after > before)           slots_improved.push(entry);
        else if (after < before)           slots_degraded.push(entry);
      }
    }
  }

  return {
    gaps_newly_filled,
    slots_improved,
    slots_degraded,
    net_zero_gaps_fixed:    gaps_newly_filled.length,
    net_low_gaps_improved:  slots_improved.length,
    net_coverage_lost:      slots_degraded.length,
  };
}

// ── Recommendation engine ─────────────────────────────────────────────────────

function runRecommendations(exercises, presets, gapRows) {
  const presetSets = new Map(presets.map(p => [p.code, new Set(p.equipment_slugs)]));

  // Flatten to individual (slot, preset, rank) gaps where count <= 1
  const gaps = [];
  for (const g of gapRows) {
    for (const preset of presets) {
      for (const rank of RANKS) {
        const count = g.counts[`${preset.code}_${rank}`] ?? 0;
        if (count <= 1) {
          gaps.push({ ...g, preset: preset.code, rank, current_count: count });
        }
      }
    }
  }
  if (gaps.length === 0) return [];

  // Candidate actions: Map<key, action>
  const candidates = new Map();

  function addCandidate(key, action, gap) {
    if (!candidates.has(key)) candidates.set(key, { ...action, gaps_fixed: [] });
    candidates.get(key).gaps_fixed.push(gap);
  }

  for (const ex of exercises) {
    for (const gap of gaps) {
      const pSet = presetSets.get(gap.preset);
      const slot = { sw: gap.sw, sw2: gap.sw2, swAny: gap.swAny ?? [], mp: gap.mp, requirePref: gap.requirePref };

      if (isEligible(ex, pSet, gap.rank, slot)) continue; // Already eligible

      // Count failing gates
      const fails = [];

      // 1. Archived gate
      if (ex.is_archived) {
        fails.push({ gate: "archived", changes: { is_archived: false } });
      }

      // Only consider non-archived exercises for selector/rank/pref fixes
      if (!ex.is_archived) {
        // 2. Rank gate
        if ((ex.min_fitness_rank ?? 0) > gap.rank) {
          fails.push({ gate: "rank", changes: { min_fitness_rank: gap.rank } });
        }

        // 3. Equipment gate (near-miss only: exactly 1 slug blocking)
        const eqSlugs = ex.equipment_items_slugs ?? [];
        const blocking = eqSlugs.filter(s => !pSet.has(s));
        if (blocking.length === 1) {
          // Suggest removing the blocking slug (only if name doesn't imply it)
          const newSlugs = eqSlugs.filter(s => s !== blocking[0]);
          fails.push({ gate: "equipment_nearMiss", changes: { equipment_items_slugs: newSlugs, equipment_json: newSlugs }, risky: true });
        }

        // 4. Selector gate
        const { sw, sw2, swAny = [], mp } = slot;
        const unconstrained = !sw && !sw2 && (!Array.isArray(swAny) || swAny.length === 0) && !mp;
        if (!unconstrained) {
          const swMatch  = sw && ex.swap_group_id_1 === sw;
          const sw2Match = sw2 && ex.swap_group_id_2 === sw2;
          const swAnyMatch = Array.isArray(swAny) && swAny.length > 0 && swAny.includes(ex.swap_group_id_1);
          const mpMatch  = mp && ex.movement_pattern_primary === mp;
          if (!swMatch && !sw2Match && !swAnyMatch && !mpMatch) {
            // Near-miss: propose minimal selector change
            if (sw && !ex.swap_group_id_1)  fails.push({ gate: "sw",  changes: { swap_group_id_1: sw } });
            if (sw2 && !ex.swap_group_id_2) fails.push({ gate: "sw2", changes: { swap_group_id_2: sw2 } });
            if (mp && ex.movement_pattern_primary !== mp) fails.push({ gate: "mp", changes: { movement_pattern_primary: mp } });
          }
        }

        // 5. RequirePref gate
        if (gap.requirePref && !preferredTags(ex).includes(gap.requirePref)) {
          const updated = [...preferredTags(ex), gap.requirePref];
          fails.push({ gate: "requirePref", changes: { preferred_in_json: updated } });
        }
      }

      // Only generate a candidate if exactly 1 gate is failing (true near-miss)
      const nonEquipFails = fails.filter(f => f.gate !== "equipment_nearMiss");
      const toProcess = nonEquipFails.length === 1 ? nonEquipFails : (fails.length === 1 ? fails : []);

      for (const fail of toProcess) {
        const changeKey = JSON.stringify(fail.changes);
        const key = `${ex.exercise_id}::${changeKey}`;
        addCandidate(key, {
          action: ex.is_archived ? "unarchive" : "edit",
          exercise_id: ex.exercise_id,
          exercise_name: ex.name,
          changes: fail.changes,
          risky: fail.risky ?? false,
        }, gap);
      }
    }
  }

  // Score and build result
  const results = [];
  for (const [, cand] of candidates) {
    const sourceEx = exercises.find(e => e.exercise_id === cand.exercise_id);
    if (!sourceEx) continue;

    const modEx = { ...sourceEx, ...cand.changes };
    let zeroCovered = 0, lowCovered = 0;

    for (const gap of cand.gaps_fixed) {
      const pSet = presetSets.get(gap.preset);
      const slot = { sw: gap.sw, sw2: gap.sw2, swAny: gap.swAny ?? [], mp: gap.mp, requirePref: gap.requirePref };
      if (isEligible(modEx, pSet, gap.rank, slot)) {
        if (gap.current_count === 0) zeroCovered++;
        else lowCovered++;
      }
    }

    const fieldsChanged = Object.keys(cand.changes).length;
    const score = 10 * zeroCovered + 4 * lowCovered - 3 * fieldsChanged - (cand.risky ? 5 : 0);
    if (score <= 0) continue;

    const changeDesc = Object.entries(cand.changes)
      .map(([k, v]) => `${k} → ${Array.isArray(v) ? JSON.stringify(v) : v}`)
      .join("; ");
    const explanation =
      `Set ${changeDesc} on "${cand.exercise_name}". ` +
      `Fixes ${zeroCovered} zero-coverage gap(s), improves ${lowCovered} low-coverage slot(s).`;

    results.push({
      action: cand.action,
      exercise_id: cand.exercise_id,
      exercise_name: cand.exercise_name,
      changes: cand.changes,
      fields_changed: fieldsChanged,
      impact: { net_zero_gaps_fixed: zeroCovered, net_low_gaps_improved: lowCovered, net_coverage_lost: 0 },
      explanation,
      score,
      sql_preview: buildEditSql(cand.exercise_id, cand.changes),
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 25).map((r, i) => ({ rank: i + 1, ...r }));
}

// ── Catalogue health diagnostics ─────────────────────────────────────────────

function runHealthDiagnostics(exercises, presets, slots) {
  const presetSets = new Map(presets.map(p => [p.code, new Set(p.equipment_slugs)]));
  const LOW_UTIL_THRESHOLD = 4;
  const OVERSUPPLY_THRESHOLD = 5;

  const neverUsed = [];
  const lowUtility = [];
  const clusterMap = new Map();

  for (const ex of exercises) {
    if (ex.is_archived) continue;

    let matchCount = 0;
    const matchedSlots = new Set();
    const matchedPresets = new Set();
    const failReasons = new Set();

    for (const slot of slots) {
      const slotObj = { sw: slot.sw, sw2: slot.sw2, swAny: slot.swAny ?? [], mp: slot.mp, requirePref: slot.requirePref };
      for (const preset of presets) {
        const pSet = presetSets.get(preset.code);
        for (const rank of RANKS) {
          if (isEligible(ex, pSet, rank, slotObj)) {
            matchCount++;
            matchedSlots.add(`${slot.config_key}|${slot.slot_label}|${slot.day_key}`);
            matchedPresets.add(preset.code);
          }
        }
      }
    }

    if (matchCount === 0) {
      // Diagnose why
      const eqSlugs = ex.equipment_items_slugs ?? [];
      const blockedByEq = presets.filter(p => {
        const pSet = presetSets.get(p.code);
        return eqSlugs.some(s => !pSet.has(s));
      });
      if (blockedByEq.length === presets.length) {
        failReasons.add(`equipment (${eqSlugs.join(", ")}) not available in any preset`);
      }

      const hasAnySlotMatch = slots.some(slot => {
        const { sw, sw2, swAny = [], mp } = slot;
        const unconstrained = !sw && !sw2 && (!Array.isArray(swAny) || swAny.length === 0) && !mp;
        if (unconstrained) return true;
        return (
          (sw && ex.swap_group_id_1 === sw) ||
          (sw2 && ex.swap_group_id_2 === sw2) ||
          (Array.isArray(swAny) && swAny.length > 0 && swAny.includes(ex.swap_group_id_1)) ||
          (mp && ex.movement_pattern_primary === mp)
        );
      });
      if (!hasAnySlotMatch) failReasons.add("no active slot rule matches sw1/sw2/mp");

      if (EXCLUDED_MOVEMENT_CLASSES.has(ex.movement_class)) {
        failReasons.add(`movement_class '${ex.movement_class}' is excluded from slot eligibility`);
      }

      const fixes = [];
      if (!hasAnySlotMatch) fixes.push("Add swap_group_id_1/2 or movement_pattern_primary that matches an active slot rule");
      if (blockedByEq.length === presets.length) fixes.push("Remove or change equipment slugs to ones available in at least one preset");
      if (EXCLUDED_MOVEMENT_CLASSES.has(ex.movement_class)) fixes.push("Change movement_class away from excluded values");

      neverUsed.push({
        exercise_id: ex.exercise_id,
        name: ex.name,
        movement_class: ex.movement_class,
        swap_group_id_1: ex.swap_group_id_1,
        movement_pattern_primary: ex.movement_pattern_primary,
        equipment_items_slugs: ex.equipment_items_slugs,
        match_count: 0,
        reason: Array.from(failReasons).join("; ") || "No slot/preset combination matches",
        possible_fixes: fixes,
      });
    } else if (matchCount <= LOW_UTIL_THRESHOLD) {
      lowUtility.push({
        exercise_id: ex.exercise_id,
        name: ex.name,
        movement_class: ex.movement_class,
        match_count: matchCount,
        matched_slots: Array.from(matchedSlots),
        matched_presets: Array.from(matchedPresets),
      });
    }

    // Cluster tracking
    for (const key of [
      ex.swap_group_id_1 && `sw1=${ex.swap_group_id_1}`,
      ex.swap_group_id_2 && `sw2=${ex.swap_group_id_2}`,
      ex.movement_pattern_primary && `mp=${ex.movement_pattern_primary}`,
    ].filter(Boolean)) {
      if (!clusterMap.has(key)) clusterMap.set(key, []);
      clusterMap.get(key).push({ exercise_id: ex.exercise_id, name: ex.name });
    }
  }

  const oversupplied = [];
  for (const [key, exList] of clusterMap) {
    if (exList.length >= OVERSUPPLY_THRESHOLD) {
      oversupplied.push({ cluster_key: key, exercise_count: exList.length, exercises: exList });
    }
  }
  oversupplied.sort((a, b) => b.exercise_count - a.exercise_count);

  return { never_used: neverUsed, low_utility: lowUtility, oversupplied_clusters: oversupplied };
}

// ── Full state loader (cached) ────────────────────────────────────────────────

async function getFullState(forceRefresh = false) {
  if (!forceRefresh && _cache && Date.now() - _cacheTs < CACHE_TTL_MS) return _cache;

  const client = await pool.connect();
  try {
    const [exRes, eqRes, cfgRes] = await Promise.all([
      client.query("SELECT * FROM exercise_catalogue ORDER BY movement_class, name"),
      client.query(`
        SELECT DISTINCT exercise_slug, name, category,
          no_equipment, minimal_equipment, decent_home_gym, commercial_gym, crossfit_hyrox_gym
        FROM equipment_items ORDER BY exercise_slug
      `),
      client.query(`
        SELECT config_key, program_type, program_generation_config_json
        FROM public.program_generation_config
        WHERE is_active = true ORDER BY program_type, config_key
      `),
    ]);

    const exercises = exRes.rows;

    // Equipment slugs
    const flagIsTrue = v => v === true || v === "true" || v === "True";
    const equipmentSlugs = eqRes.rows.map(r => ({
      slug: r.exercise_slug, name: r.name, category: r.category,
      presets: PRESETS.filter(p => flagIsTrue(r[p.code])).map(p => p.code),
    }));

    // Preset slug sets
    const presetSlugsByCode = new Map(PRESETS.map(p => [p.code, []]));
    for (const r of eqRes.rows) {
      for (const p of PRESETS) {
        if (flagIsTrue(r[p.code])) presetSlugsByCode.get(p.code).push(r.exercise_slug);
      }
    }
    const presets = PRESETS.map(p => ({
      code: p.code, label: p.label,
      equipment_slugs: [...new Set(presetSlugsByCode.get(p.code))].sort(),
    }));

    // Slots from active configs
    const slots = [];
    for (const cfg of cfgRes.rows) {
      const json = typeof cfg.program_generation_config_json === "string"
        ? JSON.parse(cfg.program_generation_config_json)
        : cfg.program_generation_config_json;
      const dayTemplates = json?.builder?.day_templates ?? [];
      dayTemplates.forEach((day, i) => {
        for (const rawSlot of (day.ordered_slots ?? [])) {
          slots.push({
            config_key: cfg.config_key,
            program_type: cfg.program_type,
            day_key: day.day_key || `day${i + 1}`,
            day_index: i + 1,
            day_focus: day.focus || null,
            slot_label: rawSlot.slot || "",
            sw: rawSlot.sw || null,
            sw2: rawSlot.sw2 || null,
            swAny: rawSlot.swAny || [],
            mp: rawSlot.mp || null,
            requirePref: rawSlot.requirePref || null,
          });
        }
      });
    }

    // Compute coverage gaps in-memory (mirrors adminCoverage.js SQL logic)
    const presetSets = new Map(presets.map(p => [p.code, new Set(p.equipment_slugs)]));
    const coverageGaps = slots.map(slot => {
      const counts = {};
      for (const preset of presets) {
        const pSet = presetSets.get(preset.code);
        for (const rank of RANKS) {
          counts[`${preset.code}_${rank}`] = exercises.filter(
            ex => isEligible(ex, pSet, rank, { sw: slot.sw, sw2: slot.sw2, swAny: slot.swAny, mp: slot.mp, requirePref: slot.requirePref })
          ).length;
        }
      }
      return {
        config_key: slot.config_key, day_key: slot.day_key,
        day_index: slot.day_index, day_focus: slot.day_focus,
        slot: slot.slot_label,
        sw: slot.sw, sw2: slot.sw2, swAny: slot.swAny,
        mp: slot.mp, requirePref: slot.requirePref,
        counts,
      };
    });

    _cache = { exercises, equipmentSlugs, presets, coverageGaps, slots };
    _cacheTs = Date.now();
    return _cache;
  } finally {
    client.release();
  }
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
      continue;
    }
    if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_"));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => { row[h] = vals[j]?.trim() ?? ""; });
    rows.push({ _line: i + 1, ...row });
  }
  return { headers, rows };
}

// ── exercise_id generator ─────────────────────────────────────────────────────

function generateExerciseId(name) {
  const ABBREV = { kettlebell: "kb", dumbbell: "db", barbell: "bb" };
  let id = name.toLowerCase().trim();
  for (const [full, abbr] of Object.entries(ABBREV)) {
    id = id.replace(new RegExp(`\\b${full}s?\\b`, "g"), abbr);
  }
  return id
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/, "");
}

// ── Migration file writer ─────────────────────────────────────────────────────

function buildMigrationFileContent(pendingItems, description) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const header = [
    `-- Exercise Catalogue Admin Changes`,
    `-- Generated: ${ts}`,
    description ? `-- Description: ${description}` : null,
    `-- Changes: ${pendingItems.length}`,
    ``,
  ].filter(Boolean).join("\n");

  const body = pendingItems.map((item, i) =>
    `-- [${i + 1}] ${item.action}: ${item.exercise_id}\n${item.sql}`
  ).join("\n\n");

  return header + body + "\n";
}

function writeMigrationFile(content) {
  const filePath = join(MIGRATIONS_DIR, MIGRATION_FILE);
  const block = `\n\n-- ════════════════════════════════════════\n${content}`;
  try {
    if (existsSync(filePath)) {
      appendFileSync(filePath, block, "utf8");
    } else {
      writeFileSync(filePath, content, "utf8");
    }
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}


// ── Routes ────────────────────────────────────────────────────────────────────

// GET /admin/exercise-catalogue/full-state
adminExerciseCatalogueRouter.get("/exercise-catalogue/full-state", async (_req, res) => {
  try {
    const state = await getFullState();
    return res.json(state);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

// GET /admin/exercise-catalogue/equipment-slugs
adminExerciseCatalogueRouter.get("/exercise-catalogue/equipment-slugs", async (_req, res) => {
  try {
    const state = await getFullState();
    return res.json({ slugs: state.equipmentSlugs });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

// POST /admin/exercise-catalogue/preview-change
adminExerciseCatalogueRouter.post("/exercise-catalogue/preview-change", async (req, res) => {
  try {
    const { action, exercise_id, changes = {} } = req.body ?? {};
    if (!exercise_id) return res.status(400).json({ ok: false, error: "exercise_id required" });

    const state = await getFullState();
    const baseEx = state.exercises.find(e => e.exercise_id === exercise_id);
    if (!baseEx && action !== "clone") return res.status(404).json({ ok: false, error: "Exercise not found" });

    const baseExercises = state.exercises;
    let modifiedExercises;

    if (action === "archive") {
      modifiedExercises = baseExercises.map(e => e.exercise_id === exercise_id ? { ...e, is_archived: true } : e);
    } else if (action === "clone") {
      // changes is the new exercise object
      modifiedExercises = [...baseExercises, changes];
    } else {
      modifiedExercises = baseExercises.map(e => e.exercise_id === exercise_id ? { ...e, ...changes } : e);
    }

    const impact = computeImpact(baseExercises, modifiedExercises, state.presets, state.coverageGaps);
    const sql = action === "clone"
      ? buildInsertSql(changes)
      : buildEditSql(exercise_id, action === "archive" ? { is_archived: true } : changes);

    return res.json({ impact, sql_preview: sql });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

// POST /admin/exercise-catalogue/clone-preview
adminExerciseCatalogueRouter.post("/exercise-catalogue/clone-preview", async (req, res) => {
  try {
    const { source_exercise_id, new_exercise } = req.body ?? {};
    if (!source_exercise_id || !new_exercise) {
      return res.status(400).json({ ok: false, error: "source_exercise_id and new_exercise required" });
    }

    const state = await getFullState();
    const source = state.exercises.find(e => e.exercise_id === source_exercise_id);
    if (!source) return res.status(404).json({ ok: false, error: "Source exercise not found" });

    // Equipment inference from name
    const nameTokens = (new_exercise.name || "").toLowerCase().split(/\W+/).filter(Boolean);
    const slugByToken = new Map();
    for (const eq of state.equipmentSlugs) {
      for (const token of eq.name.toLowerCase().split(/\W+/).filter(Boolean)) {
        slugByToken.set(token, eq.slug);
      }
      slugByToken.set(eq.slug, eq.slug);
    }
    const detectedFromName = [...new Set(nameTokens.map(t => slugByToken.get(t)).filter(Boolean))];
    const sourceEq = source.equipment_items_slugs ?? [];
    const removedFromSource = sourceEq.filter(s => !detectedFromName.includes(s));
    const suggestedSlugs = detectedFromName.length > 0 ? detectedFromName : sourceEq;

    const fullNewExercise = {
      ...source,
      ...new_exercise,
      equipment_items_slugs: new_exercise.equipment_items_slugs ?? suggestedSlugs,
      equipment_json: new_exercise.equipment_json ?? suggestedSlugs,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const impact = computeImpact(
      state.exercises,
      [...state.exercises, fullNewExercise],
      state.presets,
      state.coverageGaps,
    );

    return res.json({
      equipment_inference: { detected_from_name: detectedFromName, removed_from_source: removedFromSource, suggested_slugs: suggestedSlugs },
      full_exercise: fullNewExercise,
      impact,
      sql_preview: buildInsertSql(fullNewExercise),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

// POST /admin/exercise-catalogue/validate-id
adminExerciseCatalogueRouter.post("/exercise-catalogue/validate-id", async (req, res) => {
  try {
    const { exercise_id } = req.body ?? {};
    if (!exercise_id) return res.status(400).json({ ok: false, error: "exercise_id required" });
    if (!/^[a-z0-9_]+$/.test(exercise_id)) {
      return res.json({ available: false, conflict: "exercise_id must match [a-z0-9_]+" });
    }
    const result = await pool.query("SELECT 1 FROM exercise_catalogue WHERE exercise_id = $1", [exercise_id]);
    const exists = (result.rows?.length ?? 0) > 0;
    return res.json({ available: !exists, conflict: exists ? `'${exercise_id}' already exists` : null });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

// POST /admin/exercise-catalogue/csv-import-dry-run
// Accepts CSV as text/plain body
adminExerciseCatalogueRouter.post("/exercise-catalogue/csv-import-dry-run", async (req, res) => {
  try {
    let csvText = "";
    if (typeof req.body === "string") {
      csvText = req.body;
    } else if (req.body?.csv) {
      csvText = req.body.csv;
    } else {
      return res.status(400).json({ ok: false, error: "Send CSV as text/plain body or {csv: '...'} JSON" });
    }

    const state = await getFullState();
    const validSlugs = new Set(state.equipmentSlugs.map(e => e.slug));
    const existingIds = new Set(state.exercises.map(e => e.exercise_id));

    const { headers, rows } = parseCsv(csvText);
    if (rows.length === 0) return res.status(400).json({ ok: false, error: "CSV is empty" });

    const requiredHeaders = ["exercise_id", "name", "movement_class", "movement_pattern_primary"];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length) {
      return res.status(400).json({ ok: false, error: `Missing required columns: ${missingHeaders.join(", ")}` });
    }

    const errors = [];
    const warnings = [];
    const seenIds = new Set();
    const validRows = [];

    for (const row of rows) {
      const lineErrors = [];

      // Required fields
      if (!row.exercise_id) lineErrors.push("exercise_id is required");
      else if (!/^[a-z0-9_]+$/.test(row.exercise_id)) lineErrors.push(`Invalid exercise_id format: '${row.exercise_id}'`);
      else if (seenIds.has(row.exercise_id)) lineErrors.push(`Duplicate exercise_id in file: '${row.exercise_id}'`);
      else seenIds.add(row.exercise_id);

      if (!row.name) lineErrors.push("name is required");
      if (!row.movement_class || !VALID_MOVEMENT_CLASSES.has(row.movement_class)) {
        lineErrors.push(`Invalid movement_class: '${row.movement_class}'`);
      }
      if (!row.movement_pattern_primary) lineErrors.push("movement_pattern_primary is required");

      // Rank
      if (row.min_fitness_rank !== undefined && row.min_fitness_rank !== "") {
        const r = Number(row.min_fitness_rank);
        if (!Number.isInteger(r) || r < 0 || r > 3) lineErrors.push(`min_fitness_rank must be 0–3, got '${row.min_fitness_rank}'`);
      }

      // Equipment slugs
      if (row.equipment_items_slugs) {
        const slugs = row.equipment_items_slugs.replace(/[{}[\]]/g, "").split(",").map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
        for (const sl of slugs) {
          if (!validSlugs.has(sl)) lineErrors.push(`Unknown equipment slug: '${sl}'`);
        }
      }

      // JSON fields
      for (const field of ["contraindications_json", "equipment_json", "preferred_in_json", "target_regions_json", "warmup_hooks"]) {
        if (row[field]) {
          try { JSON.parse(row[field]); } catch { lineErrors.push(`Invalid JSON in ${field}`); }
        }
      }

      // strength_primary_region
      if (row.strength_primary_region && !["upper", "lower", ""].includes(row.strength_primary_region)) {
        lineErrors.push(`strength_primary_region must be 'upper' or 'lower', got '${row.strength_primary_region}'`);
      }

      if (lineErrors.length) {
        for (const e of lineErrors) errors.push({ row: row._line, error: e });
      } else {
        if (existingIds.has(row.exercise_id)) {
          warnings.push({ row: row._line, message: `exercise_id '${row.exercise_id}' already exists — will be updated` });
        }
        validRows.push(row);
      }
    }

    if (errors.length > 0) {
      return res.json({
        ok: false,
        valid_rows: 0,
        errors,
        warnings,
        sql_preview: null,
        message: `Import rejected: ${errors.length} error(s). Fix all errors and re-upload.`,
      });
    }

    // Generate SQL
    const sqlStatements = validRows.map(row => {
      const toArr = v => (v ? v.replace(/[{}[\]]/g, "").split(",").map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean) : []);
      const toJson = v => { try { return JSON.parse(v || "[]"); } catch { return []; } };
      const ex = {
        exercise_id: row.exercise_id,
        name: row.name,
        movement_class: row.movement_class,
        movement_pattern_primary: row.movement_pattern_primary,
        min_fitness_rank: row.min_fitness_rank ? parseInt(row.min_fitness_rank, 10) : 0,
        is_archived: row.is_archived === "true" || row.is_archived === "True",
        is_loadable: row.is_loadable === "true" || row.is_loadable === "True",
        complexity_rank: row.complexity_rank ? parseInt(row.complexity_rank, 10) : null,
        contraindications_json: toJson(row.contraindications_json),
        contraindications_slugs: toArr(row.contraindications_slugs),
        density_rating: row.density_rating ? parseInt(row.density_rating, 10) : null,
        engine_anchor: row.engine_anchor === "true" || row.engine_anchor === "True",
        engine_role: row.engine_role || null,
        equipment_items_slugs: toArr(row.equipment_items_slugs),
        equipment_json: toJson(row.equipment_json),
        form_cues: row.form_cues || null,
        impact_level: row.impact_level ? parseInt(row.impact_level, 10) : null,
        lift_class: row.lift_class || null,
        preferred_in_json: toJson(row.preferred_in_json),
        swap_group_id_1: row.swap_group_id_1 || null,
        swap_group_id_2: row.swap_group_id_2 || null,
        target_regions_json: toJson(row.target_regions_json),
        warmup_hooks: toJson(row.warmup_hooks),
        slug: row.slug || null,
        creator: row.creator || null,
        strength_primary_region: row.strength_primary_region || null,
      };
      return buildInsertSql(ex);
    });

    return res.json({
      ok: true,
      valid_rows: validRows.length,
      errors: [],
      warnings,
      sql_preview: sqlStatements.join("\n\n"),
      message: `Ready to import ${validRows.length} row(s).`,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

// POST /admin/exercise-catalogue/session/queue-change
adminExerciseCatalogueRouter.post("/exercise-catalogue/session/queue-change", (req, res) => {
  try {
    const { action, exercise_id, changes = {}, sql: sqlOverride } = req.body ?? {};
    if (!action || !exercise_id) {
      return res.status(400).json({ ok: false, error: "action and exercise_id are required" });
    }
    // Generate SQL server-side if not provided by caller
    const sql = sqlOverride || (
      action === "new" || action === "clone"
        ? buildInsertSql(changes)
        : action === "archive"
          ? buildEditSql(exercise_id, { is_archived: true })
          : buildEditSql(exercise_id, changes)
    );
    _pending.push({ action, exercise_id, changes, sql, queued_at: new Date().toISOString() });

    const sessionSql = _pending.map((p, i) => `-- [${i + 1}] ${p.action}: ${p.exercise_id}\n${p.sql}`).join("\n\n");
    return res.json({ ok: true, pending_count: _pending.length, session_sql_preview: sessionSql });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

// GET /admin/exercise-catalogue/session/pending
adminExerciseCatalogueRouter.get("/exercise-catalogue/session/pending", (_req, res) => {
  const sessionSql = _pending.map((p, i) => `-- [${i + 1}] ${p.action}: ${p.exercise_id}\n${p.sql}`).join("\n\n");
  return res.json({ pending_count: _pending.length, items: _pending, session_sql: sessionSql });
});

// POST /admin/exercise-catalogue/session/clear
adminExerciseCatalogueRouter.post("/exercise-catalogue/session/clear", (_req, res) => {
  _pending.length = 0;
  return res.json({ ok: true, pending_count: 0 });
});

// POST /admin/exercise-catalogue/session/generate-migration
adminExerciseCatalogueRouter.post("/exercise-catalogue/session/generate-migration", (req, res) => {
  try {
    if (_pending.length === 0) {
      return res.status(400).json({ ok: false, error: "No pending changes to commit" });
    }
    const { description } = req.body ?? {};
    const content = buildMigrationFileContent(_pending, description);
    const writeResult = writeMigrationFile(content);

    invalidateCache();
    const sql = content;
    _pending.length = 0;

    return res.json({
      ok: true,
      filename: MIGRATION_FILE,
      path: writeResult.filePath ?? null,
      write_succeeded: writeResult.ok,
      write_error: writeResult.error ?? null,
      sql,
      message: writeResult.ok
        ? `Migration file written: ${MIGRATION_FILE}`
        : `File write failed (${writeResult.error}) — copy the SQL below and save manually.`,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

// GET /admin/exercise-catalogue/recommendations
adminExerciseCatalogueRouter.get("/exercise-catalogue/recommendations", async (_req, res) => {
  try {
    const state = await getFullState();
    const recommendations = runRecommendations(state.exercises, state.presets, state.coverageGaps);
    return res.json({ recommendations });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

// GET /admin/exercise-catalogue/catalogue-health
adminExerciseCatalogueRouter.get("/exercise-catalogue/catalogue-health", async (_req, res) => {
  try {
    const state = await getFullState();
    const health = runHealthDiagnostics(state.exercises, state.presets, state.slots);
    return res.json(health);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Internal server error" });
  }
});

// POST /admin/exercise-catalogue/generate-id
adminExerciseCatalogueRouter.post("/exercise-catalogue/generate-id", (req, res) => {
  const { name } = req.body ?? {};
  if (!name) return res.status(400).json({ ok: false, error: "name required" });
  return res.json({ exercise_id: generateExerciseId(name) });
});
