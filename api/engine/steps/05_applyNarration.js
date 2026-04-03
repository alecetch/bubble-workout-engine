// api/engine/steps/05_applyNarration.js
//
// DROP-IN REPLACEMENT (Node pipeline step)
// - Deterministic template-driven narration enrichment for hypertrophy segmented programs
// - Enriches BOTH:
//   * program.days (template)
//   * program.weeks[w].days (if present)
// - Optionally inserts warmup/cooldown segments into day.segments (idempotent)
//
// Updates vs your current version:
// ✅ Splits adoption counters into template vs weeks (and totals)
// ✅ Mirrors Step 4: week-by-week adoption summary (per-week counters)
// ✅ Leaves program output shape unchanged (only debug becomes richer)
//
// Inputs:
// - program (required) => segmented + rep-rule enriched program
// - narrationTemplatesJson (required) => CatalogBuild.v3 narration_json (array or {rows:[...]} or {data:[...]})
// - programGenerationConfigJson (optional) => ProgramGenerationConfig JSON (contains progression_by_rank_json, week_phase_config_json, total_weeks_default)
// - fitnessRank (optional) => 1..4
// - programLength (optional) => overrides narration week count ONLY if program.weeks not present
// - catalogJson (optional) => Catalog JSON { ex:[{id, warmup_hooks, ...}, ...] }
// - cooldownSeconds (optional) => copy only (emitter handles timing)

function deepClone(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj ?? {}));
}

function s(v) {
  return v === null || v === undefined ? "" : String(v);
}
function toInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
function isObj(o) {
  return !!o && typeof o === "object" && !Array.isArray(o);
}
function safeJsonParse(x, fallback) {
  try {
    if (x === null || x === undefined) return fallback;
    if (typeof x === "object") return x;
    const t = String(x).trim();
    if (!t) return fallback;
    return JSON.parse(t);
  } catch {
    return fallback;
  }
}

// Fix common mojibake sequences (Bubble sometimes shows â€“ / â€™ etc)
function deMojibake(str) {
  const t = s(str);
  if (!t) return "";
  return t
    .replace(/â€“|–/g, "–")
    .replace(/â€”|—/g, "—")
    .replace(/â€™|’/g, "’")
    .replace(/â€œ|“/g, "“")
    .replace(/â€�|”/g, "”")
    .replace(/â€¦|…/g, "…")
    .replace(/Â/g, "");
}

// FNV-1a hash (fast, deterministic)
function hash32(str) {
  let h = 2166136261;
  str = s(str);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}
function pickFromPool(poolArr, keyStr) {
  if (!Array.isArray(poolArr) || poolArr.length === 0) return "";
  const idx = hash32(keyStr) % poolArr.length;
  return s(poolArr[idx]);
}

// Basic string template replacement: {TOKEN}
function applyTokens(text, tokens) {
  let out = s(text);
  if (!out) return "";
  for (const k of Object.keys(tokens || {})) {
    const re = new RegExp("\\{" + k + "\\}", "g");
    out = out.replace(re, s(tokens[k]));
  }
  return deMojibake(out);
}

// Try to shorten tempo string for UI copy.
// Accepts "3-0-1-0" -> "3-0-1"
function tempoShort(tempoStr) {
  const t = s(tempoStr);
  if (!t) return "";
  const parts = t
    .split("-")
    .map((x) => s(x).trim())
    .filter(Boolean);
  if (parts.length >= 3) return `${parts[0]}-${parts[1]}-${parts[2]}`;
  return t;
}

// Purpose defaults (fallback only)
function defaultRepRangeForPurpose(purpose) {
  if (purpose === "main") return "6–10";
  if (purpose === "secondary") return "8–12";
  return "10–15";
}
function defaultRestForSegType(segType, cfg) {
  if (segType === "superset") return cfg.default_rest_sec_superset;
  if (segType === "giant_set") return cfg.default_rest_sec_giant_set;
  return cfg.default_rest_sec_single;
}

// Build a stable “day focus” label from main lift slot
function dayFocusFromDay(day) {
  if (day && day.day_focus) return day.day_focus;
  const segs = day && day.segments ? day.segments : [];
  let main = null;
  for (let i = 0; i < segs.length; i++) {
    if (segs[i] && s(segs[i].purpose) === "main") {
      main = segs[i];
      break;
    }
  }
  let slot = "";
  if (main && Array.isArray(main.items) && main.items[0] && main.items[0].slot) slot = s(main.items[0].slot);

  if (slot.includes("squat")) return "Lower (Squat)";
  if (slot.includes("hinge")) return "Lower (Hinge)";
  if (slot.includes("push_horizontal")) return "Upper (Push)";
  if (slot.includes("pull_horizontal")) return "Upper (Pull)";
  if (slot.includes("push_vertical")) return "Upper (Press)";
  if (slot.includes("pull_vertical")) return "Upper (Pull)";
  return "Hypertrophy";
}

function segmentLetterFromSegment(seg) {
  const firstSlot = s(seg?.items?.[0]?.slot);
  if (!firstSlot) return "";
  return s(firstSlot.split(":")[0]).trim();
}

// ---------------- template indexing ----------------
// Expects rows like:
// { template_id, scope, field, purpose, segment_type, priority, text_pool_json }
function normalizeTemplates(raw) {
  let arr = raw;

  if (!Array.isArray(arr) && arr && typeof arr === "object") {
    if (Array.isArray(arr.rows)) arr = arr.rows;
    else if (Array.isArray(arr.data)) arr = arr.data;
    else arr = [];
  }
  if (!Array.isArray(arr)) arr = [];

  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i] || {};
    const applies = safeJsonParse(r.applies_json, null);
    let pool = safeJsonParse(r.text_pool_json, null);
    if (!Array.isArray(pool)) pool = [];
    out.push({
      template_id: s(r.template_id),
      scope: s(r.scope),
      field: s(r.field),
      purpose: s(r.purpose),
      segment_type: s(r.segment_type),
      applies_program_type: isObj(applies) ? s(applies.program_type) : "",
      applies_day_focus: isObj(applies) ? s(applies.day_focus) : "",
      applies_phase: isObj(applies) ? s(applies.phase) : "",
      // Note: Bubble uses "lower number is higher priority" in tie-breaking. Keep that.
      priority: toInt(r.priority, 1),
      pool,
    });
  }
  return out;
}

// Select templates by (scope, field, purpose?, segment_type?) with fallback.
function findTemplatePool(templates, scope, field, purpose, segment_type, matchCtx) {
  scope = s(scope);
  field = s(field);
  purpose = s(purpose);
  segment_type = s(segment_type);
  const programType = s(matchCtx?.program_type);
  const dayFocus = s(matchCtx?.day_focus);
  const phase = s(matchCtx?.phase);
  let best = null;

  function consider(t, score) {
    if (!best || score > best.score) best = { t, score };
    else if (best && score === best.score) {
      // lower priority number wins
      if (t.priority < best.t.priority) best = { t, score };
    }
  }

  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    if (!t) continue;
    if (t.scope !== scope) continue;
    if (t.field !== field) continue;

    const hasProgramType = !!t.applies_program_type;
    const hasDayFocus = !!t.applies_day_focus;
    const hasPhase = !!t.applies_phase;
    if (hasProgramType && t.applies_program_type !== programType) continue;
    if (hasDayFocus && t.applies_day_focus !== dayFocus) continue;
    if (hasPhase && t.applies_phase !== phase) continue;

    let score = 1;
    const hasP = !!t.purpose;
    const hasS = !!t.segment_type;

    if (purpose && hasP && t.purpose === purpose) score += 4;
    else if (hasP) score -= 1;

    if (segment_type && hasS && t.segment_type === segment_type) score += 4;
    else if (hasS) score -= 1;

    if (purpose && segment_type && t.purpose === purpose && t.segment_type === segment_type) score += 10;
    if (hasProgramType) score += 3;
    if (hasDayFocus) score += 3;
    if (hasPhase) score += 3;

    consider(t, score);
  }

  return best ? best.t.pool : [];
}

// ---------------- catalog index for warmup_hooks ----------------
function buildCatalogIndex(cat) {
  const byId = Object.create(null);
  if (!cat || !Array.isArray(cat.ex)) return byId;
  for (const ex of cat.ex) {
    if (ex && ex.id) byId[String(ex.id)] = ex;
  }
  return byId;
}
function readWarmupHooksForEx(byId, exId) {
  if (!byId || !exId) return [];
  const ex = byId[String(exId)];
  if (!ex) return [];
  const wh = ex.warmup_hooks || ex.wh;
  if (!wh) return [];
  const arr = safeJsonParse(wh, null);
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const v0 of arr) {
    const v = s(v0).trim();
    if (v) out.push(v);
  }
  return out;
}

// ---------------- cooldown from warmup hooks (deterministic) ----------------
function uniq(arr) {
  const seen = Object.create(null);
  const out = [];
  for (const v0 of arr || []) {
    const k = s(v0);
    if (!k) continue;
    if (seen[k]) continue;
    seen[k] = true;
    out.push(k);
  }
  return out;
}
function hasAny(arr, key) {
  for (const v of arr || []) if (s(v) === key) return true;
  return false;
}
function pickFirstPresent(arr, prefs) {
  for (const p of prefs) if (hasAny(arr, p)) return p;
  return "";
}
function cooldownStepForTag(tag) {
  tag = s(tag);
  if (!tag) return "";

  if (tag === "general_heat") return "2:00 easy flush (walk/bike/row) + slow nasal breathing.";
  if (tag === "ankles") return "Ankles: 60s rocks + 30s calf stretch per side.";
  if (tag === "calf_pump") return "Calves: 60–90s gentle stretch + ankle circles.";
  if (tag === "hips") return "Hips: 60s hip flexor stretch + 60s 90/90 switches.";
  if (tag === "hamstrings") return "Hamstrings: 60–90s gentle hinge stretch (no pain).";
  if (tag === "t_spine") return "T-spine: 60s open books + 30–60s thoracic extension over foam roller.";
  if (tag === "shoulders") return "Shoulders: 60s doorway pec stretch + 30–60s shoulder CARs.";
  if (tag === "elbows_wrists") return "Wrists/forearms: 60s flexor/extensor stretch + shake out.";
  if (tag === "brace") return "Breathing reset: 60–90s crocodile or 90/90 breathing.";
  if (tag === "grip_prep") return "Grip: 60s forearm stretch + hands shake out.";
  if (tag === "pump") return "Shakeout: 60–90s easy flush + light stretch where tight.";
  if (tag === "scap_push") return "Scap/pec: 60s pec stretch + 30–60s wall slides.";
  if (tag === "scap_pull") return "Upper back: 60s lat/pec stretch + 30–60s gentle hangs (optional).";
  if (tag === "scap_up") return "Shoulder blades: 60s wall slides + 30–60s deep breathing.";
  if (tag === "lat_engage") return "Lats: 60s lat stretch per side + slow breathing.";

  if (tag === "squat_pattern") return "Squat restore: 60s deep squat hold (comfortable) + breathing.";
  if (tag === "hinge_pattern") return "Hinge restore: 60s child’s pose + 60s hamstring floss.";
  if (tag === "lunge_pattern") return "Lunge restore: 60s hip flexor + 60s adductor rock-backs.";

  return "";
}
function buildCooldownStepsFromHooks(hooks) {
  hooks = uniq(hooks || []);
  if (!hooks.length) {
    return uniq([
      "2:00 easy flush (walk/bike/row) + slow nasal breathing.",
      "Breathing reset: 60–90s crocodile or 90/90 breathing.",
    ]);
  }

  const steps = [];
  steps.push(cooldownStepForTag("general_heat"));

  const preferred = [];
  const lowerPick = pickFirstPresent(hooks, ["hips", "hamstrings", "ankles", "calf_pump"]);
  const upperPick = pickFirstPresent(hooks, [
    "t_spine",
    "shoulders",
    "scap_pull",
    "scap_push",
    "scap_up",
    "lat_engage",
    "elbows_wrists",
  ]);
  const bracePick = hasAny(hooks, "brace") ? "brace" : "";

  if (lowerPick) preferred.push(lowerPick);
  if (upperPick) preferred.push(upperPick);
  if (bracePick) preferred.push(bracePick);

  if (hasAny(hooks, "pump") && preferred.length) preferred[preferred.length - 1] = "pump";
  else if (hasAny(hooks, "pump") && !preferred.length) preferred.push("pump");

  for (let i = 0; i < preferred.length && steps.length < 3; i++) {
    const st = cooldownStepForTag(preferred[i]);
    if (st) steps.push(st);
  }

  if (steps.length < 2) steps.push(cooldownStepForTag("brace"));

  return uniq(steps);
}

// ---------------- week-phase engine (deterministic) ----------------
function rankKeyFromFitnessRank(rank) {
  rank = toInt(rank, 1);
  if (rank === 1) return "beginner";
  if (rank === 2) return "intermediate";
  if (rank === 3) return "advanced";
  if (rank === 4) return "elite";
  return "beginner";
}
function getProgressionRule(progByRank, rankKey) {
  const obj = safeJsonParse(progByRank, null);
  const o = isObj(obj) ? obj : {};
  const r = o[rankKey] || {};
  return {
    weekly_set_step: toInt(r.weekly_set_step, 0),
    max_extra_sets: toInt(r.max_extra_sets, 0),
  };
}
function buildPhaseSequence(weekCfg, totalWeeks) {
  totalWeeks = Math.max(1, toInt(totalWeeks, 4));
  weekCfg = isObj(weekCfg) ? weekCfg : {};

  let seq = Array.isArray(weekCfg.default_phase_sequence) ? weekCfg.default_phase_sequence.slice() : [];
  if (!seq.length) seq = ["BASELINE", "BUILD", "BUILD", "CONSOLIDATE"];

  const out = [];
  for (let i = 0; i < totalWeeks; i++) {
    if (i < seq.length) out.push(s(seq[i]));
    else out.push(s(seq[seq.length - 1] || "BUILD"));
  }

  const lastMode = s(weekCfg.last_week_mode).toLowerCase();
  if (lastMode === "consolidate") out[out.length - 1] = "CONSOLIDATE";
  else if (lastMode === "deload") out[out.length - 1] = "DELOAD";

  return out;
}
function phaseLabel(weekCfg, phase) {
  const labels = weekCfg && weekCfg.phase_labels ? weekCfg.phase_labels : null;
  if (isObj(labels) && Object.prototype.hasOwnProperty.call(labels, phase)) return s(labels[phase]);
  return phase;
}
function phaseCopy(weekCfg, phase) {
  const copy = weekCfg && weekCfg.copy ? weekCfg.copy : null;
  if (isObj(copy) && isObj(copy[phase])) {
    return { focus: s(copy[phase].focus), notes: s(copy[phase].notes) };
  }
  return { focus: "", notes: "" };
}
function buildDeterministicProgressionBlurb(totalWeeks, phaseSeq, progRule, weekCfg) {
  totalWeeks = Math.max(1, toInt(totalWeeks, 4));
  const step = toInt(progRule.weekly_set_step, 0);
  const maxExtra = toInt(progRule.max_extra_sets, 0);

  const buildWeeks = [];
  for (let i = 0; i < phaseSeq.length; i++) {
    if (s(phaseSeq[i]).toUpperCase() === "BUILD") buildWeeks.push(i + 1);
  }

  const endMode = s(phaseSeq[phaseSeq.length - 1]).toUpperCase();
  const endLabel = phaseLabel(weekCfg, endMode);

  const a = [];
  if (step > 0 && maxExtra > 0) {
    if (buildWeeks.length >= 2) {
      a.push(`Weeks ${buildWeeks[0]}–${buildWeeks[buildWeeks.length - 1]} add ${step} set per key lift per week (cap +${maxExtra}).`);
    } else if (buildWeeks.length === 1) {
      a.push(`Week ${buildWeeks[0]} adds ${step} set per key lift (cap +${maxExtra}).`);
    } else {
      a.push("Progress by adding reps first, then small load increases.");
    }
  } else {
    a.push("Progress by adding reps first, then small load increases.");
  }

  if (totalWeeks >= 2) {
    if (endMode === "CONSOLIDATE") a.push(`Final week is ${endLabel}: slightly reduce volume while keeping intensity steady.`);
    else if (endMode === "DELOAD") a.push(`Final week is ${endLabel}: reduce volume to prioritize recovery.`);
    else a.push(`Final week emphasizes ${endLabel}.`);
  }

  return deMojibake(a.join(" "));
}

// ---------------- adoption counters (split + merge) ----------------
function makeCounters() {
  return {
    used_item_reps_prescribed: 0,
    used_item_rir_target: 0,
    used_item_tempo_prescribed: 0,
    used_segment_rest_after_set_sec: 0,
    week_engine_used: 0,
    week_templates_used: 0,
    warmup_hooks_found_days: 0,
    warmup_segment_added_days: 0,
    cooldown_segment_added_days: 0,
  };
}
function addCounters(a, b) {
  const out = makeCounters();
  for (const k of Object.keys(out)) out[k] = (a?.[k] ?? 0) + (b?.[k] ?? 0);
  return out;
}

// ---------------- core: enrich only a "days[]" array ----------------
function enrichDays(days, templates, cfg, catalogById, context) {
  const duration = toInt(context.duration_mins, 0) || 0;
  const dpw = toInt(context.days_per_week, days.length) || days.length || 0;
  const matchBase = { program_type: s(context.program_type) };

  const debugCounters = context.debugCounters;

  // Program-level tokens (stable)
  const rankKey = rankKeyFromFitnessRank(cfg.fitness_rank);
  const progRule = getProgressionRule(cfg.progression_by_rank_json, rankKey);

  // NOTE: phaseSeq is not used directly by day/seg/item narration here,
  // but we keep it computed to stay consistent (and future-proof).
  const weekCfgRaw = safeJsonParse(cfg.week_phase_config_json, null);
  const weekCfg = isObj(weekCfgRaw) ? weekCfgRaw : {};
  const phaseSeq = buildPhaseSequence(weekCfg, context.totalWeeks);

  const baseTokens = {
    DAYS_PER_WEEK: dpw,
    DURATION_MINS: duration,
    RIR: cfg.default_rir,
    TOTAL_WEEKS: context.totalWeeks,
    FITNESS_RANK: toInt(cfg.fitness_rank, 1),
    FITNESS_LEVEL: rankKey,
    WEEKLY_SET_STEP: progRule.weekly_set_step,
    MAX_EXTRA_SETS: progRule.max_extra_sets,
  };

  // Day templates pools (pulled once; deterministic pickFromPool handles variation)
  for (let d = 0; d < days.length; d++) {
    const day = days[d];
    if (!day) continue;

    const dayIdx = toInt(day.day_index, d + 1);

    // Find main & secondary + main ex_id (for warmup_hooks)
    let mainName = "";
    let secondaryName = "";
    let mainExId = "";
    for (let si = 0; si < (day.segments || []).length; si++) {
      const seg = day.segments[si] || {};
      const purp = s(seg.purpose);
      if (!Array.isArray(seg.items) || !seg.items.length) continue;
      const nm = s(seg.items[0].ex_name);
      const exId = s(seg.items[0].ex_id);
      if (purp === "main" && !mainName) {
        mainName = nm;
        mainExId = exId;
      }
      if (purp === "secondary" && !secondaryName) secondaryName = nm;
    }

    const dayFocus = dayFocusFromDay(day);
    const matchCtx = { ...matchBase, day_focus: dayFocus };

    const dayTokens = {
      ...baseTokens,
      DAY_INDEX: dayIdx,
      DAY_FOCUS: dayFocus,
      PROGRAM_TYPE: s(context.program_type),
      MAIN_LIFT_NAME: mainName,
      SECONDARY_LIFT_NAME: secondaryName,
    };

    const dayKey = `day|${dayIdx}|${dayFocus}|${duration}|${context.totalWeeks}|${rankKey}`;
    const dayTitlePool = findTemplatePool(templates, "day", "DAY_TITLE", "", "", matchCtx);
    const dayGoalPool = findTemplatePool(templates, "day", "DAY_GOAL", "", "", matchCtx);
    const timeHintPool = findTemplatePool(templates, "day", "TIME_BUDGET_HINT", "", "", matchCtx);
    const warmTitlePool = findTemplatePool(templates, "day", "WARMUP_TITLE", "", "", matchCtx);
    const warmHeatPool = findTemplatePool(templates, "day", "WARMUP_GENERAL_HEAT", "", "", matchCtx);
    const warmRampPool = findTemplatePool(templates, "day", "RAMP_SETS_TEXT", "", "", matchCtx);
    const cuePool = findTemplatePool(templates, "exercise", "CUE_LINE", "", "", matchCtx);
    const loadPool = findTemplatePool(templates, "exercise", "LOAD_HINT", "", "", matchCtx);
    const logPool = findTemplatePool(templates, "exercise", "LOGGING_PROMPT", "", "", matchCtx);

    day.narration = day.narration || {};
    day.narration.day_title = applyTokens(pickFromPool(dayTitlePool, `${dayKey}|title`), dayTokens);
    day.narration.day_goal = applyTokens(pickFromPool(dayGoalPool, `${dayKey}|goal`), dayTokens);
    day.narration.time_hint = applyTokens(pickFromPool(timeHintPool, `${dayKey}|time`), dayTokens);

    day.narration.warmup = {
      title: applyTokens(pickFromPool(warmTitlePool, `${dayKey}|wu_title`), dayTokens),
      general_heat: applyTokens(pickFromPool(warmHeatPool, `${dayKey}|wu_heat`), dayTokens),
      ramp_sets: applyTokens(pickFromPool(warmRampPool, `${dayKey}|wu_ramp`), dayTokens),
    };

    // Warmup hooks (optional)
    let hooks = [];
    if (mainExId && catalogById) {
      hooks = uniq(readWarmupHooksForEx(catalogById, mainExId));
      if (hooks.length) debugCounters.warmup_hooks_found_days += 1;
      day.narration.warmup.hooks_json = JSON.stringify(hooks);
    } else {
      day.narration.warmup.hooks_json = "[]";
    }

    // Cooldown derived from hooks
    const cdSteps = buildCooldownStepsFromHooks(hooks);
    day.narration.cooldown = {
      title: "Cool-down: downshift + restore",
      steps_text: cdSteps.join("\n"),
    };

    // Segments + Items narration
    for (let sidx = 0; sidx < (day.segments || []).length; sidx++) {
      const seg2 = day.segments[sidx] || {};
      const purpose = s(seg2.purpose);
      const segType = s(seg2.segment_type);
      const segmentIndex = toInt(seg2.segment_index, sidx + 1);
      const segmentLetter = segmentLetterFromSegment(seg2);
      const rounds = toInt(seg2.rounds, 1);

      // Rest
      let restSec = toInt(seg2.rest_after_set_sec, 0);
      if (restSec > 0) debugCounters.used_segment_rest_after_set_sec += 1;
      else restSec = defaultRestForSegType(segType, cfg);

      const segTokens = {
        PURPOSE: purpose,
        SEGMENT_TYPE: segType,
        SEGMENT_INDEX: segmentIndex,
        SEGMENT_LETTER: segmentLetter,
        ROUNDS: rounds,
        REST_SEC: restSec,
      };
      const segKey = `seg|${dayIdx}|${purpose}|${segType}|${sidx}`;

      const segTitlePool = findTemplatePool(templates, "segment", "SEGMENT_TITLE", purpose, segType, matchCtx);
      const segExecPool = findTemplatePool(templates, "segment", "SEGMENT_EXECUTION", "", segType, matchCtx);
      const segIntentPool = findTemplatePool(templates, "segment", "SEGMENT_INTENT", purpose, "", matchCtx);

      seg2.narration = seg2.narration || {};
      seg2.narration.title = applyTokens(pickFromPool(segTitlePool, `${segKey}|title`), segTokens);
      seg2.narration.execution = applyTokens(pickFromPool(segExecPool, `${segKey}|exec`), segTokens);
      seg2.narration.intent = applyTokens(pickFromPool(segIntentPool, `${segKey}|intent`), segTokens);

      const setupPool = findTemplatePool(templates, "transition", "SETUP_NOTE", "", segType, matchCtx);
      const transPool = findTemplatePool(templates, "transition", "TRANSITION_NOTE", "", segType, matchCtx);
      const pacePool = findTemplatePool(templates, "transition", "PACE_NOTE", "", "", matchCtx);

      seg2.narration.setup_note = applyTokens(pickFromPool(setupPool, `${segKey}|setup`), segTokens);
      seg2.narration.transition_note = applyTokens(pickFromPool(transPool, `${segKey}|transition`), segTokens);
      seg2.narration.pace_note = applyTokens(pickFromPool(pacePool, `${segKey}|pace`), segTokens);

      const items = Array.isArray(seg2.items) ? seg2.items : [];
      for (let ii = 0; ii < items.length; ii++) {
        const it = items[ii] || {};
        const exName = s(it.ex_name);
        const sets = toInt(it.sets, 0);

        let repRange = s(it.reps_prescribed);
        if (repRange) debugCounters.used_item_reps_prescribed += 1;
        else repRange = defaultRepRangeForPurpose(purpose);

        let rir = s(it.rir_target);
        if (rir !== "") debugCounters.used_item_rir_target += 1;
        else rir = cfg.default_rir;

        let tempo = s(it.tempo_prescribed);
        if (tempo) debugCounters.used_item_tempo_prescribed += 1;
        else tempo = cfg.default_tempo;

        const tempo_short = tempoShort(tempo) || tempo;
        const itRest = toInt(it.rest_after_set_sec, 0) || restSec;

        const exTokens = {
          EX_NAME: exName,
          SETS: sets,
          REP_RANGE: repRange,
          RIR: rir,
          TEMPO: tempo,
          TEMPO_SHORT: tempo_short,
          REST_SEC: itRest,
          CUE_1: "brace and stay tight",
          CUE_2: "control the eccentric",
        };

        const exKey = `ex|${dayIdx}|${purpose}|${segType}|${exName}|${ii}`;

        const exLinePool = findTemplatePool(templates, "exercise", "EXERCISE_LINE", purpose, "", matchCtx);
        it.narration = it.narration || {};
        it.narration.line = applyTokens(pickFromPool(exLinePool, `${exKey}|line`), exTokens);
        it.narration.cues = applyTokens(pickFromPool(cuePool, `${exKey}|cues`), exTokens);
        it.narration.load_hint = applyTokens(pickFromPool(loadPool, `${exKey}|load`), exTokens);
        it.narration.log_prompt = applyTokens(pickFromPool(logPool, `${exKey}|log`), exTokens);
      }
    }

    // Insert warmup/cooldown segments idempotently
    day.segments = Array.isArray(day.segments) ? day.segments : [];
    let hasWarmSeg = false;
    let hasCoolSeg = false;
    for (const seg of day.segments) {
      const st = s(seg && seg.segment_type);
      if (st === "warmup") hasWarmSeg = true;
      if (st === "cooldown") hasCoolSeg = true;
    }

    if (!hasWarmSeg) {
      const warmSeg = {
        segment_index: 0,
        segment_type: "warmup",
        purpose: "warmup",
        rounds: 1,
        items: [],
        narration: {
          title: day.narration.warmup?.title || "Warm-up",
          execution:
            (day.narration.warmup?.general_heat || "") +
            (day.narration.warmup?.ramp_sets ? "\n" + day.narration.warmup.ramp_sets : ""),
          intent: "Prep joints and pattern the first lift.",
          setup_note: "Keep it easy—save intensity for work sets.",
          transition_note: "Start your first work set when breathing is steady.",
          pace_note: "Smooth reps; don’t rush the ramp.",
        },
      };
      day.segments.unshift(warmSeg);
      debugCounters.warmup_segment_added_days += 1;
    }

    if (!hasCoolSeg) {
      let maxIdx = 0;
      for (const seg of day.segments) {
        const si2 = toInt(seg && seg.segment_index, 0);
        if (si2 > maxIdx) maxIdx = si2;
      }
      const cd = day.narration?.cooldown || null;

      const coolSeg = {
        segment_index: maxIdx + 1,
        segment_type: "cooldown",
        purpose: "cooldown",
        rounds: 1,
        items: [],
        narration: {
          title: cd?.title || "Cool-down",
          execution: cd?.steps_text || "2:00 easy flush + 60–90s breathing reset.",
          intent: "Downshift, restore range, and leave feeling better than you started.",
          setup_note: "Choose the tightest areas—keep it calming.",
          transition_note: "Stop if anything feels sharp or pinchy.",
          pace_note: "Slow breathing, low effort.",
        },
      };
      day.segments.push(coolSeg);
      debugCounters.cooldown_segment_added_days += 1;
    }
  }

  return { phaseSeq };
}

function buildProgramNarration(p, templates, cfg, totalWeeks) {
  const duration = toInt(p.duration_mins, 0) || 0;
  const dpw = toInt(p.days_per_week, (p.days || []).length) || (p.days || []).length || 0;

  const rankKey = rankKeyFromFitnessRank(cfg.fitness_rank);
  const progRule = getProgressionRule(cfg.progression_by_rank_json, rankKey);
  const weekCfgRaw = safeJsonParse(cfg.week_phase_config_json, null);
  const weekCfg = isObj(weekCfgRaw) ? weekCfgRaw : {};
  const phaseSeq = buildPhaseSequence(weekCfg, totalWeeks);

  const baseTokens = {
    DAYS_PER_WEEK: dpw,
    DURATION_MINS: duration,
    RIR: cfg.default_rir,
    TOTAL_WEEKS: totalWeeks,
    FITNESS_RANK: toInt(cfg.fitness_rank, 1),
    FITNESS_LEVEL: rankKey,
    WEEKLY_SET_STEP: progRule.weekly_set_step,
    MAX_EXTRA_SETS: progRule.max_extra_sets,
  };
  const baseMatchCtx = { program_type: s(cfg.program_type) };

  const progTitlePool = findTemplatePool(templates, "program", "PROGRAM_TITLE", "", "", baseMatchCtx);
  const progSummaryPool = findTemplatePool(templates, "program", "PROGRAM_SUMMARY", "", "", baseMatchCtx);
  const progProgPool = findTemplatePool(templates, "program", "PROGRESSION_BLURB", "", "", baseMatchCtx);
  const progSafetyPool = findTemplatePool(templates, "program", "SAFETY_BLURB", "", "", baseMatchCtx);

  const programKey = `program|${dpw}|${duration}|${totalWeeks}|${rankKey}`;

  const program_title = applyTokens(pickFromPool(progTitlePool, `${programKey}|title`), baseTokens);
  const program_summary = applyTokens(pickFromPool(progSummaryPool, `${programKey}|summary`), baseTokens);

  const deterministicProg = buildDeterministicProgressionBlurb(totalWeeks, phaseSeq, progRule, weekCfg);
  const progression_blurb =
    deterministicProg || applyTokens(pickFromPool(progProgPool, `${programKey}|progression`), baseTokens);

  const safety_blurb = applyTokens(pickFromPool(progSafetyPool, `${programKey}|safety`), baseTokens);

  // Weeks narration
  const weeksOut = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const phase = s(phaseSeq[w - 1] || "");
    const label = phaseLabel(weekCfg, phase);
    const cpy = phaseCopy(weekCfg, phase);

    const weekTokens = {
      WEEK_INDEX: w,
      TOTAL_WEEKS: totalWeeks,
      PHASE: phase,
      PHASE_LABEL: label,
      FITNESS_LEVEL: rankKey,
      WEEKLY_SET_STEP: progRule.weekly_set_step,
      MAX_EXTRA_SETS: progRule.max_extra_sets,
      DEFAULT_FOCUS: cpy.focus,
      DEFAULT_NOTES: cpy.notes,
    };

    const wkKey = `week|${w}|${phase}|${rankKey}|${totalWeeks}`;
    const weekMatchCtx = { ...baseMatchCtx, phase };

    const weekTitlePoolForPhase = findTemplatePool(templates, "week", "WEEK_TITLE", "", "", weekMatchCtx);
    const weekFocusPoolForPhase = findTemplatePool(templates, "week", "WEEK_FOCUS", "", "", weekMatchCtx);
    const weekNotesPoolForPhase = findTemplatePool(templates, "week", "WEEK_NOTES", "", "", weekMatchCtx);

    let wkTitle = applyTokens(pickFromPool(weekTitlePoolForPhase, `${wkKey}|title`), weekTokens);
    let wkFocus = applyTokens(pickFromPool(weekFocusPoolForPhase, `${wkKey}|focus`), weekTokens);
    let wkNotes = applyTokens(pickFromPool(weekNotesPoolForPhase, `${wkKey}|notes`), weekTokens);

    if (!wkTitle && label) wkTitle = `Week ${w}: ${label}`;
    if (!wkFocus) wkFocus = cpy.focus;
    if (!wkNotes) wkNotes = cpy.notes;

    weeksOut.push({
      week_index: w,
      phase,
      phase_label: label,
      title: wkTitle,
      focus: wkFocus,
      notes: wkNotes,
    });
  }

  return {
    narration: {
      program: { title: program_title, summary: program_summary, progression: progression_blurb, safety: safety_blurb },
      weeks: weeksOut,
    },
    week_engine: {
      total_weeks: totalWeeks,
      fitness_rank: toInt(cfg.fitness_rank, 1),
      fitness_level: rankKey,
      progression_rule: progRule,
      phase_sequence: phaseSeq,
    },
  };
}

export async function applyNarration({
  program,
  narrationTemplates,
  narrationTemplatesJson,
  narrationSource,
  programGenerationConfigJson,
  fitnessRank,
  programLength,
  catalogJson,
  cooldownSeconds, // copy only for future; not used in engine right now
}) {
  if (!program) throw new Error("applyNarration: missing program");

  const p0 = deepClone(program);

  let templatesRaw = null;
  let source = narrationSource || "json";
  if (Array.isArray(narrationTemplates) && narrationTemplates.length > 0) {
    templatesRaw = narrationTemplates;
    if (!narrationSource) source = "db";
  } else if (narrationTemplatesJson) {
    templatesRaw = safeJsonParse(narrationTemplatesJson, null);
    source = narrationSource || "json";
  } else {
    return {
      program: p0,
      debug: {
        ok: false,
        source: narrationSource || "hardcoded",
        error: "No narration templates available",
      },
    };
  }

  const templates = normalizeTemplates(templatesRaw);
  if (!templates.length) {
    return {
      program: p0,
      debug: {
        ok: false,
        source,
        error: "No templates found in narration template source",
      },
    };
  }

  const pgc = safeJsonParse(programGenerationConfigJson, null) || {};
  const progByRank = pgc.progression_by_rank_json || pgc.progression_by_rank || {};
  const weekPhaseCfg = pgc.week_phase_config_json || pgc.week_phase_config || {};

  const cfg = {
    program_type: s(pgc.program_type || p0.program_type),
    default_rir: "2",
    default_tempo: "2-0-2-0",
    default_rest_sec_single: 90,
    default_rest_sec_superset: 60,
    default_rest_sec_giant_set: 60,
    fitness_rank: toInt(fitnessRank, 1),
    program_length: toInt(programLength, 0),
    total_weeks_default: toInt(pgc.total_weeks_default, 4),
    progression_by_rank_json: progByRank,
    week_phase_config_json: weekPhaseCfg,
    cooldown_seconds: toInt(cooldownSeconds, 0),
  };

  // Prefer actual program.weeks length if present, else programLength/config fallback
  let totalWeeks = 0;
  if (Array.isArray(p0.weeks) && p0.weeks.length) totalWeeks = p0.weeks.length;
  if (!totalWeeks) totalWeeks = cfg.program_length || cfg.total_weeks_default || 4;

  const cat = safeJsonParse(catalogJson, null);
  const catalogById = buildCatalogIndex(cat);

  // Split adoption into template vs weeks, plus totals (and mirror Step 4 week-by-week stats)
  const adoption = {
    template: makeCounters(),
    weeks: makeCounters(),
  };

  // Program-level narration (counted under template for simplicity)
  p0.narration = p0.narration || {};
  const progNar = buildProgramNarration(p0, templates, cfg, totalWeeks);
  p0.narration.program = progNar.narration.program;
  p0.narration.weeks = progNar.narration.weeks;
  // Top-level aliases used by importEmitterService and Screen 4
  p0.program_title = progNar.narration.program.title || "";
  p0.program_summary = progNar.narration.program.summary || "";
  adoption.template.week_engine_used = 1;

  // 1) Enrich template days
  if (Array.isArray(p0.days)) {
    enrichDays(p0.days, templates, cfg, catalogById, {
      duration_mins: p0.duration_mins,
      days_per_week: p0.days_per_week,
      program_type: cfg.program_type,
      totalWeeks,
      debugCounters: adoption.template,
    });
  }

  // 2) Enrich week days if present (and collect per-week adoption, Step-4 style)
  const weeksEnriched = [];
  const weekByWeekAdoption = [];

  if (Array.isArray(p0.weeks)) {
    for (let wi = 0; wi < p0.weeks.length; wi++) {
      const wk = p0.weeks[wi];
      if (!wk || !Array.isArray(wk.days)) continue;

      const wkCounters = makeCounters();

      enrichDays(wk.days, templates, cfg, catalogById, {
        duration_mins: p0.duration_mins,
        days_per_week: p0.days_per_week,
        program_type: cfg.program_type,
        totalWeeks,
        debugCounters: wkCounters,
      });

      // Aggregate into overall weeks bucket
      adoption.weeks = addCounters(adoption.weeks, wkCounters);

      weeksEnriched.push({
        week_index: wk.week_index ?? wi + 1,
        days: wk.days.length,
      });

      weekByWeekAdoption.push({
        week_index: wk.week_index ?? wi + 1,
        adoption: wkCounters,
      });
    }
  }

  const debug = {
    ok: true,
    source,
    templates_in: templates.length,
    cfg: {
      fitness_rank: cfg.fitness_rank,
      program_length: cfg.program_length,
      total_weeks_default: cfg.total_weeks_default,
      total_weeks_used: totalWeeks,
      catalog_json_present: !!(cat && Array.isArray(cat.ex) && cat.ex.length),
    },
    adoption: {
      template: adoption.template,
      weeks: adoption.weeks,
      total: addCounters(adoption.template, adoption.weeks),
    },
    week_engine: progNar.week_engine,
    weeks_enriched: weeksEnriched,
    weeks_adoption: weekByWeekAdoption, // ✅ Step-4 style: per-week metrics
    narration_keys: [
      "program.narration.program",
      "program.narration.weeks[]",
      "day.narration.warmup.*",
      "day.narration.cooldown.*",
      "day.segments includes warmup/cooldown",
      "segment.narration.*",
      "item.narration.*",
    ],
  };

  return { program: p0, debug };
}
