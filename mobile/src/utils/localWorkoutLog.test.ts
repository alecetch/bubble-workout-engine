import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetForTest,
  allExercisesComplete,
  getExerciseComplete,
  setExerciseComplete,
} from "./localWorkoutLog";

describe("exercise completion persistence", () => {
  beforeEach(() => {
    _resetForTest();
  });

  it("persists exercise complete state", async () => {
    await setExerciseComplete("day-1", "pe-1", true);

    await expect(getExerciseComplete("day-1", "pe-1")).resolves.toBe(true);
  });

  it("returns false when at least one exercise is incomplete", async () => {
    await setExerciseComplete("day-1", "pe-1", true);

    await expect(allExercisesComplete("day-1", ["pe-1", "pe-2"])).resolves.toBe(false);
  });

  it("returns true only when all exercises are complete", async () => {
    await setExerciseComplete("day-1", "pe-1", true);
    await setExerciseComplete("day-1", "pe-2", true);

    await expect(allExercisesComplete("day-1", ["pe-1", "pe-2"])).resolves.toBe(true);
  });

  it("returns true for an empty exercise list", async () => {
    await expect(allExercisesComplete("day-1", [])).resolves.toBe(true);
  });
});
