import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInitialSetInputMap,
  buildSegmentLogRows,
  computeSessionStatsFromSegments,
  guidelinePrefill,
  repsPrefill,
} from "./sessionUxLogic";

test("guidelinePrefill prefers progression load over guideline load when both are present", () => {
  assert.equal(
    guidelinePrefill({
      guidelineLoad: { value: 80 },
      progressionRecommendation: { recommendedLoadKg: 100 },
      intensity: "RPE 7",
    }),
    "100",
  );
});

test("guidelinePrefill falls back appropriately", () => {
  assert.equal(guidelinePrefill({ guidelineLoad: null, intensity: "70" }), "70");
  assert.equal(guidelinePrefill({ guidelineLoad: { value: 0 }, intensity: "50" }), "50");
  assert.equal(guidelinePrefill({ guidelineLoad: null, intensity: "RPE 7-8" }), "");
});

test("guidelinePrefill prefers progression load when guideline load is absent", () => {
  assert.equal(
    guidelinePrefill({ guidelineLoad: null, progressionRecommendation: { recommendedLoadKg: 115 } }),
    "115",
  );
});

test("repsPrefill prefers progression recommendation when present", () => {
  assert.equal(
    repsPrefill({ reps: "6-10", progressionRecommendation: { recommendedRepsTarget: 9 } }),
    "9",
  );
  assert.equal(repsPrefill({ reps: "6-10" }), "8");
});

test("buildInitialSetInputMap creates per-set state and overlays existing logs by order index", () => {
  const inputMap = buildInitialSetInputMap(
    [{
      id: "pe-1",
      name: "Back Squat",
      sets: 3,
      reps: "5",
      intensity: "RPE 7",
      isLoadable: true,
      guidelineLoad: { value: 85, unit: "kg", confidence: "medium" },
      progressionRecommendation: {
        outcome: "increase_reps",
        primaryLever: "reps",
        confidence: "high",
        source: "progression_recommendation",
        reasoning: [],
        recommendedLoadKg: 100,
        recommendedRepsTarget: 6,
        recommendedSets: null,
        recommendedRestSeconds: null,
      },
    }],
    [{
      programExerciseId: "pe-1",
      orderIndex: 2,
      weightKg: 90,
      repsCompleted: 4,
      rirActual: 1,
    }],
  );

  assert.equal(inputMap["pe-1"].length, 3);
  assert.equal(inputMap["pe-1"][0].weight, "100");
  assert.equal(inputMap["pe-1"][0].reps, "6");
  assert.equal(inputMap["pe-1"][1].weight, "90");
  assert.equal(inputMap["pe-1"][1].reps, "4");
  assert.equal(inputMap["pe-1"][1].rirActual, 1);
});

test("buildInitialSetInputMap defaults to one set when sets is null", () => {
  const inputMap = buildInitialSetInputMap([{
    id: "pe-1",
    name: "Bench Press",
    sets: null,
    reps: "8",
    intensity: null,
    isLoadable: true,
    guidelineLoad: null,
  }]);

  assert.equal(inputMap["pe-1"].length, 1);
});

test("buildSegmentLogRows emits one row per set", () => {
  const rows = buildSegmentLogRows(
    [{
      id: "pe-1",
      name: "Back Squat",
      sets: 3,
      reps: "5",
      intensity: null,
      isLoadable: true,
    }],
    {
      "pe-1": [
        { weight: "100", reps: "5", rirActual: 2 },
        { weight: "100", reps: "5", rirActual: 2 },
        { weight: "102.5", reps: "4", rirActual: 1 },
      ],
    },
  );

  assert.deepEqual(rows.map((row) => row.orderIndex), [1, 2, 3]);
  assert.equal(rows[2].weightKg, 102.5);
  assert.equal(rows[2].repsCompleted, 4);
});

test("computeSessionStatsFromSegments uses logged segments only", () => {
  const stats = computeSessionStatsFromSegments(
    [
      {
        id: "seg-1",
        exercises: [{
          id: "pe-1",
          name: "Back Squat",
          sets: 3,
          reps: "5",
          isLoadable: true,
          guidelineLoad: { value: 100, unit: "kg", confidence: "medium" },
        }],
      },
      {
        id: "seg-2",
        exercises: [{
          id: "pe-2",
          name: "Bench Press",
          sets: 2,
          reps: "8",
          isLoadable: true,
          guidelineLoad: { value: 60, unit: "kg", confidence: "medium" },
        }],
      },
    ] as never,
    { "seg-1": { updatedAt: new Date().toISOString() } },
  );

  assert.equal(stats.totalSets, 3);
  assert.equal(stats.exerciseCount, 1);
  assert.equal(stats.totalVolumeKg, 1500);
});
