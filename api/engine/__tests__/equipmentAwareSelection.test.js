import test from "node:test";
import assert from "node:assert/strict";

import { buildCatalogJsonFromBubble, buildIndex, pickBest, pickWithFallback } from "../exerciseSelector.js";
import {
  buildProgramFromDefinition,
  deriveEquipmentProfile,
  resolveSlotVariant,
} from "../steps/01_buildProgramFromDefinition.js";

function makeExercise({
  id,
  name,
  mp,
  sw,
  sw2,
  pref = [],
  movementClass = "compound",
  loadable = false,
  strengthEquivalent = false,
  equipment = [],
  regions = [],
}) {
  return {
    exercise_id: id,
    name,
    movement_pattern_primary: mp,
    swap_group_id_1: sw,
    swap_group_id_2: sw2,
    preferred_in_json: pref,
    movement_class: movementClass,
    is_loadable: loadable,
    strength_equivalent: strengthEquivalent,
    equipment_json: equipment,
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

function makeCompiledConfig(dayTemplates) {
  return {
    programType: "strength",
    schemaVersion: 1,
    configKey: "strength_default_v1",
    source: "test",
    builder: {
      dayTemplates,
      setsByDuration: {
        "40": { A: 3, B: 3, C: 2, D: 2 },
        "50": { A: 4, B: 3, C: 2, D: 2 },
        "60": { A: 5, B: 4, C: 3, D: 2 },
      },
      blockBudget: { "40": 4, "50": 5, "60": 5 },
      slotDefaults: {},
      excludeMovementClasses: ["cardio", "conditioning", "locomotion"],
    },
    segmentation: { blockSemantics: {} },
    progression: { progressionByRank: {}, weekPhaseConfig: {}, totalWeeksDefault: 4 },
    raw: {},
  };
}

test("deriveEquipmentProfile returns full for barbell", () => {
  assert.equal(deriveEquipmentProfile(["barbell"]), "full");
});

test("deriveEquipmentProfile returns minimal for dumbbells", () => {
  assert.equal(deriveEquipmentProfile(["dumbbells"]), "minimal");
});

test("deriveEquipmentProfile returns bodyweight when equipment is empty", () => {
  assert.equal(deriveEquipmentProfile([]), "bodyweight");
});

test("deriveEquipmentProfile prioritizes full over minimal", () => {
  assert.equal(deriveEquipmentProfile(["barbell", "dumbbells"]), "full");
});

test("resolveSlotVariant returns slot unchanged when variants are absent", () => {
  const slot = { slot: "A:squat", sw2: "squat_compound" };
  assert.deepEqual(resolveSlotVariant(slot, "minimal"), slot);
});

test("resolveSlotVariant merges matching variant over base slot", () => {
  const slot = {
    slot: "A:squat",
    preferLoadable: true,
    variants: [
      {
        when: { equipment_profile: "minimal" },
        swAny: ["squat_pattern"],
        pref_mode: "soft",
      },
    ],
  };

  assert.deepEqual(resolveSlotVariant(slot, "minimal"), {
    slot: "A:squat",
    preferLoadable: true,
    variants: slot.variants,
    swAny: ["squat_pattern"],
    pref_mode: "soft",
  });
});

test("resolveSlotVariant falls back to base slot when no variant matches", () => {
  const slot = {
    slot: "A:squat",
    sw2: "squat_compound",
    variants: [{ when: { equipment_profile: "full" }, sw2: "other" }],
  };

  assert.deepEqual(resolveSlotVariant(slot, "minimal"), slot);
});

test("resolveSlotVariant keeps base slot name and inherits missing fields", () => {
  const slot = {
    slot: "A:squat",
    requirePref: "strength_main",
    preferLoadable: true,
    variants: [{ when: { equipment_profile: "bodyweight" }, mp: "squat" }],
  };

  assert.deepEqual(resolveSlotVariant(slot, "bodyweight"), {
    slot: "A:squat",
    requirePref: "strength_main",
    preferLoadable: true,
    variants: slot.variants,
    mp: "squat",
  });
});

test("pickBest soft pref keeps candidates without the pref and favors the pref match", () => {
  const preferred = makeExercise({
    id: "preferred",
    name: "Preferred Squat",
    mp: "squat",
    sw: "squat_pattern",
    sw2: "squat_pattern_compound",
    pref: ["strength_main"],
  });
  const fallback = makeExercise({
    id: "fallback",
    name: "Fallback Squat",
    mp: "squat",
    sw: "squat_pattern",
    sw2: "squat_pattern_compound",
  });
  const { byId, allowedSet } = makeSelectorPool([fallback, preferred]);

  const picked = pickBest(allowedSet, byId, {
    swAny: ["squat_pattern"],
    requirePref: "strength_main",
    prefMode: "soft",
    prefBonus: 4,
  });

  assert.equal(picked?.id, "preferred");
});

test("pickBest strict pref rejects exercises without the required pref", () => {
  const fallback = makeExercise({
    id: "fallback",
    name: "Fallback Squat",
    mp: "squat",
    sw: "squat_pattern",
    sw2: "squat_pattern_compound",
  });
  const { byId, allowedSet } = makeSelectorPool([fallback]);

  const picked = pickBest(allowedSet, byId, {
    swAny: ["squat_pattern"],
    requirePref: "strength_main",
    prefMode: "strict",
  });

  assert.equal(picked, null);
});

test("pickBest strengthEquivalentBonus adds a scoring edge", () => {
  const plain = makeExercise({
    id: "plain",
    name: "Plain Squat",
    mp: "squat",
    sw: "squat_pattern",
    sw2: "squat_pattern_compound",
  });
  const stronger = makeExercise({
    id: "stronger",
    name: "Strength-Equivalent Squat",
    mp: "squat",
    sw: "squat_pattern",
    sw2: "squat_pattern_compound",
    strengthEquivalent: true,
  });
  const { byId, allowedSet } = makeSelectorPool([plain, stronger]);

  const picked = pickBest(allowedSet, byId, {
    swAny: ["squat_pattern"],
    strengthEquivalentBonus: true,
  });

  assert.equal(picked?.id, "stronger");
});

test("pickWithFallback returns a soft-pref match instead of null", () => {
  const fallback = makeExercise({
    id: "fallback",
    name: "Fallback Squat",
    mp: "squat",
    sw: "squat_pattern",
    sw2: "squat_pattern_compound",
  });
  const { byId, allowedSet } = makeSelectorPool([fallback]);
  const stats = {
    picked_sw2_pref: 0,
    picked_sw_pref: 0,
    picked_mp_pref: 0,
    picked_sw2_relaxed: 0,
    picked_sw_relaxed: 0,
    picked_mp_relaxed: 0,
    picked_allow_dup: 0,
    avoided_repeat_sw2: 0,
    avoided_repeat_cn: 0,
  };

  const picked = pickWithFallback(
    allowedSet,
    byId,
    {
      swAny: ["squat_pattern"],
      requirePref: "strength_main",
      prefMode: "soft",
      prefBonus: 4,
    },
    new Set(),
    stats,
    new Set(),
    new Set(),
  );

  assert.equal(picked?.id, "fallback");
});

test("buildProgramFromDefinition avoids same-day equipment variants with matching canonical names", async () => {
  const exercises = [
    makeExercise({
      id: "db_bss",
      name: "Dumbbell Bulgarian Split Squat",
      mp: "lunge",
      sw: "lunge_group",
      sw2: "lunge_comp",
      pref: ["strength_main"],
      movementClass: "compound",
      equipment: ["dumbbells"],
      regions: ["quads", "glutes"],
    }),
    makeExercise({
      id: "kb_bss",
      name: "Kettlebell Bulgarian Split Squat",
      mp: "lunge",
      sw: "lunge_group",
      sw2: "lunge_comp",
      pref: ["strength_main"],
      movementClass: "compound",
      equipment: ["kettlebells"],
      regions: ["quads", "glutes"],
    }),
    makeExercise({
      id: "walking_lunge",
      name: "Walking Lunge",
      mp: "lunge",
      sw: "lunge_group",
      sw2: "lunge_comp",
      pref: ["strength_main"],
      movementClass: "compound",
      equipment: [],
      regions: ["quads", "glutes"],
    }),
  ];
  const compiledConfig = makeCompiledConfig([
    {
      day_key: "day1",
      focus: "lower_strength",
      ordered_slots: [
        {
          slot: "B:lunge",
          sw2: "lunge_comp",
          requirePref: "strength_main",
        },
        {
          slot: "C:lunge_accessory",
          sw2: "lunge_comp",
          requirePref: "strength_main",
        },
      ],
    },
  ]);

  const built = await buildProgramFromDefinition({
    inputs: {
      exercises: { response: { results: exercises } },
      clientProfile: { response: { fitness_rank: 1, equipment_items_slugs: ["dumbbells", "kettlebells"] } },
      allowed_exercise_ids: ["db_bss", "kb_bss", "walking_lunge"],
    },
    request: { duration_mins: 40, days_per_week: 1 },
    compiledConfig,
  });

  const pickedIds = built.program.days[0].blocks.filter((b) => b.ex_id).map((b) => b.ex_id);
  assert.deepEqual(pickedIds, ["db_bss", "walking_lunge"]);
  assert.equal(built.debug.avoided_repeat_cn, 1);
});

test("buildProgramFromDefinition resolves minimal-equipment squat variant", async () => {
  const exercises = [
    makeExercise({
      id: "double_db_front_squat",
      name: "Double DB Front Squat",
      mp: "squat",
      sw: "squat_pattern",
      sw2: "squat_pattern_compound",
      pref: ["strength_main"],
      movementClass: "compound",
      loadable: true,
      strengthEquivalent: true,
      equipment: ["dumbbells"],
      regions: ["quads", "glutes"],
    }),
    makeExercise({
      id: "kb_deadlift",
      name: "KB Deadlift",
      mp: "hinge",
      sw: "hinge_pattern",
      sw2: "hinge_pattern_compound",
      pref: ["strength_main"],
      movementClass: "compound",
      loadable: true,
      strengthEquivalent: true,
      equipment: ["kettlebells"],
      regions: ["hamstrings", "glutes"],
    }),
  ];
  const compiledConfig = makeCompiledConfig([
    {
      day_key: "day1",
      focus: "lower_strength",
      ordered_slots: [
        {
          slot: "A:squat_strength",
          variants: [
            { when: { equipment_profile: "full" }, sw2: "squat_compound", requirePref: "strength_main" },
            {
              when: { equipment_profile: "minimal" },
              swAny: ["squat_pattern"],
              requirePref: "strength_main",
              pref_mode: "soft",
              strength_equivalent_bonus: true,
            },
          ],
        },
        {
          slot: "B:hinge_strength",
          variants: [
            {
              when: { equipment_profile: "minimal" },
              swAny: ["hinge_pattern"],
              requirePref: "strength_main",
              pref_mode: "soft",
              strength_equivalent_bonus: true,
            },
          ],
        },
      ],
    },
  ]);

  const built = await buildProgramFromDefinition({
    inputs: {
      exercises: { response: { results: exercises } },
      clientProfile: { response: { fitness_rank: 1, equipment_items_slugs: ["dumbbells"] } },
      allowed_exercise_ids: ["double_db_front_squat", "kb_deadlift"],
    },
    request: { duration_mins: 40, days_per_week: 1 },
    compiledConfig,
  });

  assert.equal(built.program.days[0].blocks[0].ex_id, "double_db_front_squat");
  assert.equal(built.debug.equipment_profile, "minimal");
  assert.ok(Array.isArray(built.debug.notes));
  assert.equal(built.debug.notes[0]?.event, "slot_resolved");
});

test("buildProgramFromDefinition resolves bodyweight squat variant", async () => {
  const exercises = [
    makeExercise({
      id: "assisted_pistol_squat",
      name: "Assisted Pistol Squat",
      mp: "squat",
      sw: "squat_pattern",
      sw2: "squat_pattern_compound",
      pref: ["hypertrophy_secondary"],
      movementClass: "compound",
      strengthEquivalent: true,
      equipment: [],
      regions: ["quads", "glutes"],
    }),
  ];
  const compiledConfig = makeCompiledConfig([
    {
      day_key: "day1",
      focus: "lower",
      ordered_slots: [
        {
          slot: "A:squat",
          variants: [
            {
              when: { equipment_profile: "bodyweight" },
              swAny: ["squat_pattern"],
              mp: "squat",
              requirePref: "hypertrophy_secondary",
              pref_mode: "soft",
              strength_equivalent_bonus: true,
            },
          ],
        },
      ],
    },
  ]);

  const built = await buildProgramFromDefinition({
    inputs: {
      exercises: { response: { results: exercises } },
      clientProfile: { response: { fitness_rank: 0, equipment_items_slugs: [] } },
      allowed_exercise_ids: ["assisted_pistol_squat"],
    },
    request: { duration_mins: 40, days_per_week: 1 },
    compiledConfig,
  });

  assert.equal(built.program.days[0].blocks[0].ex_id, "assisted_pistol_squat");
  assert.equal(built.debug.equipment_profile, "bodyweight");
});

test("buildProgramFromDefinition keeps full-equipment variant behavior", async () => {
  const exercises = [
    makeExercise({
      id: "barbell_back_squat",
      name: "Back Squat",
      mp: "squat",
      sw: "quad_compound",
      sw2: "squat_compound",
      pref: ["strength_main"],
      movementClass: "compound",
      loadable: true,
      strengthEquivalent: true,
      equipment: ["barbell"],
      regions: ["quads", "glutes"],
    }),
  ];
  const compiledConfig = makeCompiledConfig([
    {
      day_key: "day1",
      focus: "lower_strength",
      ordered_slots: [
        {
          slot: "A:squat_strength",
          variants: [
            { when: { equipment_profile: "full" }, sw2: "squat_compound", requirePref: "strength_main" },
            { when: { equipment_profile: "minimal" }, swAny: ["squat_pattern"], pref_mode: "soft" },
          ],
        },
      ],
    },
  ]);

  const built = await buildProgramFromDefinition({
    inputs: {
      exercises: { response: { results: exercises } },
      clientProfile: { response: { fitness_rank: 2, equipment_items_slugs: ["barbell"] } },
      allowed_exercise_ids: ["barbell_back_squat"],
    },
    request: { duration_mins: 40, days_per_week: 1 },
    compiledConfig,
  });

  assert.equal(built.program.days[0].blocks[0].ex_id, "barbell_back_squat");
  assert.equal(built.debug.equipment_profile, "full");
});
