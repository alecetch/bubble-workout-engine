import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInitialSetInputMap,
  buildSegmentLogRows,
  computeSessionStatsFromLoggedRows,
  computeSessionStatsFromSegments,
  getExerciseSetCount,
  guidelinePrefill,
  parseRepsPrefill,
  parseWeightPrefill,
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

test("parseWeightPrefill parses a plain numeric string", () => {
  assert.equal(parseWeightPrefill("70"), "70");
});

test("parseWeightPrefill returns empty string for non-numeric intensity", () => {
  assert.equal(parseWeightPrefill("RPE 7"), "");
  assert.equal(parseWeightPrefill(null), "");
  assert.equal(parseWeightPrefill(undefined), "");
});

test("parseWeightPrefill returns empty string for zero or negative", () => {
  assert.equal(parseWeightPrefill("0"), "");
  assert.equal(parseWeightPrefill("-5"), "");
});

test("parseRepsPrefill returns the integer when given a plain integer string", () => {
  assert.equal(parseRepsPrefill("10"), "10");
});

test("parseRepsPrefill falls back to 10 when reps is 0 or below 1", () => {
  assert.equal(parseRepsPrefill("0"), "10");
});

test("parseRepsPrefill returns midpoint for a range with hyphen", () => {
  assert.equal(parseRepsPrefill("8-12"), "10");
});

test("parseRepsPrefill returns midpoint for a range with en-dash", () => {
  assert.equal(parseRepsPrefill("8–12"), "10");
});

test("parseRepsPrefill returns 10 for non-parseable strings and empty/null", () => {
  assert.equal(parseRepsPrefill("AMRAP"), "10");
  assert.equal(parseRepsPrefill(""), "10");
  assert.equal(parseRepsPrefill(null), "10");
});

test("getExerciseSetCount returns the numeric value when sets is a positive number", () => {
  assert.equal(getExerciseSetCount({ sets: 3 }), 3);
});

test("getExerciseSetCount returns 1 when sets is null or undefined", () => {
  assert.equal(getExerciseSetCount({ sets: null }), 1);
  assert.equal(getExerciseSetCount({}), 1);
});

test("getExerciseSetCount coerces string sets", () => {
  assert.equal(getExerciseSetCount({ sets: "2" }), 2);
});

test("getExerciseSetCount clamps to minimum 1 for zero or NaN", () => {
  assert.equal(getExerciseSetCount({ sets: 0 }), 1);
  assert.equal(getExerciseSetCount({ sets: "abc" }), 1);
});

test("computeSessionStatsFromLoggedRows sums volume across segments", () => {
  const stats = computeSessionStatsFromLoggedRows({
    "seg-1": [
      { programExerciseId: "pe-1", orderIndex: 1, weightKg: 100, repsCompleted: 5, rirActual: null },
      { programExerciseId: "pe-1", orderIndex: 2, weightKg: 100, repsCompleted: 5, rirActual: null },
      { programExerciseId: "pe-1", orderIndex: 3, weightKg: 105, repsCompleted: 4, rirActual: null },
    ],
    "seg-2": [
      { programExerciseId: "pe-2", orderIndex: 1, weightKg: 60, repsCompleted: 8, rirActual: null },
    ],
  });

  assert.equal(stats.totalVolumeKg, 1900);
  assert.equal(stats.totalSets, 4);
  assert.equal(stats.exerciseCount, 2);
});

test("computeSessionStatsFromLoggedRows excludes rows with null weight or zero reps from volume", () => {
  const stats = computeSessionStatsFromLoggedRows({
    "seg-1": [
      { programExerciseId: "pe-1", orderIndex: 1, weightKg: null, repsCompleted: 5, rirActual: null },
      { programExerciseId: "pe-2", orderIndex: 1, weightKg: 80, repsCompleted: 0, rirActual: null },
      { programExerciseId: "pe-3", orderIndex: 1, weightKg: 80, repsCompleted: 5, rirActual: null },
    ],
  });

  assert.equal(stats.totalVolumeKg, 400);
  assert.equal(stats.totalSets, 3);
  assert.equal(stats.exerciseCount, 3);
});
