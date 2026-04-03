import { scoreConditioningSequence } from "./conditioningScoring.js";

function toStr(v) {
  return v === null || v === undefined ? "" : String(v);
}

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return fallback;
  }
}

function normalizeArr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    const parsed = safeJsonParse(s, null);
    if (Array.isArray(parsed)) return parsed;
    if (s.indexOf(",") >= 0) return s.split(",").map((x) => x.trim()).filter(Boolean);
    return [s];
  }
  return [];
}

export function canonicalName(name) {
  const PREFIXES = [
    "smith machine",
    "resistance band",
    "trap bar",
    "single-arm",
    "single arm",
    "ez-bar",
    "ez bar",
    "dumbbells",
    "dumbbell",
    "kettlebells",
    "kettlebell",
    "barbell",
    "machine",
    "sandbag",
    "cable",
    "trx",
  ];
  let s = toStr(name).trim().toLowerCase();
  if (!s) return "";
  for (const prefix of PREFIXES) {
    if (s.startsWith(prefix + " ")) {
      s = s.slice(prefix.length).trim();
      break;
    }
  }
  return s
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildIndex(cat) {
  const byId = Object.create(null);

  for (const raw of cat.ex || []) {
    const mc = toStr(raw.mc || raw.movement_class || raw.movementClass).trim();
    const tr = normalizeArr(
      raw.tr || raw.target_regions_json || raw.targetRegionsJson || raw.target_regions,
    );
    const wh = normalizeArr(raw.wh || raw.warmup_hooks || raw.warmup_hooks_json || raw.warmupHooks);

    byId[raw.id] = {
      id: raw.id,
      n: raw.n,
      cn: toStr(raw.cn || ""),
      mp: raw.mp || "",
      sw: raw.sw || "",
      sw2: raw.sw2 || "",
      pref: raw.pref || [],
      eq: raw.eq || [],
      den: raw.den || 0,
      cx: raw.cx || 0,
      impact_level: raw.impact_level || 0,
      engine_role: raw.engine_role || "",
      load: raw.load,
      strength_equivalent: raw.strength_equivalent === true,
      rank: Number(raw.rank ?? 0),
      hyrox_role: toStr(raw.hyrox_role || raw.hyroxRole || "").trim(),
      hyrox_station_index: Number.parseInt(toStr(raw.hyrox_station_index || raw.hyroxStationIndex).trim(), 10) || null,

      mc: mc,
      tr: tr,
      wh: wh,
    };
  }
  return byId;
}

export function hasPref(ex, pref) {
  if (!pref) return true;
  const p = Array.isArray(ex.pref) ? ex.pref : [];
  return p.indexOf(pref) >= 0;
}

export function dayHasRealExercise(blocks) {
  for (let i = 0; i < (blocks || []).length; i++) {
    const b = blocks[i];
    if (b && b.ex_id) return true;
  }
  return false;
}

export function isConditioning(ex) {
  const mp = toStr(ex.mp).toLowerCase();
  const sw = toStr(ex.sw).toLowerCase();
  const sw2 = toStr(ex.sw2).toLowerCase();
  const name = toStr(ex.n).toLowerCase();

  if (mp === "conditioning" || mp === "cardio" || mp === "locomotion") return true;
  if (sw.indexOf("engine") >= 0 || sw2.indexOf("engine") >= 0) return true;

  if (
    name.indexOf("bike") >= 0 ||
    name.indexOf("row") >= 0 ||
    name.indexOf("ski") >= 0 ||
    name.indexOf("run") >= 0
  ) {
    return true;
  }
  if (name.indexOf("air bike") >= 0) return true;

  return false;
}

export function isLoadable(ex) {
  if (ex && typeof ex.load === "boolean") return ex.load;

  const eq = Array.isArray(ex && ex.eq) ? ex.eq : [];
  const s = eq.map((x) => toStr(x).toLowerCase());
  for (const it of s) {
    if (
      it === "barbell" ||
      it === "dumbbells" ||
      it === "kettlebells" ||
      it === "sandbag" ||
      it === "d-ball"
    ) {
      return true;
    }
  }
  return false;
}

export function regionsUsedToday(blocks, byId) {
  const set = new Set();
  for (const b of blocks || []) {
    if (!b || !b.ex_id) continue;
    const ex = byId[b.ex_id];
    if (!ex) continue;
    const tr = Array.isArray(ex.tr) ? ex.tr : [];
    for (const r of tr) {
      const rr = toStr(r).trim();
      if (rr) set.add(rr);
    }
  }
  return set;
}

export function sw2UsedToday(blocks) {
  const s = new Set();
  for (const b of blocks || []) {
    if (!b || !b.ex_id) continue;
    if (b.ex_sw2) s.add(b.ex_sw2);
  }
  return s;
}

export function pickBest(allowedSet, byId, sel, usedSet, usedRegionsSet, avoidCnSet) {
  const ranked = rankBest(allowedSet, byId, sel, usedSet, usedRegionsSet, avoidCnSet, 1);
  return ranked[0]?.ex ?? null;
}

export function rankBest(allowedSet, byId, sel, usedSet, usedRegionsSet, avoidCnSet, limit = Infinity) {
  const ranked = [];
  const mp = sel ? sel.mp : null;
  const sw = sel ? sel.sw : null;
  const swAny = Array.isArray(sel?.swAny) ? sel.swAny : null;
  const sw2 = sel ? sel.sw2 : null;
  const sw2Any = Array.isArray(sel?.sw2Any) ? sel.sw2Any : null;

  const requirePref = sel ? sel.requirePref : null;
  const prefMode = sel?.prefMode === "strict" ? "strict" : "soft";
  const prefBonus = Number.isFinite(Number(sel?.prefBonus)) ? Number(sel.prefBonus) : 4;
  const avoidSw2 = sel ? sel.avoidSw2 : null;
  const preferLoadable = sel ? !!sel.preferLoadable : false;
  const strengthEquivalentBonus = sel ? !!sel.strengthEquivalentBonus : false;

  const preferIsolation = sel ? !!sel.preferIsolation : false;
  const preferCompound = sel ? !!sel.preferCompound : false;

  for (const id of allowedSet) {
    const ex = byId[id];
    if (!ex) continue;
    if (usedSet && usedSet.has(id)) continue;
    if (avoidCnSet && ex.cn && avoidCnSet.has(ex.cn)) continue;

    const exMp = toStr(ex.mp);
    const exSw = toStr(ex.sw);
    const exSw2 = toStr(ex.sw2);
    const hasPrefMatch = requirePref ? hasPref(ex, requirePref) : true;

    if (avoidSw2 && exSw2 && exSw2 === avoidSw2) continue;

    let score = 0;

    if (sw2Any) {
      for (const candidateSw2 of sw2Any) {
        if (exSw2 === candidateSw2) {
          score += 12;
          break;
        }
      }
    }

    if (sw2) {
      if (exSw2 === sw2) score += 12;
    }

    if (swAny) {
      for (const candidateSw of swAny) {
        if (exSw === candidateSw) {
          score += 10;
          break;
        }
      }
    }

    if (sw) {
      if (exSw === sw) score += 10;
    }

    if (mp) {
      if (exMp === mp) score += 4;
    }

    if (score <= 0) continue;
    if (requirePref && prefMode === "strict" && !hasPrefMatch) continue;

    if (requirePref && prefMode === "soft" && hasPrefMatch) {
      score += prefBonus;
    }

    if (strengthEquivalentBonus && ex.strength_equivalent === true) {
      score += 3;
    }

    if (preferIsolation && ex.mc === "isolation") score += 1.5;
    if (preferCompound && ex.mc === "compound") score += 1.5;

    if (preferLoadable) {
      if (isLoadable(ex)) score += 1.0;
      else score -= 0.1;
    }

    if (usedRegionsSet && usedRegionsSet.size) {
      const tr = Array.isArray(ex.tr) ? ex.tr : [];
      let overlap = 0;
      for (const r of tr) {
        const rr = toStr(r).trim();
        if (rr && usedRegionsSet.has(rr)) overlap++;
      }
      if (overlap >= 2) score -= 1.5;
      else if (overlap === 1) score -= 0.3;
    }

    if (ex.den === 1) score += 0.2;
    if (ex.cx === 1) score += 0.05;

    // Prefer exercises that match the athlete's fitness level:
    // higher min_fitness_rank = more challenging = preferred by advanced athletes
    if (sel.rankValue > 0) {
      score += Math.min(ex.rank ?? 0, sel.rankValue) * 0.5;
    }

    // Conditioning sequence scoring (no-op for non-conditioning programs)
    if (sel.programType === "conditioning" && sel.condState) {
      score += scoreConditioningSequence(
        ex,
        sel.condState,
        sel.rankValue ?? 0,
        sel.condThresholds ?? {},
      );
    }

    ranked.push({ ex, score });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return toStr(a.ex?.n).localeCompare(toStr(b.ex?.n));
  });

  return Number.isFinite(limit) ? ranked.slice(0, limit) : ranked;
}

export function pickSeedExerciseForSlot(allowedSet, byId, sel) {
  if (sel.sw2 || (sel.sw2Any && sel.sw2Any.length > 0)) {
    const ex1 = pickBest(
      allowedSet,
      byId,
      { mp: null, sw: null, sw2: sel.sw2, sw2Any: sel.sw2Any || null, requirePref: null },
      null,
      null,
    );
    if (ex1 && !isConditioning(ex1)) return ex1;
  }

  const swList = (sel.swAny && sel.swAny.length > 0) ? sel.swAny : (sel.sw ? [sel.sw] : null);
  if (swList) {
    for (const sw of swList) {
      const ex2 = pickBest(
        allowedSet,
        byId,
        { mp: null, sw: sw, sw2: null, requirePref: null },
        null,
        null,
      );
      if (ex2 && !isConditioning(ex2)) return ex2;
    }
  }

  if (sel.mp) {
    const ex3 = pickBest(
      allowedSet,
      byId,
      { mp: sel.mp, sw: null, sw2: null, requirePref: null },
      null,
      null,
    );
    if (ex3 && !isConditioning(ex3)) return ex3;
  }

  let first = null;
  let firstPref = null;
  for (const id of allowedSet) {
    const ex = byId[id];
    if (!ex) continue;
    if (isConditioning(ex)) continue;
    if (!first) first = ex;
    if (sel.requirePref && hasPref(ex, sel.requirePref) && !firstPref) firstPref = ex;
  }
  return firstPref || first || null;
}

function mergeUsedSets(...sets) {
  const merged = new Set();
  for (const set of sets) {
    if (!(set instanceof Set)) continue;
    for (const value of set) merged.add(value);
  }
  return merged.size > 0 ? merged : null;
}

export function pickWithFallback(allowedSet, byId, sel, usedWeek, stats, usedToday, usedRegionsSet, usedCanonicalNamesSet) {
  const sharedFields = {
    prefMode: sel.prefMode,
    prefBonus: sel.prefBonus,
    preferLoadable: sel.preferLoadable,
    preferIsolation: sel.preferIsolation,
    preferCompound: sel.preferCompound,
    strengthEquivalentBonus: sel.strengthEquivalentBonus,
    rankValue: sel.rankValue,
    programType: sel.programType,
    condState: sel.condState,
    condThresholds: sel.condThresholds,
  };

  function attempt(mp, sw, sw2, sw2Any, requirePref, primaryUsedSet) {
    const primarySet = primaryUsedSet ?? null;
    const picked = pickBest(
      allowedSet,
      byId,
      { mp, sw, sw2, sw2Any, requirePref, ...sharedFields },
      primarySet,
      usedRegionsSet,
      usedCanonicalNamesSet,
    );
    if (picked && usedCanonicalNamesSet && usedCanonicalNamesSet.size > 0 && stats) {
      stats.avoided_repeat_cn = Number(stats.avoided_repeat_cn || 0) + 1;
    }
    return picked;
  }

  function attemptWithFallback(mp, sw, sw2, sw2Any, requirePref, primaryUsedSet, fallbackUsedSet = primaryUsedSet) {
    const first = attempt(mp, sw, sw2, sw2Any, requirePref, primaryUsedSet, fallbackUsedSet);
    if (first) return first;
    if (fallbackUsedSet === primaryUsedSet) return null;
    return attempt(mp, sw, sw2, sw2Any, requirePref, fallbackUsedSet, fallbackUsedSet);
  }

  const exactAvoidUsedSet = mergeUsedSets(usedWeek, usedToday);
  const weekOnlyUsedSet = usedWeek instanceof Set && usedWeek.size > 0 ? usedWeek : null;
  const todayOnlyUsedSet = usedToday instanceof Set && usedToday.size > 0 ? usedToday : null;

  if (sel.selectionMode === "benchmark_exactness") {
    const ex = attemptWithFallback(
      sel.mp || null,
      sel.sw || null,
      sel.sw2 || null,
      sel.sw2Any || null,
      sel.requirePref,
      exactAvoidUsedSet,
      weekOnlyUsedSet,
    );
    if (ex) {
      stats.picked_benchmark_exact = Number(stats.picked_benchmark_exact || 0) + 1;
      return ex;
    }
  }

  let ex = attemptWithFallback(
    null,
    null,
    sel.sw2,
    sel.sw2Any || null,
    sel.requirePref,
    exactAvoidUsedSet,
    weekOnlyUsedSet,
  );
  if (ex) {
    stats.picked_sw2_pref++;
    return ex;
  }

  const swList = (sel.swAny && sel.swAny.length > 0) ? sel.swAny : (sel.sw ? [sel.sw] : null);
  if (swList) {
    for (const sw of swList) {
      ex = attemptWithFallback(null, sw, null, null, sel.requirePref, exactAvoidUsedSet, weekOnlyUsedSet);
      if (ex) {
        stats.picked_sw_pref++;
        return ex;
      }
    }
  }

  ex = attemptWithFallback(sel.mp, null, null, null, sel.requirePref, exactAvoidUsedSet, weekOnlyUsedSet);
  if (ex) {
    stats.picked_mp_pref++;
    return ex;
  }

  // Strict-pref: allow repeating a correct-pref exercise before picking any wrong-pref exercise
  if (sel.requirePref && sel.prefMode === "strict") {
    ex = attemptWithFallback(
      null,
      null,
      sel.sw2,
      sel.sw2Any || null,
      sel.requirePref,
      todayOnlyUsedSet,
      null,
    );
    if (ex) { stats.picked_pref_repeat = (stats.picked_pref_repeat || 0) + 1; return ex; }
    if (swList) {
      for (const sw of swList) {
        ex = attemptWithFallback(null, sw, null, null, sel.requirePref, todayOnlyUsedSet, null);
        if (ex) { stats.picked_pref_repeat = (stats.picked_pref_repeat || 0) + 1; return ex; }
      }
    }
    ex = attemptWithFallback(sel.mp, null, null, null, sel.requirePref, todayOnlyUsedSet, null);
    if (ex) { stats.picked_pref_repeat = (stats.picked_pref_repeat || 0) + 1; return ex; }
  }

  if (sel.requirePref) {
    ex = attemptWithFallback(null, null, sel.sw2, sel.sw2Any || null, null, exactAvoidUsedSet, weekOnlyUsedSet);
    if (ex) {
      stats.picked_sw2_relaxed++;
      return ex;
    }
  }

  if (sel.requirePref && swList) {
    for (const sw of swList) {
      ex = attemptWithFallback(null, sw, null, null, null, exactAvoidUsedSet, weekOnlyUsedSet);
      if (ex) {
        stats.picked_sw_relaxed++;
        return ex;
      }
    }
  }

  if (sel.requirePref) {
    ex = attemptWithFallback(sel.mp, null, null, null, null, exactAvoidUsedSet, weekOnlyUsedSet);
    if (ex) {
      stats.picked_mp_relaxed++;
      return ex;
    }
  }

  const exDup =
    pickBest(allowedSet, byId, { mp: null, sw: null, sw2: sel.sw2, sw2Any: sel.sw2Any || null, requirePref: sel.requirePref, ...sharedFields }, todayOnlyUsedSet, usedRegionsSet) ||
    (swList
      ? (() => {
          for (const sw of swList) {
            const e = pickBest(allowedSet, byId, { mp: null, sw: sw, sw2: null, requirePref: sel.requirePref, ...sharedFields }, todayOnlyUsedSet, usedRegionsSet);
            if (e) return e;
          }
          return null;
        })()
      : null) ||
    pickBest(allowedSet, byId, { mp: sel.mp, sw: null, sw2: null, requirePref: sel.requirePref, ...sharedFields }, todayOnlyUsedSet, usedRegionsSet) ||
    pickBest(allowedSet, byId, { mp: null, sw: null, sw2: sel.sw2, sw2Any: sel.sw2Any || null, requirePref: null, ...sharedFields }, todayOnlyUsedSet, usedRegionsSet) ||
    (swList
      ? (() => {
          for (const sw of swList) {
            const e = pickBest(allowedSet, byId, { mp: null, sw: sw, sw2: null, requirePref: null, ...sharedFields }, todayOnlyUsedSet, usedRegionsSet);
            if (e) return e;
          }
          return null;
        })()
      : null) ||
    pickBest(allowedSet, byId, { mp: sel.mp, sw: null, sw2: null, requirePref: null, ...sharedFields }, todayOnlyUsedSet, usedRegionsSet) ||
    pickBest(allowedSet, byId, { mp: null, sw: null, sw2: sel.sw2, sw2Any: sel.sw2Any || null, requirePref: sel.requirePref, ...sharedFields }, null, usedRegionsSet) ||
    (swList
      ? (() => {
          for (const sw of swList) {
            const e = pickBest(allowedSet, byId, { mp: null, sw: sw, sw2: null, requirePref: sel.requirePref, ...sharedFields }, null, usedRegionsSet);
            if (e) return e;
          }
          return null;
        })()
      : null) ||
    pickBest(allowedSet, byId, { mp: sel.mp, sw: null, sw2: null, requirePref: sel.requirePref, ...sharedFields }, null, usedRegionsSet) ||
    pickBest(allowedSet, byId, { mp: null, sw: null, sw2: sel.sw2, sw2Any: sel.sw2Any || null, requirePref: null, ...sharedFields }, null, usedRegionsSet) ||
    (swList
      ? (() => {
          for (const sw of swList) {
            const e = pickBest(allowedSet, byId, { mp: null, sw: sw, sw2: null, requirePref: null, ...sharedFields }, null, usedRegionsSet);
            if (e) return e;
          }
          return null;
        })()
      : null) ||
    pickBest(allowedSet, byId, { mp: sel.mp, sw: null, sw2: null, requirePref: null, ...sharedFields }, null, usedRegionsSet);

  if (exDup) {
    stats.picked_allow_dup++;
    return exDup;
  }

  return null;
}

function toRankedDebugCandidates(ranked) {
  return (ranked || []).map(({ ex, score }) => ({
    exercise_id: ex?.id ?? null,
    exercise_name: ex?.n ?? "",
    score: Number(Number(score).toFixed(2)),
    mp: ex?.mp || "",
    sw: ex?.sw || "",
    sw2: ex?.sw2 || "",
  }));
}

export function debugRankWithFallback(
  allowedSet,
  byId,
  sel,
  usedWeek,
  usedToday,
  usedRegionsSet,
  usedCanonicalNamesSet,
  limit = 5,
) {
  const sharedFields = {
    prefMode: sel.prefMode,
    prefBonus: sel.prefBonus,
    preferLoadable: sel.preferLoadable,
    preferIsolation: sel.preferIsolation,
    preferCompound: sel.preferCompound,
    strengthEquivalentBonus: sel.strengthEquivalentBonus,
    rankValue: sel.rankValue,
    programType: sel.programType,
    condState: sel.condState,
    condThresholds: sel.condThresholds,
  };

  const swList = (sel.swAny && sel.swAny.length > 0) ? sel.swAny : (sel.sw ? [sel.sw] : []);
  const attempts = [];
  const exactAvoidUsedSet = mergeUsedSets(usedWeek, usedToday);
  const weekOnlyUsedSet = usedWeek instanceof Set && usedWeek.size > 0 ? usedWeek : null;
  const todayOnlyUsedSet = usedToday instanceof Set && usedToday.size > 0 ? usedToday : null;

  function recordAttempt(label, ranked) {
    attempts.push({
      label,
      candidate_count: ranked.length,
      candidates: toRankedDebugCandidates(ranked.slice(0, limit)),
    });
    if (ranked.length > 0) {
      return {
        selected_attempt_label: label,
        ranked_candidates: toRankedDebugCandidates(ranked.slice(0, limit)),
        selection_attempts: attempts,
      };
    }
    return null;
  }

  function recordTwoPass(baseLabel, selector, primaryUsedSet, fallbackUsedSet = primaryUsedSet, avoidCnSet = usedCanonicalNamesSet) {
    const rankedPrimary = rankBest(
      allowedSet,
      byId,
      selector,
      primaryUsedSet,
      usedRegionsSet,
      avoidCnSet,
      limit,
    );
    const primaryHit = recordAttempt(`${baseLabel}:avoid_repeat_exact_exercise`, rankedPrimary);
    if (primaryHit) return primaryHit;
    if (fallbackUsedSet === primaryUsedSet) return null;
    const rankedFallback = rankBest(
      allowedSet,
      byId,
      selector,
      fallbackUsedSet,
      usedRegionsSet,
      avoidCnSet,
      limit,
    );
    return recordAttempt(`${baseLabel}:fallback_allow_repeat_exact_exercise`, rankedFallback);
  }

  if (sel.selectionMode === "benchmark_exactness") {
    const hit = recordTwoPass(
      "benchmark_exact",
      { mp: sel.mp || null, sw: sel.sw || null, sw2: sel.sw2 || null, sw2Any: sel.sw2Any || null, requirePref: sel.requirePref, ...sharedFields },
      exactAvoidUsedSet,
      weekOnlyUsedSet,
    );
    if (hit) return hit;
  }

  {
    const hit = recordTwoPass(
      "sw2_pref",
      { mp: null, sw: null, sw2: sel.sw2, sw2Any: sel.sw2Any || null, requirePref: sel.requirePref, ...sharedFields },
      exactAvoidUsedSet,
      weekOnlyUsedSet,
    );
    if (hit) return hit;
  }

  for (const sw of swList) {
    const hit = recordTwoPass(
      `sw_pref:${sw}`,
      { mp: null, sw, sw2: null, requirePref: sel.requirePref, ...sharedFields },
      exactAvoidUsedSet,
      weekOnlyUsedSet,
    );
    if (hit) return hit;
  }

  {
    const hit = recordTwoPass(
      "mp_pref",
      { mp: sel.mp, sw: null, sw2: null, requirePref: sel.requirePref, ...sharedFields },
      exactAvoidUsedSet,
      weekOnlyUsedSet,
    );
    if (hit) return hit;
  }

  if (sel.requirePref && sel.prefMode === "strict") {
    {
      const hit = recordTwoPass(
        "strict_pref_repeat:sw2",
        { mp: null, sw: null, sw2: sel.sw2, sw2Any: sel.sw2Any || null, requirePref: sel.requirePref, ...sharedFields },
        todayOnlyUsedSet,
        null,
      );
      if (hit) return hit;
    }
    for (const sw of swList) {
      const hit = recordTwoPass(
        `strict_pref_repeat:${sw}`,
        { mp: null, sw, sw2: null, requirePref: sel.requirePref, ...sharedFields },
        todayOnlyUsedSet,
        null,
      );
      if (hit) return hit;
    }
    {
      const hit = recordTwoPass(
        "strict_pref_repeat:mp",
        { mp: sel.mp, sw: null, sw2: null, requirePref: sel.requirePref, ...sharedFields },
        todayOnlyUsedSet,
        null,
      );
      if (hit) return hit;
    }
  }

  if (sel.requirePref) {
    {
      const hit = recordTwoPass(
        "sw2_relaxed",
        { mp: null, sw: null, sw2: sel.sw2, sw2Any: sel.sw2Any || null, requirePref: null, ...sharedFields },
        exactAvoidUsedSet,
        weekOnlyUsedSet,
      );
      if (hit) return hit;
    }
    for (const sw of swList) {
      const hit = recordTwoPass(
        `sw_relaxed:${sw}`,
        { mp: null, sw, sw2: null, requirePref: null, ...sharedFields },
        exactAvoidUsedSet,
        weekOnlyUsedSet,
      );
      if (hit) return hit;
    }
    {
      const hit = recordTwoPass(
        "mp_relaxed",
        { mp: sel.mp, sw: null, sw2: null, requirePref: null, ...sharedFields },
        exactAvoidUsedSet,
        weekOnlyUsedSet,
      );
      if (hit) return hit;
    }
  }

  {
    const hit = recordTwoPass(
      "allow_dup:sw2_pref",
      { mp: null, sw: null, sw2: sel.sw2, sw2Any: sel.sw2Any || null, requirePref: sel.requirePref, ...sharedFields },
      todayOnlyUsedSet,
      null,
      null,
    );
    if (hit) return hit;
  }
  for (const sw of swList) {
    const hit = recordTwoPass(
      `allow_dup:${sw}`,
      { mp: null, sw, sw2: null, requirePref: sel.requirePref, ...sharedFields },
      todayOnlyUsedSet,
      null,
      null,
    );
    if (hit) return hit;
  }
  {
    const hit = recordTwoPass(
      "allow_dup:mp",
      { mp: sel.mp, sw: null, sw2: null, requirePref: sel.requirePref, ...sharedFields },
      todayOnlyUsedSet,
      null,
      null,
    );
    if (hit) return hit;
  }
  {
    const hit = recordTwoPass(
      "allow_dup:sw2_relaxed",
      { mp: null, sw: null, sw2: sel.sw2, sw2Any: sel.sw2Any || null, requirePref: null, ...sharedFields },
      todayOnlyUsedSet,
      null,
      null,
    );
    if (hit) return hit;
  }
  for (const sw of swList) {
    const hit = recordTwoPass(
      `allow_dup_relaxed:${sw}`,
      { mp: null, sw, sw2: null, requirePref: null, ...sharedFields },
      todayOnlyUsedSet,
      null,
      null,
    );
    if (hit) return hit;
  }
  {
    const hit = recordTwoPass(
      "allow_dup_relaxed:mp",
      { mp: sel.mp, sw: null, sw2: null, requirePref: null, ...sharedFields },
      todayOnlyUsedSet,
      null,
      null,
    );
    if (hit) return hit;
  }

  return {
    selected_attempt_label: null,
    ranked_candidates: [],
    selection_attempts: attempts,
  };
}

export function applyFillAddSets(blocks, targetSlot, addSets) {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].slot === targetSlot && blocks[i].ex_id) {
      blocks[i].sets = (blocks[i].sets || 0) + addSets;
      return true;
    }
  }
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].ex_id) {
      blocks[i].sets = (blocks[i].sets || 0) + addSets;
      return true;
    }
  }
  return false;
}

export function buildCatalogJsonFromBubble(exercises) {
  const ex = (exercises || []).map((r) => {
    const id = r.exercise_id || r.id || r.slug || r._id;
    const n = r.name || r.n || r.title || "";
    const cn = canonicalName(n);

    const sw = r.swap_group_id_1 || r.sw || "";
    const sw2 = r.swap_group_id_2 || r.swap_group_rollup || r.sw2 || "";
    const mp = r.movement_pattern_primary || r.mp || "";

    const pref = normalizeArr(r.preferred_in_json || r.pref || []);
    const eq = normalizeArr(r.equipment_json || r.equipment_items_json || r.eq || []);

    const den = Number(r.density_rating ?? r.den ?? 0);
    const cx = Number(r.complexity_rank ?? r.cx ?? 0);
    const impact_level = Number(r.impact_level ?? 0);
    const engine_role = toStr(r.engine_role || "").trim();

    const load =
      typeof r.is_loadable === "boolean" ? r.is_loadable : toStr(r.is_loadable).toLowerCase() === "true";
    const strength_equivalent =
      typeof r.strength_equivalent === "boolean"
        ? r.strength_equivalent
        : toStr(r.strength_equivalent).toLowerCase() === "true";

    const mc = toStr(r.movement_class || r.mc || "").trim();
    const rank = Number(r.min_fitness_rank ?? r.rank ?? 0);

    const tr = normalizeArr(r.target_regions_json || r.tr || []);
    const wh = normalizeArr(r.warmup_hooks || r.wh || []);
    const hyrox_role = toStr(r.hyrox_role || r.hyroxRole || "").trim();
    const hyrox_station_index_raw = Number.parseInt(
      toStr(r.hyrox_station_index || r.hyroxStationIndex).trim(),
      10,
    );
    const hyrox_station_index = Number.isFinite(hyrox_station_index_raw) ? hyrox_station_index_raw : null;

    return {
      id,
      n,
      cn,
      sw,
      sw2,
      mp,
      eq,
      pref,
      den,
      cx,
      impact_level,
      engine_role,
      load,
      strength_equivalent,
      rank,
      hyrox_role,
      hyrox_station_index,
      mc,
      tr,
      wh,
    };
  });

  return JSON.stringify({ schema: "catalog_v3", count: ex.length, ex });
}
