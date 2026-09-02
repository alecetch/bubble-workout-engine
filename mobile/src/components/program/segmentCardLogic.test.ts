import {
    getSegmentPresentation,
    isCombinedSupersetEffort,
    isPairLayoutEligible,
    isRoundBasedSegment,
} from "./segmentCardLogic.js";
test("warmup segment shows notes-only behavior and no log button", () => {
    const out = getSegmentPresentation({
        segmentType: "warmup",
        notes: "Prep shoulders and hips.",
        rounds: 2,
        exercises: [],
    });
    expect(out.isWarmupOrCooldown).toBe(true);
    expect(out.segmentHasExercises).toBe(false);
    expect(out.showLogButton).toBe(false);
    expect(out.showRoundsIndicator).toBe(false);
    expect(out.notesText).toBe("Prep shoulders and hips.");
});
test("cooldown segment shows notes fallback and no log button", () => {
    const out = getSegmentPresentation({
        segmentType: "cooldown",
        notes: " ",
        exercises: [],
    });
    expect(out.isWarmupOrCooldown).toBe(true);
    expect(out.segmentHasExercises).toBe(false);
    expect(out.showLogButton).toBe(false);
    expect(out.showRoundsIndicator).toBe(false);
    expect(out.notesText).toBe("No notes provided.");
});
test("non-warmup segment with no exercises hides log button", () => {
    const out = getSegmentPresentation({
        segmentType: "single",
        rounds: 1,
        exercises: [],
    });
    expect(out.isWarmupOrCooldown).toBe(false);
    expect(out.segmentHasExercises).toBe(false);
    expect(out.showLogButton).toBe(false);
    expect(out.showRoundsIndicator).toBe(false);
});
test("non-warmup segment with exercises shows log button", () => {
    const out = getSegmentPresentation({
        segmentType: "superset",
        rounds: 1,
        exercises: [{ id: "ex1" }],
    });
    expect(out.isWarmupOrCooldown).toBe(false);
    expect(out.segmentHasExercises).toBe(true);
    expect(out.showLogButton).toBe(true);
    expect(out.showRoundsIndicator).toBe(false);
});
test("segment with rounds > 1 and exercises shows rounds indicator", () => {
    const out = getSegmentPresentation({
        segmentType: "superset",
        rounds: 3,
        exercises: [{ id: "ex1" }],
    });
    expect(out.showRoundsIndicator).toBe(true);
    expect(out.roundsValue).toBe(3);
});
test("segment with rounds == 1 does not show rounds indicator", () => {
    const out = getSegmentPresentation({
        segmentType: "superset",
        rounds: 1,
        exercises: [{ id: "ex1" }],
    });
    expect(out.showRoundsIndicator).toBe(false);
    expect(out.roundsValue).toBe(1);
});
test("isRoundBasedSegment returns true for supersets", () => {
    expect(isRoundBasedSegment("superset")).toBe(true);
});
test("isRoundBasedSegment returns false for single segments", () => {
    expect(isRoundBasedSegment("single")).toBe(false);
});
test("isPairLayoutEligible returns true for two exercises", () => {
    expect(isPairLayoutEligible(2)).toBe(true);
});
test("isPairLayoutEligible returns false for non-pair exercise counts", () => {
    expect(isPairLayoutEligible(1)).toBe(false);
    expect(isPairLayoutEligible(3)).toBe(false);
    expect(isPairLayoutEligible(4)).toBe(false);
});
test("isCombinedSupersetEffort returns true only for two-exercise supersets", () => {
    expect(isCombinedSupersetEffort("superset", 2)).toBe(true);
    expect(isCombinedSupersetEffort("giant_set", 2)).toBe(false);
    expect(isCombinedSupersetEffort("superset", 3)).toBe(false);
    expect(isCombinedSupersetEffort("superset", 1)).toBe(false);
    expect(isCombinedSupersetEffort(null, 2)).toBe(false);
});
