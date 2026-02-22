// api/engine/steps/04_applyRepRules.js
//
// DROP-IN REPLACEMENT
// - Applies rep rules to segmented hypertrophy program
// - Enriches BOTH:
//   * program.days
//   * program.weeks[w].days (if present)
//
// Assumptions:
// - program is already segmented (days[].segments[].items[] exists)
// - item fields written: reps_prescribed, rir_target, tempo_prescribed, rest_after_set_sec, rep_rule_id
// - segment fields written: rest_after_set_sec, rep_rule_id

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

function normalizeYesNo(v) {
  const t = s(v).toLowerCase();
  if (t === "yes" || t === "true" || t === "1") return "yes";
  if (t === "no" || t === "false" || t === "0") return "no";
  return t;
}

function formatRepRange(lo, hi) {
  lo = toInt(lo, 0);
  hi = toInt(hi, 0);
  if (lo > 0 && hi > 0) return `${lo}–${hi}`;
  if (lo > 0) return String(lo);
  if (hi > 0) return String(hi);
  return "";
}

function formatTempo(rule) {
  const ecc = toInt(rule.tempo_eccentric, 0);
  const pb = toInt(rule.tempo_pause_bottom, 0);
  const con = toInt(rule.tempo_concentric, 0);
  const pt = toInt(rule.tempo_pause_top, 0);
  return `${ecc}-${pb}-${con}-${pt}`;
}

// Handles already-array, json-string array, csv-string
function toArrayMaybe(v) {
  if (v === null || v === undefined || v === "") return [];
  if (Array.isArray(v)) return v.map((x) => s(x)).filter(Boolean);
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return [];
    if (t[0] === "[") {
      const a = safeJsonParseMaybe(t, []);
      return Array.isArray(a) ? a.map((x) => s(x)).filter(Boolean) : [];
    }
    return t.split(",").map((x) => s(x)).filter(Boolean);
  }
  return [];
}

function hasOverlap(arrA, arrB) {
  if (!arrA || !arrB) return false;
  const setB = Object.create(null);
  for (const b of arrB) {
    const bb = s(b);
    if (bb) setB[bb] = true;
  }
  for (const a of arrA) {
    const aa = s(a);
    if (aa && setB[aa]) return true;
  }
  return false;
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

// ---------------- rule matching ----------------
function specificityScore(rule) {
  let sc = 0;
  if (s(rule.purpose)) sc += 1;
  if (s(rule.segment_type)) sc += 1;
  if (s(rule.movement_pattern)) sc += 1;
  if (s(rule.swap_group_id_2)) sc += 1;

  // optional fields
  if (s(rule.movement_class)) sc += 1;
  if (s(rule.target_region)) sc += 1;
  if (s(rule.target_regions_json)) sc += 1;

  return sc;
}

function ruleMatches(rule, ctx) {
  if (normalizeYesNo(rule.is_active) !== "yes") return false;

  if (ctx.program_type && s(rule.program_type) && s(rule.program_type) !== s(ctx.program_type)) return false;
  if (ctx.schema_version && rule.schema_version !== undefined && rule.schema_version !== null && rule.schema_version !== "") {
    if (toInt(rule.schema_version, 0) !== toInt(ctx.schema_version, 0)) return false;
  }

  // optional fields are wildcards if blank
  if (s(rule.purpose) && s(rule.purpose) !== s(ctx.purpose)) return false;
  if (s(rule.segment_type) && s(rule.segment_type) !== s(ctx.segment_type)) return false;

  if (s(rule.movement_pattern)) {
    if (!s(ctx.movement_pattern)) return false;
    if (s(rule.movement_pattern) !== s(ctx.movement_pattern)) return false;
  }

  if (s(rule.swap_group_id_2)) {
    if (!s(ctx.swap_group_id_2)) return false;
    if (s(rule.swap_group_id_2) !== s(ctx.swap_group_id_2)) return false;
  }

  if (s(rule.movement_class)) {
    if (!s(ctx.movement_class)) return false;
    if (s(rule.movement_class) !== s(ctx.movement_class)) return false;
  }

  if (s(rule.target_region)) {
    if (!ctx.target_regions || !ctx.target_regions.length) return false;
    if (ctx.target_regions.indexOf(s(rule.target_region)) < 0) return false;
  }

  if (s(rule.target_regions_json)) {
    const rr = toArrayMaybe(rule.target_regions_json);
    if (!rr.length) return false;
    if (!ctx.target_regions || !ctx.target_regions.length) return false;
    if (!hasOverlap(rr, ctx.target_regions)) return false;
  }

  return true;
}

function pickBestRule(rules, ctx) {
  let best = null;

  for (const r of rules) {
    if (!r) continue;
    if (!ruleMatches(r, ctx)) continue;

    const pr = toInt(r.priority, 0);
    const sp = specificityScore(r);

    if (!best) {
      best = { rule: r, pr, sp };
    } else {
      if (pr > best.pr) best = { rule: r, pr, sp };
      else if (pr === best.pr && sp > best.sp) best = { rule: r, pr, sp };
    }
  }

  return best ? best.rule : null;
}

function applyRuleToItem(item, rule) {
  if (!item || !rule) return;

  const lo = toInt(rule.rep_low, 0);
  const hi = toInt(rule.rep_high, 0);
  const repRange = formatRepRange(lo, hi);

  const rir =
    rule.rir_target === undefined || rule.rir_target === null || rule.rir_target === ""
      ? null
      : toInt(rule.rir_target, null);

  const tempo = formatTempo(rule);

  const rest =
    rule.rest_after_set_sec === undefined || rule.rest_after_set_sec === null || rule.rest_after_set_sec === ""
      ? null
      : toInt(rule.rest_after_set_sec, null);

  if (!item.reps_prescribed && repRange) item.reps_prescribed = repRange;

  if (item.rir_target === undefined || item.rir_target === null || item.rir_target === "") {
    if (rir !== null) item.rir_target = rir;
  }

  if (!item.tempo_prescribed && tempo) item.tempo_prescribed = tempo;

  if (item.rest_after_set_sec === undefined || item.rest_after_set_sec === null || item.rest_after_set_sec === "") {
    if (rest !== null) item.rest_after_set_sec = rest;
  }

  item.rep_rule_id = s(rule.rule_id);
}

function applyRuleToSegment(seg, rule) {
  if (!seg || !rule) return;

  const rest =
    rule.rest_after_set_sec === undefined || rule.rest_after_set_sec === null || rule.rest_after_set_sec === ""
      ? null
      : toInt(rule.rest_after_set_sec, null);

  if (seg.rest_after_set_sec === undefined || seg.rest_after_set_sec === null || seg.rest_after_set_sec === "") {
    if (rest !== null) seg.rest_after_set_sec = rest;
  }

  seg.rep_rule_id = s(rule.rule_id);
}

/**
 * Enrich a program object whose `.days` are segmented days.
 * Returns { program, debug } where program has enriched `.days`.
 */
function enrichProgramDays({ program, catalogJson, repRulesJson }) {
  const out = deepClone(program);

  const cat = safeJsonParseMaybe(catalogJson, null);
  const byId = buildCatalogIndex(cat);

  const rulesRaw = safeJsonParseMaybe(repRulesJson, null);
  const rules = Array.isArray(rulesRaw) ? rulesRaw : [];

  const programType = s(out.program_type || out.programType || "hypertrophy") || "hypertrophy";
  const schemaVersion = 1;

  const dbg = {
    program_type: programType,
    schema_version: schemaVersion,
    rules_in: rules.length,
    used_catalog: !!(cat && Array.isArray(cat.ex)),
    items_total: 0,
    items_with_rule: 0,
    segments_with_rule: 0,
    items_missing_ex_in_catalog: 0,
    items_missing_movement_pattern: 0,
    items_missing_swap_group_id_2: 0,
    items_fell_back_to_defaults: 0,
    notes: [],
  };

  if (!Array.isArray(out.days)) {
    return { program: out, debug: { ...dbg, error: "program.days missing or not an array" } };
  }

  for (let d = 0; d < out.days.length; d++) {
    const day = out.days[d];
    if (!day || !Array.isArray(day.segments)) continue;

    for (let si = 0; si < day.segments.length; si++) {
      const seg = day.segments[si];
      if (!seg) continue;

      const purpose = s(seg.purpose || "");
      const segType = s(seg.segment_type || "");

      // Segment context from first item
      const firstItem = seg.items && seg.items.length ? seg.items[0] : null;
      let mp = "";
      let sw2 = "";
      let mc = "";
      let tr = [];

      if (firstItem && firstItem.ex_id && byId[String(firstItem.ex_id)]) {
        const ex0 = byId[String(firstItem.ex_id)];
        mp = s(getExField(ex0, "mp", "movement_pattern"));
        sw2 = s(getExField(ex0, "sw2", "swap_group_id_2"));
        mc = s(getExField(ex0, "mc", "movement_class"));
        tr = toArrayMaybe(getExField(ex0, "tr", "target_regions_json"));
      }

      const segCtx = {
        program_type: programType,
        schema_version: schemaVersion,
        purpose,
        segment_type: segType,
        movement_pattern: mp,
        swap_group_id_2: sw2,
        movement_class: mc,
        target_regions: tr,
      };

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

        const itMp = ex ? s(getExField(ex, "mp", "movement_pattern")) : "";
        const itSw2 = ex ? s(getExField(ex, "sw2", "swap_group_id_2")) : "";
        const itMc = ex ? s(getExField(ex, "mc", "movement_class")) : "";
        const itTr = ex ? toArrayMaybe(getExField(ex, "tr", "target_regions_json")) : [];

        if (!itMp) dbg.items_missing_movement_pattern += 1;
        if (!itSw2) dbg.items_missing_swap_group_id_2 += 1;

        const ctx = {
          program_type: programType,
          schema_version: schemaVersion,
          purpose,
          segment_type: segType,
          movement_pattern: itMp,
          swap_group_id_2: itSw2,
          movement_class: itMc,
          target_regions: itTr,
        };

        let rule = pickBestRule(rules, ctx);

        // fallback: purpose/segment defaults even if ex metadata missing
        if (!rule) {
          const ctx2 = {
            program_type: programType,
            schema_version: schemaVersion,
            purpose,
            segment_type: segType,
            movement_pattern: "",
            swap_group_id_2: "",
            movement_class: "",
            target_regions: [],
          };
          rule = pickBestRule(rules, ctx2);
          if (rule) dbg.items_fell_back_to_defaults += 1;
        }

        if (rule) {
          applyRuleToItem(it, rule);
          dbg.items_with_rule += 1;
        } else {
          dbg.notes.push(`No item rule matched for ex_id=${s(it.ex_id)} purpose=${purpose} segType=${segType}`);
        }
      }

      // If segment rest still missing: fallback to max item rest
      if (seg.rest_after_set_sec === undefined || seg.rest_after_set_sec === null || seg.rest_after_set_sec === "") {
        let maxRest = 0;
        for (let ii2 = 0; ii2 < items.length; ii2++) {
          const r2 = toInt(items[ii2] && items[ii2].rest_after_set_sec, 0);
          if (r2 > maxRest) maxRest = r2;
        }
        if (maxRest > 0) seg.rest_after_set_sec = maxRest;
      }
    }
  }

  return { program: out, debug: dbg };
}

export async function applyRepRules({ program, catalogJson, repRulesJson }) {
  if (!program) throw new Error("applyRepRules: missing program");
  if (!catalogJson) throw new Error("applyRepRules: missing catalogJson");
  if (!repRulesJson) throw new Error("applyRepRules: missing repRulesJson");

  // 1) Enrich template days (program.days)
  const base = deepClone(program);
  const templateRes = enrichProgramDays({ program: base, catalogJson, repRulesJson });

  // 2) Enrich weeks (program.weeks[w].days) if present
  const weekDebug = [];
  if (Array.isArray(templateRes.program.weeks)) {
    for (let wi = 0; wi < templateRes.program.weeks.length; wi++) {
      const wk = templateRes.program.weeks[wi];
      if (!wk || !Array.isArray(wk.days)) continue;

      // Feed wk.days through the same logic by mapping them to `.days`
      const tmp = { ...deepClone(templateRes.program), days: deepClone(wk.days) };
      const wkRes = enrichProgramDays({ program: tmp, catalogJson, repRulesJson });

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
    template: templateRes.debug,
    weeks: weekDebug,
  };

  return { program: templateRes.program, debug };
}