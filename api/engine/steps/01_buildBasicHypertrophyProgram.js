// api/engine/steps/01_buildBasicHypertrophyProgram.js

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

function parseCsvArr(csv) {
  const t = toStr(csv).trim();
  if (!t) return [];
  return t
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function clampInt(n, lo, hi, fallback) {
  const v = parseInt(n, 10);
  if (!isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, v));
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

function buildIndex(cat) {
  const byId = Object.create(null);

  for (const raw of cat.ex || []) {
    const mc = toStr(raw.mc || raw.movement_class || raw.movementClass).trim();
    const tr = normalizeArr(
      raw.tr || raw.target_regions_json || raw.targetRegionsJson || raw.target_regions
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
      load: raw.load,

      mc: mc,
      tr: tr,
      wh: wh,
    };
  }
  return byId;
}

function hasPref(ex, pref) {
  if (!pref) return true;
  const p = Array.isArray(ex.pref) ? ex.pref : [];
  return p.indexOf(pref) >= 0;
}

function dayHasRealExercise(blocks) {
  for (let i = 0; i < (blocks || []).length; i++) {
    const b = blocks[i];
    if (b && b.ex_id) return true;
  }
  return false;
}

function isConditioning(ex) {
  const mp = toStr(ex.mp).toLowerCase();
  const sw = toStr(ex.sw).toLowerCase();
  const sw2 = toStr(ex.sw2).toLowerCase();
  const name = toStr(ex.n).toLowerCase();

  if (mp === "conditioning" || mp === "cardio" || mp === "locomotion") return true;
  if (sw.indexOf("engine") >= 0 || sw2.indexOf("engine") >= 0) return true;

  if (name.indexOf("bike") >= 0 || name.indexOf("row") >= 0 || name.indexOf("ski") >= 0 || name.indexOf("run") >= 0)
    return true;
  if (name.indexOf("air bike") >= 0) return true;

  return false;
}

function isLoadable(ex) {
  if (ex && typeof ex.load === "boolean") return ex.load;

  const eq = Array.isArray(ex && ex.eq) ? ex.eq : [];
  const s = eq.map((x) => toStr(x).toLowerCase());
  for (const it of s) {
    if (it === "barbell" || it === "dumbbells" || it === "kettlebells" || it === "sandbag" || it === "d-ball")
      return true;
  }
  return false;
}

function regionsUsedToday(blocks, byId) {
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

function pickBest(allowedSet, byId, sel, usedSet, usedRegionsSet) {
  let best = null;
  const mp = sel ? sel.mp : null;
  const sw = sel ? sel.sw : null;
  const sw2 = sel ? sel.sw2 : null;

  const requirePref = sel ? sel.requirePref : null;
  const avoidSw2 = sel ? sel.avoidSw2 : null;
  const preferLoadable = sel ? !!sel.preferLoadable : false;

  const preferIsolation = sel ? !!sel.preferIsolation : false;
  const preferCompound = sel ? !!sel.preferCompound : false;

  for (const id of allowedSet) {
    const ex = byId[id];
    if (!ex) continue;
    if (usedSet && usedSet.has(id)) continue;
    if (requirePref && !hasPref(ex, requirePref)) continue;

    const exMp = toStr(ex.mp);
    const exSw = toStr(ex.sw);
    const exSw2 = toStr(ex.sw2);

    if (avoidSw2 && exSw2 && exSw2 === avoidSw2) continue;

    let score = 0;

    if (sw2) {
      if (exSw2 === sw2) score += 12;
    }

    if (sw) {
      if (exSw === sw) score += 10;
    }

    if (mp) {
      if (exMp === mp) score += 4;
    }

    if (score <= 0) continue;

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

    if (!best || score > best.score) best = { ex: ex, score: score };
  }

  return best ? best.ex : null;
}

function setsByDuration(duration) {
  const map = {
    40: { A: 3, B: 3, C: 2, D: 2 },
    50: { A: 4, B: 3, C: 3, D: 2 },
    60: { A: 5, B: 4, C: 3, D: 3 },
  };
  return map[duration] || map[50];
}

function blockBudget(duration) {
  const map = { 40: 4, 50: 5, 60: 6 };
  return map[duration] || 5;
}

function findChosenExercise(blocks, slotName) {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i] && blocks[i].slot === slotName && blocks[i].ex_id) return blocks[i];
  }
  return null;
}

function sw2UsedToday(blocks) {
  const s = new Set();
  for (const b of blocks || []) {
    if (!b || !b.ex_id) continue;
    if (b.ex_sw2) s.add(b.ex_sw2);
  }
  return s;
}

function slotToSelector(slot, blocksSoFar) {
  const parts = slot.split(":");
  const blk = parts[0] || "";
  const key = parts[1] || "";

  const bLunge = findChosenExercise(blocksSoFar || [], "B:lunge");
  const bLungeSw = bLunge ? toStr(bLunge.ex_sw) : "";

  const quadPrimarySw = bLungeSw === "quad_iso_unilateral" ? "quad_iso_squat" : "quad_iso_unilateral";
  const quadFallbackSw = quadPrimarySw === "quad_iso_squat" ? "quad_iso_unilateral" : "quad_iso_squat";

  const m = {
    squat: { mp: null, sw: null, sw2: "squat_compound", requirePref: "strength_main" },
    hinge: { mp: null, sw: null, sw2: "hinge_compound", requirePref: "strength_main" },

    lunge: { mp: "lunge", sw: "quad_iso_unilateral", sw2: null, requirePref: null },
    quad: { mp: null, sw: quadPrimarySw, swAny: [quadPrimarySw, quadFallbackSw], sw2: null, requirePref: "hypertrophy_secondary" },
    hamstring_iso: { mp: null, sw: "hamstring_iso", sw2: null, requirePref: "hypertrophy_secondary" },
    glute: { mp: null, sw: "glute_iso", sw2: null, requirePref: "hypertrophy_secondary" },
    calves: { mp: null, sw: "calf_iso", sw2: null, requirePref: "hypertrophy_secondary", preferLoadable: true },
    core: { mp: "anti_extension", sw: "core", sw2: null, requirePref: null },

    push_horizontal: { mp: null, sw: null, sw2: "push_horizontal_compound", requirePref: "strength_main" },
    pull_horizontal: { mp: null, sw: null, sw2: "pull_horizontal_compound", requirePref: "hypertrophy_secondary" },
    push_vertical: { mp: "push_vertical", sw: "push_vertical", sw2: null, requirePref: "strength_main" },
    pull_vertical: { mp: "pull_vertical", sw: "pull_vertical", sw2: null, requirePref: "hypertrophy_secondary" },

    secondary_press: { mp: null, sw: "push_horizontal_db", sw2: "push_horizontal_compound", requirePref: "hypertrophy_secondary" },
    rear_delt: { mp: null, sw: "shoulder_iso", sw2: null, requirePref: "hypertrophy_secondary" },
    arms: { mp: null, sw: "arms", sw2: null, requirePref: "hypertrophy_secondary" },
    arms2: { mp: null, sw: "arms", sw2: null, requirePref: "hypertrophy_secondary" },

    secondary_lower: { mp: null, sw: null, sw2: "squat_compound", requirePref: "hypertrophy_secondary" },

    hinge_accessory: { mp: null, sw: "hamstring_iso", sw2: "hinge_compound", requirePref: "hypertrophy_secondary" },
  };

  const sel = m[key] || {};
  return {
    block: blk,
    key: key,
    slot: slot,

    mp: sel.mp || null,
    sw: sel.sw || null,
    swAny: Array.isArray(sel.swAny) ? sel.swAny : null,
    sw2: sel.sw2 || null,
    requirePref: sel.requirePref || null,
    preferLoadable: !!sel.preferLoadable,

    preferIsolation: blk === "C",
    preferCompound: blk === "A",
  };
}

function fillTargetForKey(key) {
  const map = {
    quad: "A:squat",
    calves: "B:lunge",
    hamstring_iso: "A:hinge",
    core: "B:lunge",
    rear_delt: "B:pull_horizontal",
    arms: "B:secondary_press",
    arms2: "C:arms",
  };
  return map[key] || "A:squat";
}

function applyFillAddSets(blocks, targetSlot, addSets) {
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

function pickSeedExerciseForSlot(allowedSet, byId, sel) {
  if (sel.sw2) {
    const ex1 = pickBest(allowedSet, byId, { mp: null, sw: null, sw2: sel.sw2, requirePref: null }, null, null);
    if (ex1 && !isConditioning(ex1)) return ex1;
  }

  const swList = sel.swAny || (sel.sw ? [sel.sw] : null);
  if (swList) {
    for (const sw of swList) {
      const ex2 = pickBest(allowedSet, byId, { mp: null, sw: sw, sw2: null, requirePref: null }, null, null);
      if (ex2 && !isConditioning(ex2)) return ex2;
    }
  }

  if (sel.mp) {
    const ex3 = pickBest(allowedSet, byId, { mp: sel.mp, sw: null, sw2: null, requirePref: null }, null, null);
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

  const swList = sel.swAny || (sel.sw ? [sel.sw] : []);
  for (const sw of swList) {
    const ex = pickBest(
      allowedSet,
      byId,
      {
        mp: null,
        sw: sw,
        sw2: null,
        requirePref: sel.requirePref,
        avoidSw2: sel.sw2,
        preferLoadable: sel.preferLoadable,
        preferIsolation: sel.preferIsolation,
        preferCompound: sel.preferCompound,
      },
      usedWeek,
      usedRegionsSet
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
        avoidSw2: sel.sw2,
        preferLoadable: sel.preferLoadable,
        preferIsolation: sel.preferIsolation,
        preferCompound: sel.preferCompound,
      },
      usedWeek,
      usedRegionsSet
    );
    if (ex2) {
      stats.avoided_repeat_sw2++;
      return ex2;
    }
  }
  return null;
}

function pickWithFallback(allowedSet, byId, sel, usedWeek, stats, usedSw2Set, usedRegionsSet) {
  function attempt(mp, sw, sw2, requirePref) {
    return pickBest(
      allowedSet,
      byId,
      {
        mp: mp,
        sw: sw,
        sw2: sw2,
        requirePref: requirePref,
        preferLoadable: sel.preferLoadable,
        preferIsolation: sel.preferIsolation,
        preferCompound: sel.preferCompound,
      },
      usedWeek,
      usedRegionsSet
    );
  }

  let ex = attemptAvoidRepeatSw2(allowedSet, byId, sel, usedWeek, usedSw2Set, usedRegionsSet, stats);
  if (ex) return ex;

  ex = attempt(null, null, sel.sw2, sel.requirePref);
  if (ex) {
    stats.picked_sw2_pref++;
    return ex;
  }

  const swList = sel.swAny || (sel.sw ? [sel.sw] : null);
  if (swList) {
    for (const sw of swList) {
      ex = attempt(null, sw, null, sel.requirePref);
      if (ex) {
        stats.picked_sw_pref++;
        return ex;
      }
    }
  }

  ex = attempt(sel.mp, null, null, sel.requirePref);
  if (ex) {
    stats.picked_mp_pref++;
    return ex;
  }

  if (sel.requirePref) {
    ex = attempt(null, null, sel.sw2, null);
    if (ex) {
      stats.picked_sw2_relaxed++;
      return ex;
    }
  }

  if (sel.requirePref && swList) {
    for (const sw of swList) {
      ex = attempt(null, sw, null, null);
      if (ex) {
        stats.picked_sw_relaxed++;
        return ex;
      }
    }
  }

  if (sel.requirePref) {
    ex = attempt(sel.mp, null, null, null);
    if (ex) {
      stats.picked_mp_relaxed++;
      return ex;
    }
  }

  const exDup =
    pickBest(allowedSet, byId, { mp: null, sw: null, sw2: sel.sw2, requirePref: sel.requirePref }, null, usedRegionsSet) ||
    (swList
      ? (() => {
          for (const sw of swList) {
            const e = pickBest(allowedSet, byId, { mp: null, sw: sw, sw2: null, requirePref: sel.requirePref }, null, usedRegionsSet);
            if (e) return e;
          }
          return null;
        })()
      : null) ||
    pickBest(allowedSet, byId, { mp: sel.mp, sw: null, sw2: null, requirePref: sel.requirePref }, null, usedRegionsSet) ||
    pickBest(allowedSet, byId, { mp: null, sw: null, sw2: sel.sw2, requirePref: null }, null, usedRegionsSet) ||
    (swList
      ? (() => {
          for (const sw of swList) {
            const e = pickBest(allowedSet, byId, { mp: null, sw: sw, sw2: null, requirePref: null }, null, usedRegionsSet);
            if (e) return e;
          }
          return null;
        })()
      : null) ||
    pickBest(allowedSet, byId, { mp: sel.mp, sw: null, sw2: null, requirePref: null }, null, usedRegionsSet);

  if (exDup) {
    stats.picked_allow_dup++;
    return exDup;
  }

  return null;
}

function buildProgram({ allowed_ids_csv, catalog_json, duration_mins, days_per_week }) {
  const cat = safeJsonParse(catalog_json, null);
  if (!cat || !Array.isArray(cat.ex)) {
    return { ok: false, program: null, debug: { error: "Invalid catalog_json" } };
  }

  const allowedIds = parseCsvArr(allowed_ids_csv);
  const allowedSet = new Set(allowedIds);
  const byId = buildIndex(cat);

  const duration = clampInt(duration_mins, 40, 60, 50);
  const dperweek = clampInt(days_per_week, 1, 6, 3);

  const budget = blockBudget(duration);
  const setsMap = setsByDuration(duration);

  const templates = {
    day1: ["A:squat", "B:lunge", "C:quad", "C:calves", "D:core", "C:hinge_accessory"],
    day2: ["A:push_horizontal", "B:pull_horizontal", "B:secondary_press", "C:arms", "C:rear_delt", "C:arms2"],
    day3: ["A:hinge", "B:secondary_lower", "C:hamstring_iso", "C:glute", "D:core", "C:calves"],
  };

  const stats = {
    duration_mins: duration,
    block_budget: budget,
    allowed_in: allowedIds.length,
    unique_used_week: 0,

    picked_sw2_pref: 0,
    picked_sw_pref: 0,
    picked_mp_pref: 0,
    picked_sw2_relaxed: 0,
    picked_sw_relaxed: 0,
    picked_mp_relaxed: 0,
    picked_allow_dup: 0,
    picked_seed_slot_aware: 0,

    avoided_repeat_sw2: 0,

    fills_add_sets: 0,
    fill_failed: 0,

    region_penalty_active: true,
    movement_class_bias_active: true,

    notes: [],
  };

  const days = [];
  const usedIdsWeek = new Set();

  for (let day = 1; day <= dperweek; day++) {
    const key = "day" + day;
    const slots = templates[key] || [];
    const take = Math.min(budget, slots.length);

    const blocks = [];

    for (let i = 0; i < take; i++) {
      const slot = slots[i];
      const sel = slotToSelector(slot, blocks);

      if ((sel.block === "C" || sel.block === "D") && !sel.requirePref) sel.requirePref = "hypertrophy_secondary";

      const usedSw2Set = sw2UsedToday(blocks);
      const usedRegionsSet = regionsUsedToday(blocks, byId);

      let ex = pickWithFallback(allowedSet, byId, sel, usedIdsWeek, stats, usedSw2Set, usedRegionsSet);

      if (ex) {
        usedIdsWeek.add(ex.id);
        const blkLetter = sel.block;
        const sets = setsMap[blkLetter] || 2;

        blocks.push({
          block: blkLetter,
          slot: slot,
          ex_id: ex.id,
          ex_name: ex.n,
          sets: sets,
          ex_sw: ex.sw || "",
          ex_sw2: ex.sw2 || "",
        });
        continue;
      }

      if (!ex && !dayHasRealExercise(blocks)) {
        const seeded = pickSeedExerciseForSlot(allowedSet, byId, sel);
        if (seeded) {
          stats.picked_seed_slot_aware++;
          usedIdsWeek.add(seeded.id);

          const blkLetter = sel.block || "A";
          const sets = setsMap[blkLetter] || 2;

          blocks.push({
            block: blkLetter,
            slot: slot,
            ex_id: seeded.id,
            ex_name: seeded.n,
            sets: sets,
            ex_sw: seeded.sw || "",
            ex_sw2: seeded.sw2 || "",
          });
          continue;
        }
      }

      const targetSlot = fillTargetForKey(sel.key);
      const addSets = 1;

      const ok = applyFillAddSets(blocks, targetSlot, addSets);

      blocks.push({
        block: sel.block,
        slot: slot,
        fill: "add_sets",
        target_slot: targetSlot,
        add_sets: addSets,
      });

      stats.fills_add_sets += 1;
      if (!ok) stats.fill_failed += 1;
    }

    for (let bi = 0; bi < blocks.length; bi++) {
      if (blocks[bi] && blocks[bi].ex_id) {
        delete blocks[bi].ex_sw;
        delete blocks[bi].ex_sw2;
      }
    }

    days.push({
      day_index: day,
      day_type: "hypertrophy",
      duration_mins: duration,
      blocks: blocks,
    });
  }

  stats.unique_used_week = usedIdsWeek.size;

  return {
    ok: true,
    program: {
      schema: "program_hypertrophy_v1",
      duration_mins: duration,
      days_per_week: dperweek,
      days: days,
    },
    debug: stats,
  };
}

// Build a catalog_v3 JSON string from Bubble ExerciseCatalogue results.
// Adjust these mappings if your Bubble fields differ.
function buildCatalogJsonFromBubble(exercises) {
  const ex = (exercises || []).map((r) => {
    const id = r.exercise_id || r.id || r.slug || r._id;
    const n = r.name || r.n || r.title || "";

    // Core matching fields
    const sw = r.swap_group_id_1 || r.sw || "";
    const sw2 = r.swap_group_id_2 || r.swap_group_rollup || r.sw2 || ""; // only if you have it
    const mp = r.movement_pattern_primary || r.mp || "";

    // Arrays often come through as JSON strings in Bubble
    const pref = normalizeArr(r.preferred_in_json || r.pref || []);
    const eq = normalizeArr(r.equipment_json || r.equipment_items_json || r.eq || []);

    // Rankings
    const den = Number(r.density_rating ?? r.den ?? 0);
    const cx = Number(r.complexity_rank ?? r.cx ?? 0);

    // Booleans sometimes come as "TRUE"/"FALSE"
    const load =
      typeof r.is_loadable === "boolean"
        ? r.is_loadable
        : toStr(r.is_loadable).toLowerCase() === "true";

    const mc = toStr(r.movement_class || r.mc || "").trim();

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
      load,
      mc,
      tr,
      wh,
    };
  });

  return JSON.stringify({ schema: "catalog_v3", count: ex.length, ex });
}

export async function buildBasicHypertrophyProgramStep({ inputs, request }) {
  // allowed_ids_csv: prefer request.body (Bubble can pass it), otherwise allow ALL catalog IDs
  const allowedCsvFromReq = request?.allowed_ids_csv || request?.allowedIdsCsv || "";
  const durationFromReq = request?.duration_mins ?? request?.durationMins;
  const daysFromReq = request?.days_per_week ?? request?.daysPerWeek;

  const clientProfile = inputs?.clientProfile?.response ?? {};
  const exercises = inputs?.exercises?.response?.results ?? [];

  // You will likely rename these once we confirm your Bubble field names:
  const durationFromProfile =
    clientProfile.duration_mins ??
    clientProfile.durationMins ??
    clientProfile.session_duration_mins ??
    clientProfile.sessionDurationMins;

  const daysFromProfile =
    clientProfile.days_per_week ??
    clientProfile.daysPerWeek ??
    clientProfile.training_days_per_week ??
    clientProfile.trainingDaysPerWeek;

  const duration_mins = durationFromReq ?? durationFromProfile ?? 50;
  const days_per_week = daysFromReq ?? daysFromProfile ?? 3;

  const catalog_json = buildCatalogJsonFromBubble(exercises);

  // If Bubble doesn't send allowed ids yet, default to "all exercise ids in catalog"
  const allowed_ids_csv =
    allowedCsvFromReq && toStr(allowedCsvFromReq).trim().length
      ? allowedCsvFromReq
      : exercises
          .map((r) => r.id || r.exercise_id || r.slug || r.unique_id || r._id)
          .filter(Boolean)
          .join(",");

  const out = buildProgram({
    allowed_ids_csv,
    catalog_json,
    duration_mins,
    days_per_week,
  });

  if (!out.ok) {
    const msg = out?.debug?.error || "Hypertrophy builder failed";
    throw new Error(msg);
  }

  return {
    program: out.program,
    debug: out.debug,
  };
}