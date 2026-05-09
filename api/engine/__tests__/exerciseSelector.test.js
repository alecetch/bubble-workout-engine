import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCatalogJsonFromBubble,
  buildIndex,
  canonicalName,
  hasPref,
  isConditioning,
  isLoadable,
  dayHasRealExercise,
  pickBest,
  pickWithFallback,
  pickSeedExerciseForSlot,
} from "../exerciseSelector.js";

function makeExercise({
  id,
  name = "Test Ex",
  mp = "squat",
  sw = "sw_group",
  sw2 = "sw2_group",
  pref = [],
  mc = "compound",
  loadable = false,
  regions = [],
  strengthEquivalent = false,
} = {}) {
  return {
    exercise_id: id,
    name,
    movement_pattern_primary: mp,
    swap_group_id_1: sw,
    swap_group_id_2: sw2,
    preferred_in_json: pref,
    movement_class: mc,
    is_loadable: loadable,
    strength_equivalent: strengthEquivalent,
    equipment_json: [],
    density_rating: 1,
    complexity_rank: 1,
    target_regions_json: regions,
    warmup_hooks: [],
  };
}

function makeSelectorPool(exercises) {
  const cat = JSON.parse(buildCatalogJsonFromBubble(exercises));
  const byId = buildIndex(cat);
  return {
    byId,
    allowedSet: new Set(exercises.map((ex) => ex.exercise_id)),
  };
}

function makeStats() {
  return {
    picked_sw2_pref: 0,
    picked_sw_pref: 0,
    picked_mp_pref: 0,
    picked_sw2_relaxed: 0,
    picked_sw_relaxed: 0,
    picked_mp_relaxed: 0,
    picked_allow_dup: 0,
    picked_seed_slot_aware: 0,
    avoided_repeat_sw2: 0,
    avoided_repeat_cn: 0,
    fills_add_sets: 0,
    fill_failed: 0,
  };
}

test("maps all fields from Bubble format to catalog format", () => {
  const input = [
    {
      exercise_id: "ex1",
      name: "Squat",
      movement_pattern_primary: "squat",
      swap_group_id_1: "sq_group",
      swap_group_id_2: "sq_comp",
      preferred_in_json: ["strength_main"],
      movement_class: "compound",
      is_loadable: true,
      strength_equivalent: false,
      equipment_json: ["barbell"],
      density_rating: 2,
      complexity_rank: 1,
      target_regions_json: ["quads"],
      warmup_hooks: ["hips"],
    },
  ];

  const result = JSON.parse(buildCatalogJsonFromBubble(input));
  const ex = result.ex[0];

  assert.equal(ex.id, "ex1");
  assert.equal(ex.n, "Squat");
  assert.equal(ex.cn, "squat");
  assert.equal(ex.sw, "sq_group");
  assert.equal(ex.sw2, "sq_comp");
  assert.equal(ex.mp, "squat");
  assert.deepEqual(ex.pref, ["strength_main"]);
  assert.deepEqual(ex.eq, ["barbell"]);
  assert.equal(ex.mc, "compound");
  assert.equal(ex.load, true);
  assert.deepEqual(ex.tr, ["quads"]);
  assert.deepEqual(ex.wh, ["hips"]);
});

test("handles empty exercise list", () => {
  const result = JSON.parse(buildCatalogJsonFromBubble([]));
  assert.deepEqual(result.ex, []);
  assert.equal(result.count, 0);
});

test("strips dumbbell prefix", () => {
  assert.equal(canonicalName("Dumbbell Bulgarian Split Squat"), "bulgarian_split_squat");
});

test("strips kettlebell prefix", () => {
  assert.equal(canonicalName("Kettlebell Bulgarian Split Squat"), "bulgarian_split_squat");
});

test("strips barbell prefix", () => {
  assert.equal(canonicalName("Barbell Romanian Deadlift"), "romanian_deadlift");
});

test("strips only the first matching prefix", () => {
  assert.equal(canonicalName("Dumbbell Dumbbell Curl"), "dumbbell_curl");
});

test("does not strip when prefix is not at start", () => {
  assert.equal(canonicalName("Bulgarian Split Squat"), "bulgarian_split_squat");
});

test("smith machine stripped before machine", () => {
  assert.equal(canonicalName("Smith Machine Squat"), "squat");
});

test("returns empty string for empty input", () => {
  assert.equal(canonicalName(""), "");
  assert.equal(canonicalName(null), "");
  assert.equal(canonicalName(undefined), "");
});

test("exercises with no equipment prefix produce identical canonical names", () => {
  assert.equal(
    canonicalName("Dumbbell Romanian Deadlift"),
    canonicalName("Barbell Romanian Deadlift"),
  );
});

test("buildIndex preserves canonical names from catalog entries", () => {
  const result = JSON.parse(
    buildCatalogJsonFromBubble([
      makeExercise({
        id: "ex1",
        name: "Dumbbell Bulgarian Split Squat",
      }),
    ]),
  );
  const byId = buildIndex(result);
  assert.equal(byId.ex1.cn, "bulgarian_split_squat");
});

test("hasPref returns true when pref is null/undefined", () => {
  assert.equal(hasPref({ pref: ["x"] }, null), true);
  assert.equal(hasPref({ pref: ["x"] }, undefined), true);
});

test("hasPref returns true when exercise has the pref", () => {
  assert.equal(hasPref({ pref: ["strength_main", "hypertrophy"] }, "strength_main"), true);
});

test("hasPref returns false when exercise does not have the pref", () => {
  assert.equal(hasPref({ pref: ["strength_main"] }, "hypertrophy_secondary"), false);
});

test("hasPref returns false when pref array is empty", () => {
  assert.equal(hasPref({ pref: [] }, "strength_main"), false);
});

test("isConditioning returns true for mp=conditioning", () => {
  assert.equal(isConditioning({ mp: "conditioning", sw: "", sw2: "", n: "" }), true);
});

test("isConditioning returns true for mp=cardio", () => {
  assert.equal(isConditioning({ mp: "cardio", sw: "", sw2: "", n: "" }), true);
});

test("isConditioning returns true for conditioning_main pref tag", () => {
  assert.equal(isConditioning({ mp: "", pref: ["conditioning_main"] }), true);
});

test("isConditioning returns true for hyrox_station pref tag", () => {
  assert.equal(isConditioning({ mp: "", pref: ["hyrox_station"] }), true);
});

test("isConditioning returns true for hyrox_buy_in pref tag", () => {
  assert.equal(isConditioning({ mp: "", pref: ["hyrox_buy_in"] }), true);
});

test("isConditioning returns false for strength rows", () => {
  assert.equal(
    isConditioning({ mp: "pull_horizontal", sw: "pull_horizontal", sw2: "pull_horizontal_compound", n: "Seated Cable Row", pref: [] }),
    false,
  );
});

test("isConditioning does not infer conditioning from names alone", () => {
  assert.equal(isConditioning({ mp: "", sw: "", sw2: "", n: "Air Bike Intervals", pref: [] }), false);
  assert.equal(isConditioning({ mp: "", sw: "", sw2: "", n: "Row Erg Intervals", pref: [] }), false);
});

test("isConditioning returns false for normal strength exercise", () => {
  assert.equal(isConditioning({ mp: "squat", sw: "squat_group", sw2: "squat_comp", n: "Squat", pref: [] }), false);
});

test("isLoadable returns true when load=true", () => {
  assert.equal(isLoadable({ load: true }), true);
});

test("isLoadable returns false when load=false", () => {
  assert.equal(isLoadable({ load: false }), false);
});

test("isLoadable returns true when eq contains barbell and no load field", () => {
  assert.equal(isLoadable({ eq: ["barbell"] }), true);
});

test("isLoadable returns false for bodyweight exercise", () => {
  assert.equal(isLoadable({ eq: ["bodyweight"] }), false);
});

test("dayHasRealExercise returns false for empty blocks", () => {
  assert.equal(dayHasRealExercise([]), false);
});

test("dayHasRealExercise returns false when all blocks lack ex_id", () => {
  assert.equal(dayHasRealExercise([{ fill: "add_sets" }]), false);
});

test("dayHasRealExercise returns true when any block has ex_id", () => {
  assert.equal(dayHasRealExercise([{ ex_id: "ex1" }]), true);
});

test("pickBest returns null for empty allowedSet", () => {
  const pool = makeSelectorPool([makeExercise({ id: "ex1", sw: "sq_group", sw2: "sq_comp" })]);
  assert.equal(pickBest(new Set(), pool.byId, { sw2: "sq_comp" }, null, null), null);
});

test("pickBest returns null when no exercise reaches score > 0", () => {
  const pool = makeSelectorPool([makeExercise({ id: "ex1", sw2: "other" })]);
  assert.equal(pickBest(pool.allowedSet, pool.byId, { sw2: "target_group" }, null, null), null);
});

test("sw2 match scores highest (12 points)", () => {
  const exSw2 = makeExercise({ id: "a", sw2: "sq_comp" });
  const exSw = makeExercise({ id: "b", sw: "sq_group", sw2: "other" });
  const pool = makeSelectorPool([exSw2, exSw]);
  const sel = { mp: null, sw: "sq_group", sw2: "sq_comp" };
  const result = pickBest(pool.allowedSet, pool.byId, sel, null, null);
  assert.equal(result.id, "a");
});

test("sw match scores above mp match (10 vs 4)", () => {
  const exSw = makeExercise({ id: "a", mp: "squat", sw: "sq_group", sw2: "other" });
  const exMp = makeExercise({ id: "b", mp: "squat", sw: "other_group", sw2: "other" });
  const pool = makeSelectorPool([exSw, exMp]);
  const sel = { mp: "squat", sw: "sq_group", sw2: null };
  const result = pickBest(pool.allowedSet, pool.byId, sel, null, null);
  assert.equal(result.id, "a");
});

test("requirePref strict mode excludes exercises without the pref", () => {
  const exWithPref = makeExercise({ id: "a", sw2: "sq_comp", pref: ["strength_main"] });
  const exWithoutPref = makeExercise({ id: "b", sw2: "sq_comp", pref: [] });
  const pool = makeSelectorPool([exWithPref, exWithoutPref]);
  const sel = { sw2: "sq_comp", requirePref: "strength_main", prefMode: "strict" };
  const result = pickBest(pool.allowedSet, pool.byId, sel, null, null);
  assert.equal(result.id, "a");
});

test("requirePref soft mode gives bonus but does not exclude", () => {
  const exWithPref = makeExercise({ id: "a", sw2: "sq_comp", pref: ["strength_main"] });
  const exWithoutPref = makeExercise({ id: "b", sw2: "sq_comp", pref: [] });
  const pool = makeSelectorPool([exWithPref, exWithoutPref]);
  const sel = { sw2: "sq_comp", requirePref: "strength_main", prefMode: "soft", prefBonus: 4 };
  const result = pickBest(pool.allowedSet, pool.byId, sel, null, null);
  assert.equal(result.id, "a");
});

test("region overlap penalty: exercises with 2+ overlapping regions score lower", () => {
  const exOverlap = makeExercise({ id: "a", sw: "sq_group", sw2: "sq_comp", regions: ["quads", "glutes"] });
  const exClean = makeExercise({ id: "b", sw: "sq_group", sw2: "sq_comp", regions: ["traps"] });
  const pool = makeSelectorPool([exOverlap, exClean]);
  const usedRegions = new Set(["quads", "glutes"]);
  const sel = { sw2: "sq_comp" };
  const result = pickBest(pool.allowedSet, pool.byId, sel, null, usedRegions);
  assert.equal(result.id, "b");
});

test("avoidSw2 skips matching exercise", () => {
  const exAvoid = makeExercise({ id: "a", sw: "sq_group", sw2: "avoid_this", mp: "squat" });
  const exOk = makeExercise({ id: "b", sw: "sq_group", sw2: "ok_group", mp: "squat" });
  const pool = makeSelectorPool([exAvoid, exOk]);
  const sel = { sw: "sq_group", avoidSw2: "avoid_this" };
  const result = pickBest(pool.allowedSet, pool.byId, sel, null, null);
  assert.equal(result.id, "b");
});

test("usedSet (already used this week) causes exercise to be skipped", () => {
  const ex = makeExercise({ id: "ex1", sw2: "sq_comp" });
  const pool = makeSelectorPool([ex]);
  const usedWeek = new Set(["ex1"]);
  const result = pickBest(pool.allowedSet, pool.byId, { sw2: "sq_comp" }, usedWeek, null);
  assert.equal(result, null);
});

test("skips exercise whose cn is in avoidCnSet", () => {
  const exAvoid = makeExercise({
    id: "a",
    name: "Dumbbell Bulgarian Split Squat",
    sw2: "sq_comp",
  });
  const exOk = makeExercise({
    id: "b",
    name: "Romanian Deadlift",
    sw2: "sq_comp",
  });
  const pool = makeSelectorPool([exAvoid, exOk]);
  const avoidCnSet = new Set(["bulgarian_split_squat"]);
  const result = pickBest(pool.allowedSet, pool.byId, { sw2: "sq_comp" }, null, null, avoidCnSet);
  assert.equal(result?.id, "b");
});

test("returns result normally when avoidCnSet is null", () => {
  const exAvoid = makeExercise({
    id: "a",
    name: "Dumbbell Bulgarian Split Squat",
    sw2: "sq_comp",
  });
  const exOk = makeExercise({
    id: "b",
    name: "Romanian Deadlift",
    sw2: "sq_comp",
  });
  const pool = makeSelectorPool([exAvoid, exOk]);
  const result = pickBest(pool.allowedSet, pool.byId, { sw2: "sq_comp" }, null, null, null);
  assert.notEqual(result, null);
});

test("returns null when avoidCnSet excludes all candidates", () => {
  const exAvoid = makeExercise({
    id: "a",
    name: "Dumbbell Bulgarian Split Squat",
    sw2: "sq_comp",
  });
  const exOk = makeExercise({
    id: "b",
    name: "Romanian Deadlift",
    sw2: "sq_comp",
  });
  const pool = makeSelectorPool([exAvoid, exOk]);
  const avoidCnSet = new Set(["bulgarian_split_squat", "romanian_deadlift"]);
  const result = pickBest(pool.allowedSet, pool.byId, { sw2: "sq_comp" }, null, null, avoidCnSet);
  assert.equal(result, null);
});

test("pickWithFallback returns sw2 match on first attempt (stats.picked_sw2_pref incremented)", () => {
  const ex = makeExercise({ id: "ex1", sw2: "sq_comp" });
  const pool = makeSelectorPool([ex]);
  const stats = makeStats();
  const result = pickWithFallback(
    pool.allowedSet,
    pool.byId,
    { sw2: "sq_comp", requirePref: null, prefMode: "soft", prefBonus: 4 },
    new Set(),
    stats,
    new Set(),
    new Set(),
    new Set(),
  );
  assert.equal(result.id, "ex1");
  assert.equal(stats.picked_sw2_pref, 1);
});

test("pickWithFallback keeps same-sw2 alternatives eligible when one exact exercise was already used today", () => {
  const exactUsed = makeExercise({
    id: "sled_pull_a",
    name: "Sled Pull Heavy",
    mp: "sled_pull",
    sw: "sled_pull",
    sw2: "sled_compound",
  });
  const sameSw2Alt = makeExercise({
    id: "sled_pull_b",
    name: "Sled Pull Moderate",
    mp: "sled_pull",
    sw: "sled_pull",
    sw2: "sled_compound",
  });
  const sameSwFallback = makeExercise({
    id: "rdl_row",
    name: "RDL and Bent Over Row",
    mp: "sled_pull",
    sw: "sled_pull",
    sw2: "hinge_compound",
  });
  const pool = makeSelectorPool([exactUsed, sameSw2Alt, sameSwFallback]);

  const result = pickWithFallback(
    pool.allowedSet,
    pool.byId,
    { mp: "sled_pull", sw: "sled_pull", sw2: "sled_compound", requirePref: null, prefMode: "soft", prefBonus: 4 },
    new Set(),
    makeStats(),
    new Set(["sled_pull_a"]),
    new Set(),
    new Set(),
  );

  assert.equal(result?.id, "sled_pull_b");
});

test("avoids exercise with same canonical name already used today", () => {
  const db = makeExercise({
    id: "a",
    name: "Dumbbell Bulgarian Split Squat",
    sw2: "lunge_comp",
  });
  const kb = makeExercise({
    id: "b",
    name: "Kettlebell Bulgarian Split Squat",
    sw2: "lunge_comp",
  });
  const alt = makeExercise({
    id: "c",
    name: "Reverse Lunge",
    sw2: "lunge_comp",
  });
  const pool = makeSelectorPool([db, kb, alt]);
  const usedCn = new Set(["bulgarian_split_squat"]);
  const result = pickWithFallback(
    pool.allowedSet,
    pool.byId,
    { sw2: "lunge_comp", requirePref: null },
    new Set(),
    makeStats(),
    new Set(),
    new Set(),
    usedCn,
  );
  assert.equal(result?.id, "c");
});

test("falls back to allowing cn repeat when no cn-free alternatives exist", () => {
  const db = makeExercise({
    id: "a",
    name: "Dumbbell Bulgarian Split Squat",
    sw2: "lunge_comp",
  });
  const kb = makeExercise({
    id: "b",
    name: "Kettlebell Bulgarian Split Squat",
    sw2: "lunge_comp",
  });
  const pool = makeSelectorPool([db, kb]);
  const stats = makeStats();
  const usedCn = new Set(["bulgarian_split_squat"]);
  const result = pickWithFallback(
    pool.allowedSet,
    pool.byId,
    { sw2: "lunge_comp", requirePref: null },
    new Set(),
    stats,
    new Set(),
    new Set(),
    usedCn,
  );
  assert.notEqual(result, null);
  assert.ok(result.id === "a" || result.id === "b");
});

test("requirePref soft mode can succeed on initial sw2 attempt without a pref match", () => {
  const exNoPref = makeExercise({ id: "ex1", sw2: "sq_comp", pref: [] });
  const pool = makeSelectorPool([exNoPref]);
  const stats = makeStats();
  const sel = { sw2: "sq_comp", requirePref: "strength_main", prefMode: "soft", prefBonus: 4 };
  const result = pickWithFallback(pool.allowedSet, pool.byId, sel, new Set(), stats, new Set(), new Set(), new Set());
  assert.equal(result.id, "ex1");
  assert.equal(stats.picked_sw2_pref, 1);
  assert.equal(stats.picked_sw2_relaxed, 0);
});

test("pickWithFallback returns null when allowedSet is empty", () => {
  const result = pickWithFallback(new Set(), {}, { sw2: "x", prefMode: "soft", prefBonus: 4 }, new Set(), makeStats(), new Set(), new Set(), new Set());
  assert.equal(result, null);
});

test("pickSeedExerciseForSlot returns null when allowedSet is empty", () => {
  assert.equal(pickSeedExerciseForSlot(new Set(), {}, { sw2: "sq_comp" }), null);
});

test("pickSeedExerciseForSlot returns first non-conditioning exercise when no sw/sw2/mp match", () => {
  const ex1 = makeExercise({ id: "ex1", mp: "other", sw: "other", sw2: "other" });
  const pool = makeSelectorPool([ex1]);
  const sel = { sw2: "nonexistent", mp: null };
  const result = pickSeedExerciseForSlot(pool.allowedSet, pool.byId, sel);
  assert.equal(result.id, "ex1");
});

test("pickSeedExerciseForSlot skips conditioning exercises", () => {
  const cardio = makeExercise({ id: "c1", mp: "conditioning" });
  const real = makeExercise({ id: "ex1", mp: "squat" });
  const pool = makeSelectorPool([cardio, real]);
  const sel = { sw2: null, sw: null, mp: null, requirePref: null };
  const result = pickSeedExerciseForSlot(pool.allowedSet, pool.byId, sel);
  assert.equal(result.id, "ex1");
});

test("pickSeedExerciseForSlot prefers requirePref match over plain first exercise", () => {
  const exPlain = makeExercise({ id: "a", mp: "squat", pref: [] });
  const exPref = makeExercise({ id: "b", mp: "squat", pref: ["strength_main"] });
  const pool = makeSelectorPool([exPlain, exPref]);
  const sel = { sw2: null, mp: null, requirePref: "strength_main" };
  const result = pickSeedExerciseForSlot(pool.allowedSet, pool.byId, sel);
  assert.equal(result.id, "b");
});
