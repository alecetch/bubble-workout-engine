// api/engine/steps/04_applyRepRules.js
//
// Applies rep rules to segmented hypertrophy program and enriches BOTH:
// - program.days
// - program.weeks[w].days (if present)

function deepClone(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj ?? {}));
}

function toStr(v) {
  return v === null || v === undefined ? "" : String(v);
}
function s(v) {
  return toStr(v).trim();
}
function toInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
function normalizeCmp(v) {
  return s(v).toLowerCase().replace(/-/g, "_");
}

function safeJsonParseMaybe(value, fallback) {
  try {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "object") return value;
    const t = String(value).trim();
    if (!t) return fallback;
    return JSON.parse(t);
  } catch {
    return fallback;
  }
}

function parseBoolLoose(v) {
  const t = normalizeCmp(v);
  if (["yes", "true", "1", "y"].includes(t)) return true;
  if (["no", "false", "0", "n"].includes(t)) return false;
  return null;
}

function formatRepRange(lo, hi, repsUnit) {
  const loN = toInt(lo, 0);
  const hiN = toInt(hi, 0);
  let repRange = "";
  if (loN > 0 && hiN > 0) repRange = `${loN}-${hiN}`;
  else if (loN > 0) repRange = String(loN);
  else if (hiN > 0) repRange = String(hiN);
  if (!repRange) return "";

  const unit = normalizeCmp(repsUnit || "reps");
  if (unit && unit !== "reps") return `${repRange} ${s(repsUnit)}`;
  return repRange;
}

function formatTempo(rule) {
  const ecc = toInt(rule.tempo_eccentric, 0);
  const pb = toInt(rule.tempo_pause_bottom, 0);
  const con = toInt(rule.tempo_concentric, 0);
  const pt = toInt(rule.tempo_pause_top, 0);
  return `${ecc}-${pb}-${con}-${pt}`;
}

function toArrayMaybe(v) {
  if (v === null || v === undefined || v === "") return [];
  if (Array.isArray(v)) return v.map((x) => normalizeCmp(x)).filter(Boolean);
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return [];
    if (t[0] === "[") {
      const a = safeJsonParseMaybe(t, []);
      return Array.isArray(a) ? a.map((x) => normalizeCmp(x)).filter(Boolean) : [];
    }
    return t.split(",").map((x) => normalizeCmp(x)).filter(Boolean);
  }
  return [];
}

function hasOverlap(arrA, arrB) {
  const setB = new Set((arrB || []).map((x) => normalizeCmp(x)).filter(Boolean));
  for (const a of arrA || []) {
    const aa = normalizeCmp(a);
    if (aa && setB.has(aa)) return true;
  }
  return false;
}

function isBlank(v) {
  return s(v) === "";
}

function hasWritableValue(current) {
  return current !== undefined && current !== null && s(current) !== "";
}

function writeOnce(obj, key, value) {
  if (!hasWritableValue(obj?.[key]) && value !== undefined && value !== null && s(value) !== "") {
    obj[key] = value;
  }
}

// ---------------- catalog indexing ----------------
function getExField(ex, shortKey, longKey) {
  if (!ex) return "";
  const v1 = ex[shortKey];
  if (v1 !== undefined && v1 !== null && v1 !== "") return v1;
  const v2 = ex[longKey];
  if (v2 !== undefined && v2 !== null && v2 !== "") return v2;
  return "";
}

function buildCatalogIndex(cat) {
  const byId = Object.create(null);
  if (!cat || !Array.isArray(cat.ex)) return byId;
  for (const ex of cat.ex) {
    if (ex && ex.id) byId[String(ex.id)] = ex;
  }
  return byId;
}

function deriveEquipmentSlug(ex) {
  const direct =
    s(getExField(ex, "equipment_slug", "equipment_slug")) ||
    s(getExField(ex, "equipmentSlug", "equipmentSlug"));
  if (direct) return normalizeCmp(direct);

  const eq = getExField(ex, "eq", "equipment_json");
  const arr = toArrayMaybe(eq);
  return arr.length ? arr[0] : "";
}

// ---------------- rule matching ----------------
function normalizeRule(rawRule) {
  return {
    ...rawRule,
    rule_id: s(rawRule.rule_id),
    program_type: normalizeCmp(rawRule.program_type),
    day_type: normalizeCmp(rawRule.day_type),
    segment_type: normalizeCmp(rawRule.segment_type),
    purpose: normalizeCmp(rawRule.purpose),
    movement_pattern: normalizeCmp(rawRule.movement_pattern),
    swap_group_id_2: normalizeCmp(rawRule.swap_group_id_2),
    movement_class: normalizeCmp(rawRule.movement_class),
    equipment_slug: normalizeCmp(rawRule.equipment_slug),
    target_regions_json_arr: toArrayMaybe(rawRule.target_regions_json),
    priority_num: toInt(rawRule.priority, 0),
    schema_version_num:
      rawRule.schema_version === undefined || rawRule.schema_version === null || s(rawRule.schema_version) === ""
        ? null
        : toInt(rawRule.schema_version, 0),
  };
}

function specificityScore(rule) {
  let sc = 0;
  if (rule.schema_version_num !== null) sc += 1;
  if (rule.day_type) sc += 1;
  if (rule.segment_type) sc += 1;
  if (rule.purpose) sc += 1;
  if (rule.movement_pattern) sc += 1;
  if (rule.swap_group_id_2) sc += 1;
  if (rule.movement_class) sc += 1;
  if (rule.equipment_slug) sc += 1;
  if (rule.target_regions_json_arr.length > 0) sc += 1;
  return sc;
}

function ruleMatches(rule, ctx) {
  // Mandatory: program_type must match context, never wildcard.
  if (!rule.program_type || rule.program_type !== ctx.program_type) return false;

  // Optional schema_version wildcard.
  if (rule.schema_version_num !== null && rule.schema_version_num !== ctx.schema_version) return false;

  if (rule.day_type && rule.day_type !== ctx.day_type) return false;
  if (rule.segment_type && rule.segment_type !== ctx.segment_type) return false;
  if (rule.purpose && rule.purpose !== ctx.purpose) return false;
  if (rule.movement_pattern && rule.movement_pattern !== ctx.movement_pattern) return false;
  if (rule.swap_group_id_2 && rule.swap_group_id_2 !== ctx.swap_group_id_2) return false;
  if (rule.movement_class && rule.movement_class !== ctx.movement_class) return false;
  if (rule.equipment_slug && rule.equipment_slug !== ctx.equipment_slug) return false;

  if (rule.target_regions_json_arr.length > 0) {
    if (!ctx.target_regions.length) return false;
    if (!hasOverlap(rule.target_regions_json_arr, ctx.target_regions)) return false;
  }

  return true;
}

function pickBestRule(rules, ctx) {
  let best = null;
  for (const rule of rules) {
    if (!ruleMatches(rule, ctx)) continue;
    const cand = {
      rule,
      priority: rule.priority_num,
      specificity: specificityScore(rule),
      ruleId: rule.rule_id,
    };
    if (!best) {
      best = cand;
      continue;
    }
    if (cand.priority > best.priority) {
      best = cand;
      continue;
    }
    if (cand.priority < best.priority) continue;

    if (cand.specificity > best.specificity) {
      best = cand;
      continue;
    }
    if (cand.specificity < best.specificity) continue;

    if (cand.ruleId < best.ruleId) best = cand;
  }
  return best ? best.rule : null;
}

function applyRuleToItem(item, rule) {
  if (!item || !rule) return false;
  const repRange = formatRepRange(rule.rep_low, rule.rep_high, rule.reps_unit);
  const tempo = formatTempo(rule);

  writeOnce(item, "reps_prescribed", repRange);
  writeOnce(item, "reps_unit", s(rule.reps_unit));
  writeOnce(item, "rir_target", toInt(rule.rir_target, ""));
  writeOnce(item, "rir_min", toInt(rule.rir_min, ""));
  writeOnce(item, "rir_max", toInt(rule.rir_max, ""));
  writeOnce(item, "tempo_prescribed", tempo);
  writeOnce(item, "rest_after_set_sec", toInt(rule.rest_after_set_sec, ""));
  writeOnce(item, "logging_prompt_mode", s(rule.logging_prompt_mode));
  writeOnce(item, "notes_style", s(rule.notes_style));

  // Always overwrite for traceability when a rule is applied.
  item.rep_rule_id = rule.rule_id;
  return true;
}

function applyRuleToSegment(seg, rule) {
  if (!seg || !rule) return false;
  writeOnce(seg, "rest_after_set_sec", toInt(rule.rest_after_set_sec, ""));
  writeOnce(seg, "rest_after_round_sec", toInt(rule.rest_after_round_sec, ""));
  // Always overwrite for traceability when a rule is applied.
  seg.rep_rule_id = rule.rule_id;
  return true;
}

function makeItemContext({ programType, schemaVersion, dayType, purpose, segType, ex }) {
  const mp = normalizeCmp(getExField(ex, "mp", "movement_pattern"));
  const sw2 = normalizeCmp(getExField(ex, "sw2", "swap_group_id_2"));
  const mc = normalizeCmp(getExField(ex, "mc", "movement_class"));
  const tr = toArrayMaybe(getExField(ex, "tr", "target_regions_json"));
  const eq = deriveEquipmentSlug(ex);

  return {
    program_type: normalizeCmp(programType),
    schema_version: schemaVersion,
    day_type: normalizeCmp(dayType),
    segment_type: normalizeCmp(segType),
    purpose: normalizeCmp(purpose),
    movement_pattern: mp,
    swap_group_id_2: sw2,
    movement_class: mc,
    equipment_slug: eq,
    target_regions: tr,
  };
}

function buildFallbackItemContext(ctx) {
  return {
    ...ctx,
    movement_pattern: "",
    swap_group_id_2: "",
    movement_class: "",
    equipment_slug: "",
    target_regions: [],
  };
}

function enrichProgramDays({ program, catalogJson, rules, source }) {
  const out = deepClone(program);

  const cat = safeJsonParseMaybe(catalogJson, null);
  const byId = buildCatalogIndex(cat);

  const programType = s(out.program_type || out.programType || "hypertrophy") || "hypertrophy";
  const schemaVersion = 1;

  const dbg = {
    source,
    program_type: programType,
    schema_version: schemaVersion,
    rules_in: rules.length,
    used_catalog: !!(cat && Array.isArray(cat.ex)),
    items_total: 0,
    items_with_rule: 0,
    items_with_fallback_rule: 0,
    segments_with_rule: 0,
    items_missing_ex_in_catalog: 0,
    items_fell_back_to_defaults: 0,
    notes: [],
  };

  if (!Array.isArray(out.days)) {
    return { program: out, debug: { ...dbg, error: "program.days missing or not an array" } };
  }

  for (let d = 0; d < out.days.length; d++) {
    const day = out.days[d];
    if (!day || !Array.isArray(day.segments)) continue;

    const dayType = s(day.day_type);

    for (let si = 0; si < day.segments.length; si++) {
      const seg = day.segments[si];
      if (!seg) continue;

      const purpose = s(seg.purpose || "");
      const segType = s(seg.segment_type || "");

      // Segment context from first item (single-pass matching).
      const firstItem = seg.items && seg.items.length ? seg.items[0] : null;
      const firstEx = firstItem && firstItem.ex_id ? byId[String(firstItem.ex_id)] || null : null;
      const segCtx = makeItemContext({
        programType,
        schemaVersion,
        dayType,
        purpose,
        segType,
        ex: firstEx || {},
      });
      const segRule = pickBestRule(rules, segCtx);
      if (segRule) {
        applyRuleToSegment(seg, segRule);
        dbg.segments_with_rule += 1;
      }

      const items = Array.isArray(seg.items) ? seg.items : [];
      for (let ii = 0; ii < items.length; ii++) {
        const it = items[ii];
        if (!it || !it.ex_id) continue;
        dbg.items_total += 1;

        const ex = byId[String(it.ex_id)] || null;
        if (!ex && dbg.used_catalog) dbg.items_missing_ex_in_catalog += 1;

        const itemCtx = makeItemContext({
          programType,
          schemaVersion,
          dayType,
          purpose,
          segType,
          ex: ex || {},
        });

        let rule = pickBestRule(rules, itemCtx);
        if (!rule) {
          const fallbackCtx = buildFallbackItemContext(itemCtx);
          rule = pickBestRule(rules, fallbackCtx);
          if (rule) {
            dbg.items_with_fallback_rule += 1;
            dbg.items_fell_back_to_defaults += 1;
          }
        }

        if (rule) {
          applyRuleToItem(it, rule);
          dbg.items_with_rule += 1;
        } else {
          dbg.notes.push(
            `No item rule matched for ex_id=${s(it.ex_id)} day_type=${dayType} purpose=${purpose} segment_type=${segType}`,
          );
        }
      }

      // If segment rest still missing: fallback to max item rest_after_set_sec.
      if (!hasWritableValue(seg.rest_after_set_sec)) {
        let maxRest = 0;
        for (let i2 = 0; i2 < items.length; i2++) {
          const r2 = toInt(items[i2] && items[i2].rest_after_set_sec, 0);
          if (r2 > maxRest) maxRest = r2;
        }
        if (maxRest > 0) seg.rest_after_set_sec = maxRest;
      }
    }
  }

  return { program: out, debug: dbg };
}

export async function applyRepRules({ program, catalogJson, repRules, repRulesJson }) {
  if (!program) throw new Error("applyRepRules: missing program");
  if (!catalogJson) throw new Error("applyRepRules: missing catalogJson");

  let source = "db";
  let rawRules = Array.isArray(repRules) ? repRules : [];
  if (!rawRules.length) {
    source = "json";
    const parsed = safeJsonParseMaybe(repRulesJson, null);
    rawRules = Array.isArray(parsed) ? parsed : [];
  }

  const rules = rawRules
    .filter((r) => r && s(r.rule_id))
    .filter((r) => parseBoolLoose(r.is_active) !== false)
    .map(normalizeRule);

  const base = deepClone(program);
  const templateRes = enrichProgramDays({
    program: base,
    catalogJson,
    rules,
    source,
  });

  const weekDebug = [];
  if (Array.isArray(templateRes.program.weeks)) {
    for (let wi = 0; wi < templateRes.program.weeks.length; wi++) {
      const wk = templateRes.program.weeks[wi];
      if (!wk || !Array.isArray(wk.days)) continue;

      const tmp = { ...deepClone(templateRes.program), days: deepClone(wk.days) };
      const wkRes = enrichProgramDays({
        program: tmp,
        catalogJson,
        rules,
        source,
      });
      wk.days = wkRes.program.days;

      weekDebug.push({
        week_index: wk.week_index ?? wi + 1,
        items_total: wkRes.debug?.items_total ?? null,
        items_with_rule: wkRes.debug?.items_with_rule ?? null,
        segments_with_rule: wkRes.debug?.segments_with_rule ?? null,
      });
    }
  }

  const debug = {
    source: templateRes.debug?.source,
    rules_in: templateRes.debug?.rules_in,
    notes: Array.isArray(templateRes.debug?.notes) ? templateRes.debug.notes : [],
    template: templateRes.debug,
    weeks: weekDebug,
  };

  return { program: templateRes.program, debug };
}
