import test from "node:test";
import assert from "node:assert/strict";
import { makeGuidelineLoadService } from "../guidelineLoadService.js";

function createGuidelineDb({
  profile = {
    fitness_rank: 1,
    fitness_level_slug: "beginner",
    anchor_lifts_skipped: false,
    anchor_lifts_collected_at: null,
  },
  targets = [],
  anchors = [],
  familyConfigs = [],
  rankDefaults = [],
  history = [],
} = {}) {
  return {
    async query(sql) {
      if (sql.includes("FROM client_profile")) {
        return { rows: [profile] };
      }
      if (sql.includes("FROM exercise_catalogue") && sql.includes("WHERE exercise_id = ANY")) {
        return { rows: targets };
      }
      if (sql.includes("FROM client_anchor_lift")) {
        return { rows: anchors };
      }
      if (sql.includes("FROM exercise_load_estimation_family_config")) {
        return { rows: familyConfigs };
      }
      if (sql.includes("FROM exercise_estimation_family_rank_defaults")) {
        return { rows: rankDefaults };
      }
      if (sql.includes("FROM segment_exercise_log")) {
        return { rows: history };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

function targetRow(exerciseId, metadata) {
  return {
    exercise_id: exerciseId,
    load_estimation_metadata: metadata,
    equipment_items_slugs: [],
  };
}

function anchorRow({
  family,
  exerciseId,
  loadKg,
  reps,
  rir = null,
  updatedAt = "2026-04-01T00:00:00.000Z",
  meta = {},
}) {
  return {
    estimation_family: family,
    exercise_id: exerciseId,
    load_kg: loadKg,
    reps,
    rir,
    updated_at: updatedAt,
    load_estimation_metadata: {
      estimation_family: family,
      ...meta,
    },
  };
}

test("same exercise anchor returns high-confidence guideline load", async () => {
  const service = makeGuidelineLoadService(createGuidelineDb({
    targets: [
      targetRow("bb_back_squat", {
        estimation_family: "squat",
        family_conversion_factor: 1,
        rounding_increment_kg: 2.5,
        unit: "kg",
      }),
    ],
    anchors: [
      anchorRow({ family: "squat", exerciseId: "bb_back_squat", loadKg: 100, reps: 5, rir: 2 }),
    ],
  }));

  const [exercise] = await service.annotateExercisesWithGuidelineLoads({
    exercises: [{
      exercise_id: "bb_back_squat",
      reps_prescribed: "5",
      intensity_prescription: "2 RIR",
      tempo: "2-0-1-0",
      is_loadable: true,
    }],
    clientProfileId: "profile-1",
    userId: "user-1",
    programType: "strength",
  });

  assert.equal(exercise.guideline_load?.confidence, "high");
  assert.equal(exercise.guideline_load?.confidence_score, 85);
  assert.equal(exercise.guideline_load?.value, 100);
});

test("cross-family anchor returns low-confidence guideline load", async () => {
  const service = makeGuidelineLoadService(createGuidelineDb({
    targets: [
      targetRow("bb_overhead_press", {
        estimation_family: "vertical_press",
        family_conversion_factor: 1,
        rounding_increment_kg: 2.5,
        unit: "kg",
      }),
    ],
    anchors: [
      anchorRow({
        family: "horizontal_press",
        exerciseId: "bb_bench_press",
        loadKg: 60,
        reps: 8,
        updatedAt: "2025-08-01T00:00:00.000Z",
      }),
    ],
    familyConfigs: [
      { source_family: "horizontal_press", target_family: "vertical_press", cross_family_factor: 0.76 },
    ],
  }));

  const [exercise] = await service.annotateExercisesWithGuidelineLoads({
    exercises: [{
      exercise_id: "bb_overhead_press",
      reps_prescribed: "8",
      intensity_prescription: "",
      tempo: "2-0-1-0",
      is_loadable: true,
    }],
    clientProfileId: "profile-1",
    userId: "user-1",
    programType: "strength",
  });

  assert.equal(exercise.guideline_load?.confidence, "low");
  assert.equal(exercise.guideline_load?.confidence_score, 15);
});

test("logged history suppresses guideline load", async () => {
  const service = makeGuidelineLoadService(createGuidelineDb({
    targets: [
      targetRow("bb_back_squat", {
        estimation_family: "squat",
        family_conversion_factor: 1,
        rounding_increment_kg: 2.5,
      }),
    ],
    anchors: [
      anchorRow({ family: "squat", exerciseId: "bb_back_squat", loadKg: 100, reps: 5 }),
    ],
    history: [{ exercise_id: "bb_back_squat" }],
  }));

  const [exercise] = await service.annotateExercisesWithGuidelineLoads({
    exercises: [{
      exercise_id: "bb_back_squat",
      reps_prescribed: "5",
      intensity_prescription: "2 RIR",
      tempo: "2-0-1-0",
      is_loadable: true,
    }],
    clientProfileId: "profile-1",
    userId: "user-1",
    programType: "strength",
  });

  assert.equal(exercise.guideline_load, null);
});

test("unilateral dumbbell rows round down per hand", async () => {
  const service = makeGuidelineLoadService(createGuidelineDb({
    targets: [
      targetRow("singlearm_db_row", {
        estimation_family: "horizontal_pull",
        family_conversion_factor: 0.55,
        rounding_increment_kg: 2,
        unit: "kg_per_hand",
        is_unilateral: true,
        unilateral_factor: 0.5,
      }),
    ],
    anchors: [
      anchorRow({ family: "horizontal_pull", exerciseId: "bb_bentover_row", loadKg: 100, reps: 8, rir: 2 }),
    ],
  }));

  const [exercise] = await service.annotateExercisesWithGuidelineLoads({
    exercises: [{
      exercise_id: "singlearm_db_row",
      reps_prescribed: "8",
      intensity_prescription: "2 RIR",
      tempo: "2-0-1-0",
      is_loadable: true,
    }],
    clientProfileId: "profile-1",
    userId: "user-1",
    programType: "strength",
  });

  assert.equal(exercise.guideline_load?.unit, "kg_per_hand");
  assert.equal(exercise.guideline_load?.value, 26);
});

test("conditioning program type applies a conservative factor", async () => {
  const service = makeGuidelineLoadService(createGuidelineDb({
    targets: [
      targetRow("bb_back_squat", {
        estimation_family: "squat",
        family_conversion_factor: 1,
        rounding_increment_kg: 2.5,
      }),
    ],
    anchors: [
      anchorRow({ family: "squat", exerciseId: "bb_back_squat", loadKg: 100, reps: 5, rir: 2 }),
    ],
  }));

  const [exercise] = await service.annotateExercisesWithGuidelineLoads({
    exercises: [{
      exercise_id: "bb_back_squat",
      reps_prescribed: "5",
      intensity_prescription: "2 RIR",
      tempo: "2-0-1-0",
      is_loadable: true,
    }],
    clientProfileId: "profile-1",
    userId: "user-1",
    programType: "conditioning",
  });

  assert.equal(exercise.guideline_load?.value, 87.5);
});

test("rank_default fallback is used when no anchor and no logged history exist", async () => {
  const service = makeGuidelineLoadService(createGuidelineDb({
    profile: {
      fitness_rank: 2,
      fitness_level_slug: "intermediate",
      anchor_lifts_skipped: true,
      anchor_lifts_collected_at: null,
    },
    targets: [
      targetRow("bb_back_squat", {
        estimation_family: "squat",
        family_conversion_factor: 1,
        rounding_increment_kg: 2.5,
      }),
    ],
    rankDefaults: [
      {
        estimation_family: "squat",
        rank_default_loads_json: { beginner: 40, intermediate: 80, advanced: 110, elite: 140 },
        default_unit: "kg",
      },
    ],
  }));

  const [exercise] = await service.annotateExercisesWithGuidelineLoads({
    exercises: [{
      exercise_id: "bb_back_squat",
      reps_prescribed: "5",
      intensity_prescription: "2 RIR",
      tempo: "2-0-1-0",
      is_loadable: true,
    }],
    clientProfileId: "profile-1",
    userId: "user-1",
    programType: "strength",
  });

  assert.equal(exercise.guideline_load?.source, "rank_default");
  assert.equal(exercise.guideline_load?.confidence, "low");
  assert.equal(exercise.guideline_load?.value, 80);
});

test("anchor data still beats rank_default fallback", async () => {
  const service = makeGuidelineLoadService(createGuidelineDb({
    profile: {
      fitness_rank: 2,
      fitness_level_slug: "intermediate",
      anchor_lifts_skipped: false,
      anchor_lifts_collected_at: null,
    },
    targets: [
      targetRow("bb_back_squat", {
        estimation_family: "squat",
        family_conversion_factor: 1,
        rounding_increment_kg: 2.5,
      }),
    ],
    anchors: [
      anchorRow({ family: "squat", exerciseId: "bb_back_squat", loadKg: 100, reps: 5, rir: 2 }),
    ],
    rankDefaults: [
      {
        estimation_family: "squat",
        rank_default_loads_json: { beginner: 40, intermediate: 80, advanced: 110, elite: 140 },
        default_unit: "kg",
      },
    ],
  }));

  const [exercise] = await service.annotateExercisesWithGuidelineLoads({
    exercises: [{
      exercise_id: "bb_back_squat",
      reps_prescribed: "5",
      intensity_prescription: "2 RIR",
      tempo: "2-0-1-0",
      is_loadable: true,
    }],
    clientProfileId: "profile-1",
    userId: "user-1",
    programType: "strength",
  });

  assert.equal(exercise.guideline_load?.source, "same_exercise");
  assert.equal(exercise.guideline_load?.value, 100);
});

test("non-estimatable exercises still return null even with rank defaults configured", async () => {
  const service = makeGuidelineLoadService(createGuidelineDb({
    profile: {
      fitness_rank: 2,
      fitness_level_slug: "intermediate",
      anchor_lifts_skipped: false,
      anchor_lifts_collected_at: null,
    },
    targets: [
      targetRow("air_bike", {
        estimation_family: "conditioning",
        not_estimatable: true,
      }),
    ],
    rankDefaults: [
      {
        estimation_family: "conditioning",
        rank_default_loads_json: { beginner: 1, intermediate: 2 },
        default_unit: "kg",
      },
    ],
  }));

  const [exercise] = await service.annotateExercisesWithGuidelineLoads({
    exercises: [{
      exercise_id: "air_bike",
      reps_prescribed: "10",
      intensity_prescription: "",
      tempo: "",
      is_loadable: true,
    }],
    clientProfileId: "profile-1",
    userId: "user-1",
    programType: "conditioning",
  });

  assert.equal(exercise.guideline_load, null);
});
