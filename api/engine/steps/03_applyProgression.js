// api/engine/steps/03_applyProgression.js

function toStr(v){ return (v===null||v===undefined) ? "" : String(v); }
function s(v){ return toStr(v).trim(); }
function toInt(v,f){ const x = parseInt(v,10); return Number.isFinite(x) ? x : f; }
function safeJsonParse(x, fallback){
  try {
    if (x === null || x === undefined) return fallback;
    if (typeof x === "object") return x;
    const t = String(x||"").trim();
    if (!t) return fallback;
    return JSON.parse(t);
  } catch(e){ return fallback; }
}
function deepClone(obj){ return JSON.parse(JSON.stringify(obj||{})); }
function yes(v){
  const t = s(v).toLowerCase();
  return (t==="yes"||t==="true"||t==="1");
}
function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

function rankKey(rank){
  rank = toInt(rank, 1);
  if (rank === 1) return "beginner";
  if (rank === 2) return "intermediate";
  if (rank === 3) return "advanced";
  if (rank === 4) return "elite";
  return "beginner";
}

// Accepts either: single row, array, {rows:[...]} or {data:[...]}
function normalizeConfigRows(raw){
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object"){
    if (Array.isArray(raw.rows)) return raw.rows;
    if (Array.isArray(raw.data)) return raw.data;
    return [raw];
  }
  return [];
}

function pickActiveConfig(rows, programType, schemaVersion){
  programType = s(programType) || "hypertrophy";
  schemaVersion = toInt(schemaVersion, 1);

  for (let i=0;i<rows.length;i++){
    const r = rows[i] || {};
    if (s(r.program_type) && s(r.program_type) !== programType) continue;
    if (r.schema_version !== undefined && r.schema_version !== null && r.schema_version !== ""){
      if (toInt(r.schema_version, 0) !== schemaVersion) continue;
    }
    if (r.is_active !== undefined && r.is_active !== null && r.is_active !== ""){
      if (!yes(r.is_active)) continue;
    }
    return r;
  }
  return null;
}

function computeSetsForWeek(baseSets, weekIndex, purpose, progCfg){
  baseSets = toInt(baseSets, 0);
  if (baseSets <= 0) return 0;

  progCfg = progCfg || {};
  let applyTo = progCfg.apply_to_purposes;
  if (!Array.isArray(applyTo) || applyTo.length === 0){
    applyTo = ["main","secondary","accessory"];
  }

  const purposeAllowed = (applyTo.indexOf(purpose) >= 0);

  // deload
  const dl = progCfg.deload || null;
  if (dl && toInt(dl.week, 0) === toInt(weekIndex, 0)){
    const dlAll = dl.apply_to_all !== undefined ? yes(dl.apply_to_all) : true;
    if (dlAll || purposeAllowed){
      let mult = (dl.set_multiplier === undefined || dl.set_multiplier === null || dl.set_multiplier === "") ? 0.7 : Number(dl.set_multiplier);
      if (!Number.isFinite(mult) || mult <= 0) mult = 0.7;
      const deloadSets = Math.round(baseSets * mult);
      return Math.max(1, deloadSets);
    }
  }

  if (!purposeAllowed) return baseSets;

  // absolute overrides (optional)
  const overrides = progCfg.set_overrides_by_purpose || null;
  if (overrides && typeof overrides === "object" && Object.prototype.hasOwnProperty.call(overrides, purpose)){
    const ov = toInt(overrides[purpose], null);
    if (ov !== null) return ov;
  }

  const step = toInt(progCfg.weekly_set_step, 0);
  const maxExtra = toInt(progCfg.max_extra_sets, 0);
  const extra = Math.min((weekIndex - 1) * step, maxExtra);
  return baseSets + extra;
}

export async function applyProgression({
  program,                       // segmented program
  programType = "hypertrophy",
  fitnessRank = 1,
  programLength = null,
  programGenerationConfigs = [], // rows from Bubble table
  schemaVersion = 1,
}) {
  if (!program || !Array.isArray(program.days)) {
    throw new Error("applyProgression: invalid program (missing days)");
  }

  const cfgRows = normalizeConfigRows(programGenerationConfigs);
  const cfgRow = pickActiveConfig(cfgRows, programType, schemaVersion);

  if (!cfgRow) {
    return {
      program,
      debug: {
        ok: false,
        error: `No active config row found for program_type=${programType} schema_version=${schemaVersion}`,
        cfg_rows_in: cfgRows.length,
      },
    };
  }

  const rank = toInt(fitnessRank, 1);
  const rk = rankKey(rank);

  let progByRank = safeJsonParse(cfgRow.progression_by_rank_json, null);
  if (!progByRank || typeof progByRank !== "object") progByRank = {};
  const progCfg = progByRank[rk] || progByRank[String(rank)] || progByRank.beginner || {};

  const weeksDefault = toInt(cfgRow.total_weeks_default, 4);
  let weeks = toInt(programLength, 0);
  if (!weeks) weeks = weeksDefault;
  weeks = clamp(weeks, 1, 12);

  const out = deepClone(program);

  // Keep original template days
  out.template_days = deepClone(program.days);

  out.weeks_count = weeks;
  out.fitness_rank = rank;
  out.program_type = programType;
  out.schema_version = schemaVersion;

  out.weeks = [];

  const dbg = {
    ok: true,
    program_type: programType,
    schema_version: schemaVersion,
    config_key: s(cfgRow.config_key),
    weeks,
    fitness_rank: rank,
    rank_key: rk,
    apply_to_purposes: (progCfg && progCfg.apply_to_purposes) ? progCfg.apply_to_purposes : ["main","secondary","accessory"],
    deload: progCfg ? (progCfg.deload || null) : null,
    items_total: 0,
    items_progressed: 0,
    circuit_rounds_progressed: 0,
    notes: [],
  };

  for (let w=1; w<=weeks; w++){
    const weekObj = { week_index: w, days: [] };

    for (let d=0; d<out.template_days.length; d++){
      const day = deepClone(out.template_days[d]);
      day.week_index = w;

      if (Array.isArray(day.segments)){
        for (let si=0; si<day.segments.length; si++){
          const seg = day.segments[si] || {};
          const purpose = s(seg.purpose);
          const segType = s(seg.segment_type);

          // ✅ NEW: circuits progress rounds (not item.sets)
          if (segType && segType !== "single"){
            if (seg.rounds_base === undefined || seg.rounds_base === null || seg.rounds_base === ""){
              seg.rounds_base = toInt(seg.rounds, 1);
            }
            const baseRounds = toInt(seg.rounds_base, 1);
            const progressedRounds = computeSetsForWeek(baseRounds, w, purpose, progCfg);
            seg.rounds = progressedRounds;
            if (progressedRounds !== baseRounds) dbg.circuit_rounds_progressed += 1;

            // keep items as sets=1
            continue;
          }

          // singles: progress item.sets
          const items = Array.isArray(seg.items) ? seg.items : [];
          for (let ii=0; ii<items.length; ii++){
            const it = items[ii] || {};
            dbg.items_total += 1;

            if (it.sets_base === undefined || it.sets_base === null || it.sets_base === ""){
              it.sets_base = toInt(it.sets, 0);
            }

            const baseSets = toInt(it.sets_base, 0);
            const progressed = computeSetsForWeek(baseSets, w, purpose, progCfg);

            it.sets = progressed;
            if (progressed !== baseSets) dbg.items_progressed += 1;
          }
        }
      }

      weekObj.days.push(day);
    }

    out.weeks.push(weekObj);
  }

  // Keep out.days as template for compatibility
  out.days = out.template_days;

  return { program: out, debug: dbg };
}