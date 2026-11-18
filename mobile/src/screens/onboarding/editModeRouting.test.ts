import { describe, expect, it } from "vitest";
import { nextRouteAfterSave } from "./editModeRouting";

describe("edit save routes", () => {
  const review = { name: "ProgramReview", params: { preserveDraft: true }, method: "replace" };
  it.each([
    ["goals", {}],
    ["equipment", { fitnessLevel: "Beginner", equipmentChanged: true }],
    ["equipment", { fitnessLevel: "Intermediate", equipmentChanged: false }],
    ["baselineLoads", {}],
    ["schedule", { dayCountChanged: false, daysPerWeek: 4 }],
    ["bodyMetrics", {}],
  ] as const)("%s returns to review when no dependent edit is needed (%j)", (step, options) => {
    expect(nextRouteAfterSave(step, { returnToReview: true, ...options })).toEqual(review);
  });
  it.each(["Intermediate", "Advanced", "Elite"])("changed equipment for %s opens baseline loads in edit mode", fitnessLevel => {
    expect(nextRouteAfterSave("equipment", { returnToReview: true, fitnessLevel, equipmentChanged: true }))
      .toEqual({ name: "Step2bBaselineLoads", params: { returnToReview: true }, method: "replace" });
  });
  it("changed day count opens split review with the new count", () => {
    expect(nextRouteAfterSave("schedule", { returnToReview: true, dayCountChanged: true, daysPerWeek: 3 }))
      .toEqual({ name: "SplitReview", params: { daysPerWeek: 3 }, method: "navigate" });
  });
  it.each([
    ["goals", {}, "Step2Equipment", undefined, "replace"],
    ["equipment", { fitnessLevel: "Beginner" }, "YearGoal", undefined, "replace"],
    ["equipment", { fitnessLevel: "Intermediate" }, "Step2bBaselineLoads", undefined, "replace"],
    ["baselineLoads", {}, "YearGoal", undefined, "replace"],
    ["schedule", {}, "Step4BodyMetrics", undefined, "navigate"],
    ["bodyMetrics", { daysPerWeek: 4 }, "SplitReview", { daysPerWeek: 4 }, "navigate"],
  ] as const)("first-run %s keeps its original route (%j)", (step, options, name, params, method) => {
    expect(nextRouteAfterSave(step, { returnToReview: false, ...options })).toEqual({ name, params, method });
  });
});
