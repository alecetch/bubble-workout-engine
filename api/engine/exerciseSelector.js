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

export function pickBest(allowedSet, byId, sel, usedSet, usedRegionsSet) {
  let best = null;
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

    if (!best || score > best.score) best = { ex: ex, score: score };
  }

  return best ? best.ex : null;
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

function attemptAvoidRepeatSw2(allowedSet, byId, sel, usedWeek, usedSw2Set, usedRegionsSet, stats) {
  if (!sel.sw2) return null;
  if (!usedSw2Set || usedSw2Set.size === 0) return null;
  if (!usedSw2Set.has(sel.sw2)) return null;

  const swList = (sel.swAny && sel.swAny.length > 0) ? sel.swAny : (sel.sw ? [sel.sw] : []);
  for (const sw of swList) {
    const ex = pickBest(
      allowedSet,
      byId,
      {
        mp: null,
        sw: sw,
        sw2: null,
        requirePref: sel.requirePref,
        prefMode: sel.prefMode,
        prefBonus: sel.prefBonus,
        avoidSw2: sel.sw2,
        preferLoadable: sel.preferLoadable,
        preferIsolation: sel.preferIsolation,
        preferCompound: sel.preferCompound,
        strengthEquivalentBonus: sel.strengthEquivalentBonus,
      },
      usedWeek,
      usedRegionsSet,
    );
    if (ex) {
      stats.avoided_repeat_sw2++;
      return ex;
    }
  }

  if (sel.mp) {
    const ex2 = pickBest(
      allowedSet,
      byId,
      {
        mp: sel.mp,
        sw: null,
        sw2: null,
        requirePref: sel.requirePref,
        prefMode: sel.prefMode,
        prefBonus: sel.prefBonus,
        avoidSw2: sel.sw2,
        preferLoadable: sel.preferLoadable,
        preferIsolation: sel.preferIsolation,
        preferCompound: sel.preferCompound,
        strengthEquivalentBonus: sel.strengthEquivalentBonus,
      },
      usedWeek,
      usedRegionsSet,
    );
    if (ex2) {
      stats.avoided_repeat_sw2++;
      return ex2;
    }
  }
  return null;
}

export function pickWithFallback(allowedSet, byId, sel, usedWeek, stats, usedSw2Set, usedRegionsSet) {
  function attempt(mp, sw, sw2, sw2Any, requirePref) {
    return pickBest(
      allowedSet,
      byId,
      {
        mp: mp,
        sw: sw,
        sw2: sw2,
        sw2Any: sw2Any,
        requirePref: requirePref,
        prefMode: sel.prefMode,
        prefBonus: sel.prefBonus,
        preferLoadable: sel.preferLoadable,
        preferIsolation: sel.preferIsolation,
        preferCompound: sel.preferCompound,
        strengthEquivalentBonus: sel.strengthEquivalentBonus,
      },
      usedWeek,
      usedRegionsSet,
    );
  }

  let ex = attemptAvoidRepeatSw2(allowedSet, byId, sel, usedWeek, usedSw2Set, usedRegionsSet, stats);
  if (ex) return ex;

  ex = attempt(null, null, sel.sw2, sel.sw2Any || null, sel.requirePref);
  if (ex) {
    stats.picked_sw2_pref++;
    return ex;
  }

  const swList = (sel.swAny && sel.swAny.length > 0) ? sel.swAny : (sel.sw ? [sel.sw] : null);
  if (swList) {
    for (const sw of swList) {
      ex = attempt(null, sw, null, null, sel.requirePref);
      if (ex) {
        stats.picked_sw_pref++;
        return ex;
      }
    }
  }

  ex = attempt(sel.mp, null, null, null, sel.requirePref);
  if (ex) {
    stats.picked_mp_pref++;
    return ex;
  }

  if (sel.requirePref) {
    ex = attempt(null, null, sel.sw2, sel.sw2Any || null, null);
    if (ex) {
      stats.picked_sw2_relaxed++;
      return ex;
    }
  }

  if (sel.requirePref && swList) {
    for (const sw of swList) {
      ex = attempt(null, sw, null, null, null);
      if (ex) {
        stats.picked_sw_relaxed++;
        return ex;
      }
    }
  }

  if (sel.requirePref) {
    ex = attempt(sel.mp, null, null, null, null);
    if (ex) {
      stats.picked_mp_relaxed++;
      return ex;
    }
  }

  const exDup =
    pickBest(
      allowedSet,
      byId,
      {
        mp: null,
        sw: null,
        sw2: sel.sw2,
        sw2Any: sel.sw2Any || null,
        requirePref: sel.requirePref,
        prefMode: sel.prefMode,
        prefBonus: sel.prefBonus,
        strengthEquivalentBonus: sel.strengthEquivalentBonus,
      },
      null,
      usedRegionsSet,
    ) ||
    (swList
      ? (() => {
          for (const sw of swList) {
            const e = pickBest(
              allowedSet,
              byId,
              {
                mp: null,
                sw: sw,
                sw2: null,
                requirePref: sel.requirePref,
                prefMode: sel.prefMode,
                prefBonus: sel.prefBonus,
                strengthEquivalentBonus: sel.strengthEquivalentBonus,
              },
              null,
              usedRegionsSet,
            );
            if (e) return e;
          }
          return null;
        })()
      : null) ||
    pickBest(
      allowedSet,
      byId,
      {
        mp: sel.mp,
        sw: null,
        sw2: null,
        requirePref: sel.requirePref,
        prefMode: sel.prefMode,
        prefBonus: sel.prefBonus,
        strengthEquivalentBonus: sel.strengthEquivalentBonus,
      },
      null,
      usedRegionsSet,
    ) ||
    pickBest(
      allowedSet,
      byId,
      {
        mp: null,
        sw: null,
        sw2: sel.sw2,
        sw2Any: sel.sw2Any || null,
        requirePref: null,
        prefMode: sel.prefMode,
        prefBonus: sel.prefBonus,
        strengthEquivalentBonus: sel.strengthEquivalentBonus,
      },
      null,
      usedRegionsSet,
    ) ||
    (swList
      ? (() => {
          for (const sw of swList) {
            const e = pickBest(
              allowedSet,
              byId,
              {
                mp: null,
                sw: sw,
                sw2: null,
                requirePref: null,
                prefMode: sel.prefMode,
                prefBonus: sel.prefBonus,
                strengthEquivalentBonus: sel.strengthEquivalentBonus,
              },
              null,
              usedRegionsSet,
            );
            if (e) return e;
          }
          return null;
        })()
      : null) ||
    pickBest(
      allowedSet,
      byId,
      {
        mp: sel.mp,
        sw: null,
        sw2: null,
        requirePref: null,
        prefMode: sel.prefMode,
        prefBonus: sel.prefBonus,
        strengthEquivalentBonus: sel.strengthEquivalentBonus,
      },
      null,
      usedRegionsSet,
    );

  if (exDup) {
    stats.picked_allow_dup++;
    return exDup;
  }

  return null;
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

    return {
      id,
      n,
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
      mc,
      tr,
      wh,
    };
  });

  return JSON.stringify({ schema: "catalog_v3", count: ex.length, ex });
}
