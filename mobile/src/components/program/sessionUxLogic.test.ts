import { buildInitialSetInputMap, buildSegmentLogRows, computeSessionStatsFromLoggedRows, computeSessionStatsFromSegments, computeTotalPrescribedSets, formatRoundSummary, getExerciseSetCount, guidelinePrefill, parseRepsPrefill, parseWeightPrefill, repsPrefill, } from "./sessionUxLogic";
test("guidelinePrefill prefers progression load over guideline load when both are present", () => {
    expect(guidelinePrefill({
        guidelineLoad: { value: 80 },
        progressionRecommendation: { recommendedLoadKg: 100 },
        intensity: "RPE 7",
    })).toBe("100");
});
test("guidelinePrefill falls back appropriately", () => {
    expect(guidelinePrefill({ guidelineLoad: null, intensity: "70" })).toBe("70");
    expect(guidelinePrefill({ guidelineLoad: { value: 0 }, intensity: "50" })).toBe("50");
    expect(guidelinePrefill({ guidelineLoad: null, intensity: "RPE 7-8" })).toBe("");
});
test("guidelinePrefill prefers progression load when guideline load is absent", () => {
    expect(guidelinePrefill({ guidelineLoad: null, progressionRecommendation: { recommendedLoadKg: 115 } })).toBe("115");
});
test("repsPrefill prefers progression recommendation when present", () => {
    expect(repsPrefill({ reps: "6-10", progressionRecommendation: { recommendedRepsTarget: 9 } })).toBe("9");
    expect(repsPrefill({ reps: "6-10" })).toBe("8");
});
test("buildInitialSetInputMap creates per-set state and overlays existing logs by order index", () => {
    const inputMap = buildInitialSetInputMap([{
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
        }], [{
            programExerciseId: "pe-1",
            orderIndex: 2,
            weightKg: 90,
            repsCompleted: 4,
            rirActual: 1,
        }]);
    expect(inputMap["pe-1"].length).toBe(3);
    expect(inputMap["pe-1"][0].weight).toBe("100");
    expect(inputMap["pe-1"][0].reps).toBe("6");
    expect(inputMap["pe-1"][1].weight).toBe("90");
    expect(inputMap["pe-1"][1].reps).toBe("4");
    expect(inputMap["pe-1"][1].rirActual).toBe(1);
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
    expect(inputMap["pe-1"].length).toBe(1);
});
test("buildSegmentLogRows emits one row per set", () => {
    const rows = buildSegmentLogRows([{
            id: "pe-1",
            name: "Back Squat",
            sets: 3,
            reps: "5",
            intensity: null,
            isLoadable: true,
        }], {
        "pe-1": [
            { weight: "100", reps: "5", rirActual: 2 },
            { weight: "100", reps: "5", rirActual: 2 },
            { weight: "102.5", reps: "4", rirActual: 1 },
        ],
    });
    expect(rows.map((row) => row.orderIndex)).toEqual([1, 2, 3]);
    expect(rows[2].weightKg).toBe(102.5);
    expect(rows[2].repsCompleted).toBe(4);
});
test("formatRoundSummary formats completed round count from first exercise", () => {
    const exercises = [
        {
            id: "pe-1",
            name: "Back Squat",
            exerciseId: "bb-squat",
            isLoadable: true,
        },
        {
            id: "pe-2",
            name: "Romanian Deadlift",
            exerciseId: "bb-rdl",
            isLoadable: true,
        },
    ];
    const done = new Set(["pe-1:0", "pe-2:0", "pe-1:1", "pe-2:1"]);
    expect(formatRoundSummary(exercises as never, 4, 2, {
        "pe-1": [
            { weight: "80", reps: "8", rirActual: null },
            { weight: "82.5", reps: "7", rirActual: null },
        ],
        "pe-2": [
            { weight: "60", reps: "10", rirActual: null },
            { weight: "62.5", reps: "9", rirActual: null },
        ],
    }, done)).toBe("2/4 rounds · 82.5 kg x 7 ✓");
});
test("formatRoundSummary formats unloaded first exercise", () => {
    const exercises = [{
        id: "pe-1",
        name: "Push-up",
        exerciseId: "push-up",
        isLoadable: false,
    }];
    expect(formatRoundSummary(exercises as never, 1, 1, {
        "pe-1": [{ weight: "", reps: "12", rirActual: null }],
    }, new Set(["pe-1:0"]))).toBe("1 rounds · bodyweight x 12 ✓");
});
test("computeSessionStatsFromSegments uses logged segments only", () => {
    const stats = computeSessionStatsFromSegments([
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
    ] as never, { "seg-1": { updatedAt: new Date().toISOString() } });
    expect(stats.totalSets).toBe(3);
    expect(stats.exerciseCount).toBe(1);
    expect(stats.totalVolumeKg).toBe(1500);
});
test("computeTotalPrescribedSets counts prescribed sets across loadable and unloaded exercises", () => {
    expect(computeTotalPrescribedSets([
        {
            id: "seg-1",
            exercises: [
                { id: "pe-1", name: "Back Squat", sets: 3, isLoadable: true },
                { id: "pe-2", name: "Push-up", sets: 2, isLoadable: false },
                { id: null, name: "Untracked", sets: 5, isLoadable: true },
            ],
        },
        {
            id: "seg-2",
            exercises: [{ id: "pe-3", name: "Carry", sets: null, isLoadable: true }],
        },
    ] as never)).toBe(6);
});
test("parseWeightPrefill parses a plain numeric string", () => {
    expect(parseWeightPrefill("70")).toBe("70");
});
test("parseWeightPrefill returns empty string for non-numeric intensity", () => {
    expect(parseWeightPrefill("RPE 7")).toBe("");
    expect(parseWeightPrefill(null)).toBe("");
    expect(parseWeightPrefill(undefined)).toBe("");
});
test("parseWeightPrefill returns empty string for zero or negative", () => {
    expect(parseWeightPrefill("0")).toBe("");
    expect(parseWeightPrefill("-5")).toBe("");
});
test("parseRepsPrefill returns the integer when given a plain integer string", () => {
    expect(parseRepsPrefill("10")).toBe("10");
});
test("parseRepsPrefill falls back to 10 when reps is 0 or below 1", () => {
    expect(parseRepsPrefill("0")).toBe("10");
});
test("parseRepsPrefill returns midpoint for a range with hyphen", () => {
    expect(parseRepsPrefill("8-12")).toBe("10");
});
test("parseRepsPrefill returns midpoint for a range with en-dash", () => {
    expect(parseRepsPrefill("8–12")).toBe("10");
});
test("parseRepsPrefill returns 10 for non-parseable strings and empty/null", () => {
    expect(parseRepsPrefill("AMRAP")).toBe("10");
    expect(parseRepsPrefill("")).toBe("10");
    expect(parseRepsPrefill(null)).toBe("10");
});
test("getExerciseSetCount returns the numeric value when sets is a positive number", () => {
    expect(getExerciseSetCount({ sets: 3 })).toBe(3);
});
test("getExerciseSetCount returns 1 when sets is null or undefined", () => {
    expect(getExerciseSetCount({ sets: null })).toBe(1);
    expect(getExerciseSetCount({})).toBe(1);
});
test("getExerciseSetCount coerces string sets", () => {
    expect(getExerciseSetCount({ sets: "2" })).toBe(2);
});
test("getExerciseSetCount clamps to minimum 1 for zero or NaN", () => {
    expect(getExerciseSetCount({ sets: 0 })).toBe(1);
    expect(getExerciseSetCount({ sets: "abc" })).toBe(1);
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
    expect(stats.totalVolumeKg).toBe(1900);
    expect(stats.totalSets).toBe(4);
    expect(stats.exerciseCount).toBe(2);
});
test("computeSessionStatsFromLoggedRows excludes rows with null weight or zero reps from volume", () => {
    const stats = computeSessionStatsFromLoggedRows({
        "seg-1": [
            { programExerciseId: "pe-1", orderIndex: 1, weightKg: null, repsCompleted: 5, rirActual: null },
            { programExerciseId: "pe-2", orderIndex: 1, weightKg: 80, repsCompleted: 0, rirActual: null },
            { programExerciseId: "pe-3", orderIndex: 1, weightKg: 80, repsCompleted: 5, rirActual: null },
        ],
    });
    expect(stats.totalVolumeKg).toBe(400);
    expect(stats.totalSets).toBe(3);
    expect(stats.exerciseCount).toBe(3);
});
