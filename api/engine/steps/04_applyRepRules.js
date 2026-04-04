// api/engine/steps/04_applyRepRules.js
//
// Applies rep rules to segmented hypertrophy program and enriches BOTH:
// - program.days
// - program.weeks[w].days (if present)
import {
  buildCatalogIndex,
  makeItemContext,
  normalizeRule,
  pickBestRule,
  pickBestRuleWithFallback,
} from "../repRuleMatcher.js";

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
  if (loN > 0 && hiN > 0) repRange = loN === hiN ? `${loN}` : `${loN}-${hiN}`;
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

        const match = pickBestRuleWithFallback(rules, itemCtx);
        const rule = match.rule;
        if (match.viaFallback) {
          dbg.items_with_fallback_rule += 1;
          dbg.items_fell_back_to_defaults += 1;
        }

        if (rule) {
          applyRuleToItem(it, rule);
          dbg.items_with_rule += 1;

          // Unit override: if the matched rule prescribes metres but the exercise
          // does not accept a distance prescription, substitute the rule's
          // coach-configured time equivalent instead.
          if (
            normalizeCmp(rule.reps_unit) === "m" &&
            ex &&
            !ex.accepts_distance_unit &&
            rule.time_equivalent_low_sec != null
          ) {
            const timePrescription = formatRepRange(
              rule.time_equivalent_low_sec,
              rule.time_equivalent_high_sec,
              "seconds",
            );
            it.reps_prescribed = timePrescription;
            it.reps_unit = "seconds";
            dbg.notes.push(
              `Unit override: ex_id=${s(it.ex_id)} rule=${rule.rule_id} ` +
              `${rule.rep_low}-${rule.rep_high}m → ${timePrescription} seconds`,
            );
          }
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
