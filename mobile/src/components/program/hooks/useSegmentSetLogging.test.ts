/** @vitest-environment jsdom */
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProgramDayFullResponse } from "../../../api/programViewer";
import type { SegmentLogRow } from "../../../api/segmentLog";
import { useSegmentSetLogging } from "./useSegmentSetLogging";

type Exercise = ProgramDayFullResponse["segments"][number]["exercises"][number];

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "exercise-1",
    exerciseId: "base-1",
    name: "Bench Press",
    sets: 2,
    reps: "8",
    intensity: "40",
    isLoadable: true,
    isUnloaded: false,
    guidelineLoad: { value: 50, unit: "kg" },
    progressionRecommendation: null,
    ...overrides,
  } as Exercise;
}

function row(overrides: Partial<SegmentLogRow> = {}): SegmentLogRow {
  return {
    id: "row-1",
    programExerciseId: "exercise-1",
    weightKg: 60,
    repsCompleted: 7,
    rirActual: 2,
    orderIndex: 1,
    ...overrides,
  };
}

describe("useSegmentSetLogging", () => {
  it("hydrates flat-set inputMap from existing log rows on open", async () => {
    const loggableExercises = [exercise()];
    const { result } = renderHook(() =>
      useSegmentSetLogging({
        loggableExercises,
        existingLogsQuery: { data: [row()], isLoading: false },
        inlineLoggingOpen: true,
        isRoundBased: false,
        totalRounds: 1,
      }),
    );

    await waitFor(() => expect(result.current.initialized).toBe(true));

    expect(result.current.inputMap["exercise-1"]).toEqual([
      { weight: "60", reps: "7", rirActual: 2 },
      { weight: "50", reps: "8", rirActual: null },
    ]);
    expect(result.current.exerciseRirMap).toEqual({ "exercise-1": 2 });
    expect(result.current.activeSetKey).toBe("exercise-1:0");
  });

  it("hydrates round-based inputMap from existing log rows on open", async () => {
    const resetRoundState = vi.fn();
    const loggableExercises = [exercise({ sets: 3 })];
    const { result } = renderHook(() =>
      useSegmentSetLogging({
        loggableExercises,
        existingLogsQuery: {
          data: [
            row({ orderIndex: 1, weightKg: 62, repsCompleted: 6, rirActual: null }),
            row({ id: "row-2", orderIndex: 3, weightKg: 65, repsCompleted: 5, rirActual: 1 }),
          ],
          isLoading: false,
        },
        inlineLoggingOpen: true,
        isRoundBased: true,
        totalRounds: 3,
        onRoundStateReset: resetRoundState,
      }),
    );

    await waitFor(() => expect(result.current.initialized).toBe(true));

    expect(result.current.inputMap["exercise-1"]).toEqual([
      { weight: "62", reps: "6", rirActual: null },
      { weight: "50", reps: "8", rirActual: null },
      { weight: "65", reps: "5", rirActual: 1 },
    ]);
    expect(result.current.exerciseRirMap).toEqual({ "exercise-1": 1 });
    expect(resetRoundState).toHaveBeenCalledTimes(1);
  });

  it("does not re-hydrate while already initialized", async () => {
    const loggableExercises = [exercise()];
    const { result, rerender } = renderHook(
      ({ data }) =>
        useSegmentSetLogging({
          loggableExercises,
          existingLogsQuery: { data, isLoading: false },
          inlineLoggingOpen: true,
          isRoundBased: false,
          totalRounds: 1,
        }),
      { initialProps: { data: [row({ weightKg: 60 })] } },
    );

    await waitFor(() => expect(result.current.initialized).toBe(true));

    rerender({ data: [row({ weightKg: 90 })] });

    expect(result.current.inputMap["exercise-1"]?.[0]?.weight).toBe("60");
  });

  it("resets to uninitialized when closed and hydrates new data on reopen", async () => {
    const loggableExercises = [exercise()];
    const { result, rerender } = renderHook(
      ({ data, open }) =>
        useSegmentSetLogging({
          loggableExercises,
          existingLogsQuery: { data, isLoading: false },
          inlineLoggingOpen: open,
          isRoundBased: false,
          totalRounds: 1,
        }),
      { initialProps: { data: [row({ weightKg: 60 })], open: true } },
    );

    await waitFor(() => expect(result.current.initialized).toBe(true));

    rerender({ data: [row({ weightKg: 70 })], open: false });
    await waitFor(() => expect(result.current.initialized).toBe(false));

    rerender({ data: [row({ weightKg: 70 })], open: true });
    await waitFor(() => expect(result.current.initialized).toBe(true));

    expect(result.current.inputMap["exercise-1"]?.[0]?.weight).toBe("70");
  });
});
