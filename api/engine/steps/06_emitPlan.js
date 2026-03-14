// api/engine/steps/06_emitPlan.js
//
// DROP-IN replacement for Toolbox Emitter v8.1 as a Node pipeline step.
//
// Emits pipe-delimited rows (PRG/WEEK/DAY/SEG/EX) from narration-enriched program.
// - FIX: SEG col 5=score_type, col 6/7 labels, col 9=segment_notes/body (from narration)
// - Warmup/Cooldown segments emitted if present
// - Timings: Sum(SEG seconds) == day.duration_mins * 60
// - Scheduling preserved (anchor_day_ms/anchor_date_ms + preferred_days_json)
// - Stable EX order across day
//
// Inputs:
// - program (required) => output from narration step
// - catalogJson (optional) => CatalogBuild.v3 catalog_json (for warmup hooks fallback)
// - anchorDayMs OR anchorDateMs (optional) => ms since epoch (day-anchored recommended)
// - preferredDaysJson (optional) => comma string or JSON array of DOW labels/numbers
// - programLength (optional) => override weeks emitted
// - warmupSeconds/cooldownSeconds (optional) => fixed allocations when warmup/cooldown segments exist
// - timing_* (optional) => timing knobs as in Bubble script
//
// Output:
// { rows: string[], debug: {...} }

function s(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
}
function n(v) {
  if (v === null || v === undefined || v === "") return "";
  const x = parseInt(v, 10);
  return Number.isFinite(x) ? String(x) : "";
}
function toInt(v, f) {
  const x = parseInt(v, 10);
  return Number.isFinite(x) ? x : f;
}
function safeJsonParse(txt, fallback) {
  try {
    if (txt === null || txt === undefined) return fallback;
    if (typeof txt === "object") return txt;
    return JSON.parse(String(txt || "").trim());
  } catch {
    return fallback;
  }
}
function jOrEmpty(v) {
  try {
    return JSON.stringify(v || {});
  } catch {
    return "";
  }
}
function clampInt(x, lo, hi) {
  x = toInt(x, lo);
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}
function mmss(totalSec) {
  let t = toInt(totalSec, 0);
  if (t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s2 = t % 60;
  return String(m) + ":" + (s2 < 10 ? "0" + s2 : String(s2));
}

/* ------------------ catalog index ------------------ */

function buildCatalogIndex(cat) {
  const byId = {};
  if (!cat || !Array.isArray(cat.ex)) return byId;
  for (let i = 0; i < cat.ex.length; i++) {
    const ex = cat.ex[i];
    if (ex && ex.id) byId[String(ex.id)] = ex;
  }
  return byId;
}
function getExField(ex, shortKey, longKey) {
  if (!ex) return "";
  if (ex[shortKey]) return ex[shortKey];
  if (ex[longKey]) return ex[longKey];
  return "";
}

/* ------------------ deterministic warmup text per EX ------------------ */

function buildWarmup(ex) {
  if (!ex) return "";

  const hooks = getExField(ex, "wh", "warmup_hooks");
  const mp = getExField(ex, "mp", "movement_pattern");

  if (hooks) return "Warm-up focus: " + s(hooks);

  if (mp === "squat") return "Warm-up: hips + ankles. 2–3 progressive sets.";
  if (mp === "hinge") return "Warm-up: hamstrings + glutes. Build gradually.";
  if (mp === "push_horizontal") return "Warm-up: shoulders + triceps. Ramp load.";
  if (mp === "pull_horizontal") return "Warm-up: upper back activation.";
  if (mp === "lunge") return "Warm-up: single-leg stability prep.";

  return "2–3 progressive warm-up sets before work sets.";
}

/* ------------------ segment titles (fallbacks) ------------------ */

function segmentTitle(purpose, segment_type) {
  if (segment_type === "warmup" || purpose === "warmup") return "Warm-up";
  if (segment_type === "cooldown" || purpose === "cooldown") return "Cool-down";

  if (purpose === "main") return "Primary Strength Work";
  if (purpose === "secondary") {
    if (segment_type === "superset") return "Secondary Superset";
    return "Build Volume";
  }
  if (purpose === "accessory") {
    if (segment_type === "giant_set") return "Accessory Circuit";
    return "Accessory Work";
  }
  return "";
}
function segmentTitleFromNarration(seg) {
  if (seg && seg.narration && seg.narration.title) return s(seg.narration.title);
  return segmentTitle(s(seg && seg.purpose), s(seg && seg.segment_type));
}

/* ------------------ segment notes/body (for UI) ------------------ */

function segmentNotesFromNarration(seg) {
  if (!seg) return "";

  const st = s(seg.segment_type);
  const p = s(seg.purpose);

  // Warmup/Cooldown: execution is typically the correct body text
  if (st === "warmup" || p === "warmup") {
    return seg.narration && seg.narration.execution ? s(seg.narration.execution) : "";
  }
  if (st === "cooldown" || p === "cooldown") {
    return seg.narration && seg.narration.execution ? s(seg.narration.execution) : "";
  }

  // Normal segments: execution line is most useful
  if (seg.narration && seg.narration.execution) return s(seg.narration.execution);

  return "";
}

/* ------------------ SEG scoring fields ------------------ */

function scoreTypeLabelConfig(seg) {
  const st = s(seg && seg.segment_type).toLowerCase();
  const p = s(seg && seg.purpose).toLowerCase();
  const rounds = clampInt(seg && seg.rounds, 1, 99);

  const out = { score_type: "none", primary: "", secondary: "" };

  // warmup/cooldown never scored
  if (st === "warmup" || st === "cooldown" || p === "warmup" || p === "cooldown") return out;

  // EMOM: reps-based
  if (st === "emom") return { score_type: "reps", primary: "Total reps", secondary: "Reps per interval" };

  // AMRAP: rounds + extra reps
  if (st === "amrap") return { score_type: "rounds", primary: "Rounds", secondary: "Extra reps" };

  // Superset / Giant set: rounds-based if rounds > 1 (otherwise treat as "none")
  if (st === "superset" || st === "giant_set") {
    if (rounds > 1) return { score_type: "rounds", primary: "Rounds", secondary: "Time" };
    return out;
  }

  // Single: rounds-based only if rounds > 1
  if (st === "single" && rounds > 1) {
    return { score_type: "rounds", primary: "Rounds", secondary: "Time" };
  }

  return out;
}

/* ------------------ scheduling ------------------ */

const DOWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_MAP = {
  mon: 0, monday: 0,
  tue: 1, tues: 1, tuesday: 1,
  wed: 2, weds: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3,
  fri: 4, friday: 4,
  sat: 5, saturday: 5,
  sun: 6, sunday: 6,
};
function weekdayLabel(i) {
  return i >= 0 && i <= 6 ? DOWS[i] : "";
}
function anchorDowFromMs(ms) {
  const x = parseInt(ms, 10);
  if (!Number.isFinite(x)) return 0;
  const sun0 = new Date(x).getUTCDay();
  return (sun0 + 6) % 7; // Sun=0 -> Mon=0
}
function parsePreferredDays(raw) {
  if (!raw) return [];
  let arr = raw;

  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    if (t[0] === "[") {
      try { arr = JSON.parse(t); } catch { arr = []; }
    } else {
      arr = t.split(",").map((x) => String(x || "").trim());
    }
  }

  if (!Array.isArray(arr)) return [];

  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];

    if (typeof v === "number" && Number.isFinite(v)) {
      const nn = parseInt(v, 10);
      if (nn >= 0 && nn <= 6) out.push(nn);
      continue;
    }

    const key = String(v || "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(DOW_MAP, key)) out.push(DOW_MAP[key]);
  }

  const seen = {};
  const uniq = [];
  for (let j = 0; j < out.length; j++) {
    if (!seen[out[j]]) {
      seen[out[j]] = true;
      uniq.push(out[j]);
    }
  }
  return uniq;
}
function nextPreferredOffset(anchorIdx, prefs) {
  if (!prefs.length) return 0;
  for (let off = 0; off < 7; off++) {
    const d = (anchorIdx + off) % 7;
    for (let i = 0; i < prefs.length; i++) {
      if (prefs[i] === d) return off;
    }
  }
  return 0;
}
function scheduledOffsetDays(week, day, prefs) {
  const base = (week - 1) * 7;
  if (!prefs.length || prefs.length < day) return base + (day - 1);
  const start = prefs[0];
  const target = prefs[day - 1];
  return base + ((target - start + 7) % 7);
}

/* ------------------ week narration helpers ------------------ */

function buildWeekIndex(program) {
  const idx = {};
  if (!program || !program.narration || !Array.isArray(program.narration.weeks)) return idx;

  for (let i = 0; i < program.narration.weeks.length; i++) {
    const w = program.narration.weeks[i] || {};
    const wi = toInt(w.week_index, 0);
    if (!wi) continue;

    idx[String(wi)] = {
      title: s(w.title),
      focus: s(w.focus),
      notes: s(w.notes),
      phase: s(w.phase),
      phase_label: s(w.phase_label),
    };
  }
  return idx;
}

/* ------------------ day narration helpers ------------------ */

function getDayLabel(baseDay, dayNum) {
  if (baseDay && baseDay.narration && baseDay.narration.day_title) return s(baseDay.narration.day_title);
  return "Day " + dayNum;
}
function getSegmentByPurpose(baseDay, purpose) {
  if (!baseDay || !Array.isArray(baseDay.segments)) return null;
  for (let i = 0; i < baseDay.segments.length; i++) {
    if (s(baseDay.segments[i].purpose) === purpose) return baseDay.segments[i];
  }
  return null;
}
function getSegmentTitle(seg) {
  if (!seg) return "";
  if (seg.narration && seg.narration.title) return s(seg.narration.title);
  return segmentTitle(s(seg.purpose), s(seg.segment_type));
}
function buildDayFormatText(baseDay) {
  if (!baseDay || !Array.isArray(baseDay.segments)) return "";

  let hasWarm = false, hasCool = false;
  let hasMain = false, hasSecondary = false, hasAccessory = false;
  let hasSuperset = false, hasGiant = false;

  for (let i = 0; i < baseDay.segments.length; i++) {
    const seg = baseDay.segments[i];
    const p = s(seg.purpose);
    const t = s(seg.segment_type);

    if (t === "warmup" || p === "warmup") hasWarm = true;
    if (t === "cooldown" || p === "cooldown") hasCool = true;

    if (p === "main") hasMain = true;
    if (p === "secondary") hasSecondary = true;
    if (p === "accessory") hasAccessory = true;
    if (t === "superset") hasSuperset = true;
    if (t === "giant_set") hasGiant = true;
  }

  const parts = [];
  if (hasWarm) parts.push("Warm-up");
  if (hasMain) parts.push("Main");
  if (hasSecondary) parts.push(hasSuperset ? "Superset" : "Secondary");
  if (hasAccessory) parts.push(hasGiant ? "Circuit" : "Accessories");
  if (hasCool) parts.push("Cool-down");

  return parts.join(" + ");
}

/* ------------------ timing helpers ------------------ */

function repMidpoint(repStr, fallback) {
  let t = s(repStr);
  if (!t) return fallback;

  t = t.replace(/–/g, "-").replace(/to/gi, "-");
  const m = t.match(/(\d+)\s*-\s*(\d+)/);
  if (m && m[1] && m[2]) {
    const a = toInt(m[1], fallback);
    const b = toInt(m[2], fallback);
    if (a && b) return Math.round((a + b) / 2);
  }
  const m2 = t.match(/(\d+)/);
  if (m2 && m2[1]) return toInt(m2[1], fallback);
  return fallback;
}
function tempoSecondsPerRep(tempoStr, fallback) {
  const t = s(tempoStr);
  if (!t) return fallback;
  const parts = t
    .split("-")
    .map((x) => parseInt(String(x || "").trim(), 10))
    .filter((x) => Number.isFinite(x));
  if (!parts.length) return fallback;
  let sum = 0;
  for (let i = 0; i < parts.length; i++) sum += parts[i];
  return sum > 0 ? sum : fallback;
}
function getRestSec(seg, item, defaultRest) {
  const r1 = toInt(item && item.rest_after_set_sec, 0);
  if (r1 > 0) return r1;
  const r2 = toInt(seg && seg.rest_after_set_sec, 0);
  if (r2 > 0) return r2;
  return defaultRest;
}
function estimateSegmentRawSeconds(seg, cfg) {
  if (!seg) return 0;

  const segType = s(seg.segment_type);
  const purpose = s(seg.purpose);
  if (
    segType === "warmup" ||
    segType === "cooldown" ||
    purpose === "warmup" ||
    purpose === "cooldown"
  ) {
    return 0; // handled as fixed allocations
  }

  if (seg.time_cap_sec != null) {
    return toInt(seg.time_cap_sec, 0);
  }

  const rounds = clampInt(seg.rounds, 1, 20);
  const items = Array.isArray(seg.items) ? seg.items : [];
  if (!items.length) return 0;

  const DEFAULT_REPS_FALLBACK = cfg.default_reps_fallback;
  const DEFAULT_SPR = cfg.default_seconds_per_rep;
  const SET_OVERHEAD_SEC = cfg.set_overhead_sec;
  const BETWEEN_EXERCISE_TRANSITION_SEC = cfg.between_exercise_transition_sec;
  const BETWEEN_PAIR_TRANSITION_SEC = cfg.between_pair_transition_sec;
  const DEFAULT_REST_SEC = cfg.default_rest_sec;

  let total = 0;

  if (segType === "superset" || segType === "giant_set") {
    let perRound = 0;

    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      const reps = repMidpoint(it.reps_prescribed, DEFAULT_REPS_FALLBACK);
      const spr = tempoSecondsPerRep(it.tempo_prescribed, DEFAULT_SPR);
      const itSets = clampInt(it.sets, 1, 10);

      perRound += itSets * reps * spr + itSets * SET_OVERHEAD_SEC;
    }

    if (items.length > 1) perRound += (items.length - 1) * BETWEEN_PAIR_TRANSITION_SEC;

    const restSec = getRestSec(seg, null, DEFAULT_REST_SEC);

    total += rounds * perRound;
    if (rounds > 1) total += (rounds - 1) * restSec;

    return Math.round(total);
  }

  for (let j = 0; j < items.length; j++) {
    const it2 = items[j] || {};
    const sets = clampInt(it2.sets, 1, 20);
    const reps2 = repMidpoint(it2.reps_prescribed, DEFAULT_REPS_FALLBACK);
    const spr2 = tempoSecondsPerRep(it2.tempo_prescribed, DEFAULT_SPR);
    const rest2 = getRestSec(seg, it2, DEFAULT_REST_SEC);

    total += sets * reps2 * spr2 + sets * SET_OVERHEAD_SEC;

    if (sets > 1) total += (sets - 1) * rest2;

    if (j < items.length - 1) total += BETWEEN_EXERCISE_TRANSITION_SEC;
  }

  if (rounds > 1) {
    const restR = getRestSec(seg, null, DEFAULT_REST_SEC);
    total = total * rounds + (rounds - 1) * restR;
  }

  return Math.round(total);
}
function allocateSegmentSecondsFullDay(baseDay, dayTotalSec, cfg) {
  const out = {};
  if (!baseDay || !Array.isArray(baseDay.segments)) return out;

  const segs = baseDay.segments;

  let warmIdx = -1;
  let coolIdx = -1;

  for (let i = 0; i < segs.length; i++) {
    const st = s(segs[i] && segs[i].segment_type);
    const p = s(segs[i] && segs[i].purpose);
    if ((st === "warmup" || p === "warmup") && warmIdx < 0) warmIdx = i;
    if ((st === "cooldown" || p === "cooldown") && coolIdx < 0) coolIdx = i;
  }

  let warmSec = warmIdx >= 0 ? clampInt(cfg.warmup_seconds, 0, 3600) : 0;
  let coolSec = coolIdx >= 0 ? clampInt(cfg.cooldown_seconds, 0, 3600) : 0;

  if (warmSec + coolSec > dayTotalSec) {
    let over = warmSec + coolSec - dayTotalSec;
    const takeCool = Math.min(coolSec, over);
    coolSec -= takeCool;
    over -= takeCool;
    if (over > 0) warmSec = Math.max(0, warmSec - over);
  }

  if (warmIdx >= 0) out[String(warmIdx)] = warmSec;
  if (coolIdx >= 0) out[String(coolIdx)] = coolSec;

  let remaining = dayTotalSec - warmSec - coolSec;
  if (remaining < 0) remaining = 0;

  const raws = [];
  let sumRaw = 0;

  for (let j = 0; j < segs.length; j++) {
    if (j === warmIdx || j === coolIdx) continue;
    let raw = estimateSegmentRawSeconds(segs[j], cfg);
    if (raw < cfg.min_segment_seconds) raw = cfg.min_segment_seconds;
    raws.push({ idx: j, raw });
    sumRaw += raw;
  }

  if (!raws.length) {
    let running0 = 0;
    for (let k0 = 0; k0 < segs.length; k0++) running0 += toInt(out[String(k0)], 0);
    const diff0 = dayTotalSec - running0;
    if (coolIdx >= 0) out[String(coolIdx)] = toInt(out[String(coolIdx)], 0) + diff0;
    else if (warmIdx >= 0) out[String(warmIdx)] = toInt(out[String(warmIdx)], 0) + diff0;
    return out;
  }

  const scale = sumRaw > 0 ? remaining / sumRaw : 0;

  let running = warmSec + coolSec;
  for (let k = 0; k < raws.length; k++) {
    let alloc = Math.round(raws[k].raw * scale);
    if (alloc < cfg.min_segment_seconds && remaining > 0) alloc = cfg.min_segment_seconds;
    out[String(raws[k].idx)] = alloc;
    running += alloc;
  }

  let diff = dayTotalSec - running;
  if (raws.length) {
    const lastKey = String(raws[raws.length - 1].idx);
    out[lastKey] = toInt(out[lastKey], 0) + diff;

    if (out[lastKey] < cfg.min_segment_seconds && remaining > 0) {
      let deficit = cfg.min_segment_seconds - out[lastKey];
      out[lastKey] = cfg.min_segment_seconds;
      for (let z = raws.length - 2; z >= 0 && deficit > 0; z--) {
        const kk = String(raws[z].idx);
        const canTake = toInt(out[kk], 0) - cfg.min_segment_seconds;
        if (canTake > 0) {
          const take = Math.min(canTake, deficit);
          out[kk] = toInt(out[kk], 0) - take;
          deficit -= take;
        }
      }
    }
  }

  return out;
}

/* ------------------ helpers (exported for tests) ------------------ */

export function roundSegmentDurationSeconds(rawSec) {
  const t = typeof rawSec === "number" && Number.isFinite(rawSec) ? rawSec : 0;
  if (t < 0) return 0;
  return Math.round(t / 60) * 60;
}

/* ------------------ exporter ------------------ */

export async function emitPlanRows({
  program,
  catalogJson,
  anchorDayMs,
  anchorDateMs,
  preferredDaysJson,
  programLength,
  warmupSeconds,
  cooldownSeconds,

  // timing knobs
  timing_default_reps_fallback,
  timing_default_seconds_per_rep,
  timing_set_overhead_sec,
  timing_between_exercise_transition_sec,
  timing_between_pair_transition_sec,
  timing_default_rest_sec,
  timing_min_segment_seconds,
} = {}) {
  if (!program) throw new Error("emitPlanRows: missing program");

  const catalog = safeJsonParse(catalogJson, null);
  const byId = buildCatalogIndex(catalog);

  const timingCfg = {
    warmup_seconds: toInt(warmupSeconds, 300),
    cooldown_seconds: toInt(cooldownSeconds, 120),

    default_reps_fallback: toInt(timing_default_reps_fallback, 10),
    default_seconds_per_rep: toInt(timing_default_seconds_per_rep, 4),
    set_overhead_sec: toInt(timing_set_overhead_sec, 8),
    between_exercise_transition_sec: toInt(timing_between_exercise_transition_sec, 10),
    between_pair_transition_sec: toInt(timing_between_pair_transition_sec, 5),
    default_rest_sec: toInt(timing_default_rest_sec, 60),

    min_segment_seconds: toInt(timing_min_segment_seconds, 30),
  };

  if (!program || !Array.isArray(program.days)) {
    return { rows: ["__ERROR__|Invalid program"], debug: { ok: false, error: "Invalid program.days" } };
  }

  // Weeks: prefer explicit override, else narration weeks length, else program.weeks length, else fallback
  let program_length_weeks = toInt(programLength, 0);
  if (!program_length_weeks) {
    if (program.narration && Array.isArray(program.narration.weeks) && program.narration.weeks.length) {
      program_length_weeks = program.narration.weeks.length;
    } else if (Array.isArray(program.weeks) && program.weeks.length) {
      program_length_weeks = program.weeks.length;
    } else {
      program_length_weeks = 4;
    }
  }
  if (program_length_weeks < 1) program_length_weeks = 1;

  // Scheduling inputs
  const anchorMs = toInt(anchorDayMs ?? anchorDateMs, Date.now());
  const prefsIdx = parsePreferredDays(preferredDaysJson);

  const days_per_week = prefsIdx.length ? prefsIdx.length : (program.days_per_week || program.days.length);
  const anchorIdx = anchorDowFromMs(anchorMs);
  const startOff = nextPreferredOffset(anchorIdx, prefsIdx);
  const startDow = (anchorIdx + startOff) % 7;

  const prefLabels = [];
  for (let pi = 0; pi < prefsIdx.length; pi++) prefLabels.push(weekdayLabel(prefsIdx[pi]));

  // Program narration fields
  let programTitle = "";
  let programSummary = "";
  if (program.narration && program.narration.program) {
    programTitle = s(program.narration.program.title);
    programSummary = s(program.narration.program.summary);
  }

  const rows = [];

  rows.push([
    "PRG",
    programTitle,
    programSummary,
    String(program_length_weeks),
    String(days_per_week),
    s(jOrEmpty(program)),
    String(startOff),
    weekdayLabel(startDow),
    s(JSON.stringify(prefLabels)),
  ].join("|"));

  const weekIdx = buildWeekIndex(program);

  for (let wk = 1; wk <= program_length_weeks; wk++) {
    const w = weekIdx[String(wk)] || {};
    const focus = s(w.focus) || s(w.title);
    const notes = s(w.notes);
    rows.push(["WEEK", String(wk), focus, notes].join("|"));
  }

  function findBaseDay(dayNum) {
    for (let i = 0; i < program.days.length; i++) {
      if (toInt(program.days[i].day_index, 0) === dayNum) return program.days[i];
    }
    return null;
  }

  let globalDayIndex = 0;

  for (let wk2 = 1; wk2 <= program_length_weeks; wk2++) {
    for (let dnum = 1; dnum <= days_per_week; dnum++) {
      const baseDay = findBaseDay(dnum);
      if (!baseDay) continue;

      globalDayIndex++;

      const off = scheduledOffsetDays(wk2, dnum, prefsIdx);
      const dowIdx = (startDow + (off % 7)) % 7;

      const pdKey = "PD_W" + wk2 + "_D" + dnum;

      const dayLabel = getDayLabel(baseDay, dnum);
      const dayFormatText = buildDayFormatText(baseDay);

      const mainSeg = getSegmentByPurpose(baseDay, "main");
      const secondarySeg = getSegmentByPurpose(baseDay, "secondary");
      const accessorySeg = getSegmentByPurpose(baseDay, "accessory");

      const mainText = getSegmentTitle(mainSeg);
      const secondaryText = getSegmentTitle(secondarySeg);
      const finisherText = getSegmentTitle(accessorySeg);

      rows.push([
        "DAY",
        String(wk2),
        String(dnum),
        String(globalDayIndex),
        s(dayLabel),
        s(baseDay.day_type),
        n(baseDay.duration_mins),
        s(dayFormatText),
        s(mainText),
        s(secondaryText),
        s(finisherText),
        String(off),
        weekdayLabel(dowIdx),
        s(pdKey),
      ].join("|"));

      if (!Array.isArray(baseDay.segments)) continue;

      let dayTotalSec = toInt(baseDay.duration_mins, 0) * 60;
      if (dayTotalSec < 0) dayTotalSec = 0;

      const segAlloc = allocateSegmentSecondsFullDay(baseDay, dayTotalSec, timingCfg);

      let orderInDay = 1;

      for (let si = 0; si < baseDay.segments.length; si++) {
        const seg = baseDay.segments[si];
        const purpose = s(seg.purpose);
        const segType = s(seg.segment_type);

        const block_order = si + 1;
        const block_key = "B" + block_order;
        const segment_key = block_key + "_S1";

        let segSec = toInt(segAlloc[String(si)], 0);
        if (segSec < 0) segSec = 0;
        const segMMSS = mmss(segSec);

        const segNotes = segmentNotesFromNarration(seg);
        const scoreCfg = scoreTypeLabelConfig(seg);

        // SEG row (schema preserved; fixed columns)
        rows.push([
          "SEG",
          s(segment_key),
          s(segType),
          s(segmentTitleFromNarration(seg)),
          s(scoreCfg.score_type),   // col 5
          s(scoreCfg.primary),      // col 6
          s(scoreCfg.secondary),    // col 7
          n(seg.rounds),            // col 8
          s(segNotes),              // col 9 ✅
          "{}",
          String(segSec),           // col 11
          s(segMMSS),               // col 12
          s(block_key),
          "1",
          String(block_order),
          s(purpose),
          s(purpose ? (purpose.charAt(0).toUpperCase() + purpose.slice(1)) : ""),
          "",                       // col 18 (leave empty)
          s(pdKey),
          n(seg.post_segment_rest_sec ?? 0), // col 19
        ].join("|"));

        const items = Array.isArray(seg.items) ? seg.items : [];
        if (!items.length) continue;

        for (let ii = 0; ii < items.length; ii++) {
          const it = items[ii];
          const ex = byId[String(it.ex_id)];

          rows.push([
            "EX",
            s(it.ex_id),
            String(orderInDay++),
            String(block_order),
            s(purpose),
            s(purpose.charAt(0).toUpperCase() + purpose.slice(1)),
            String(ii + 1),
            n(it.sets),
            s(it.reps_prescribed),
            "reps",
            s(it.rir_target ? "~" + it.rir_target + " RIR" : ""),
            s(it.tempo_prescribed),
            n(it.rest_after_set_sec),
            buildWarmup(ex),
            s(block_key),
            "",
            "",
            s(segment_key),
            s(segType),
            "",
            n(seg.rounds),
            "1",
            String(ii + 1),
            "{}",
            "",
            s(pdKey),
          ].join("|"));
        }
      }
    }
  }

  return {
    rows,
    debug: {
      ok: true,
      weeks_emitted: program_length_weeks,
      days_per_week,
      preferred_days: prefsIdx.map((i) => weekdayLabel(i)),
      start_offset_days: startOff,
      start_weekday: weekdayLabel(startDow),
      timing_cfg: timingCfg,
    },
  };
}