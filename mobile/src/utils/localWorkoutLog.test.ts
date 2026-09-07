import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetForTest,
  allExercisesComplete,
  getExerciseComplete,
  getWorkoutStartedAt,
  markWorkoutStartedAt,
  setExerciseComplete,
} from "./localWorkoutLog";

describe("exercise completion persistence", () => {
  beforeEach(() => {
    _resetForTest();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("returns null when no workout start timestamp has been recorded", async () => {
    await expect(getWorkoutStartedAt("day-1")).resolves.toBeNull();
  });

  it("sets a workout start timestamp once", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T10:00:00.000Z"));

    await markWorkoutStartedAt("day-1");
    await expect(getWorkoutStartedAt("day-1")).resolves.toBe(new Date("2026-09-06T10:00:00.000Z").getTime());

    vi.setSystemTime(new Date("2026-09-06T10:05:00.000Z"));
    await markWorkoutStartedAt("day-1");

    await expect(getWorkoutStartedAt("day-1")).resolves.toBe(new Date("2026-09-06T10:00:00.000Z").getTime());
  });
});
