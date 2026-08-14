/** @vitest-environment jsdom */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProgramDayFullResponse } from "../../../api/programViewer";
import { getExerciseComplete } from "../../../utils/localWorkoutLog";
import { useLocalExerciseCompletion } from "./useLocalExerciseCompletion";

vi.mock("../../../utils/localWorkoutLog", () => ({
  getExerciseComplete: vi.fn(),
}));

type Exercise = ProgramDayFullResponse["segments"][number]["exercises"][number];

const getExerciseCompleteMock = vi.mocked(getExerciseComplete);

function exercise(id: string): Exercise {
  return {
    id,
    exerciseId: id,
    name: id,
    sets: 1,
  } as Exercise;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLocalExerciseCompletion", () => {
  it("loads completed exercise ids on mount", async () => {
    getExerciseCompleteMock.mockImplementation(async (_programDayId, exerciseId) => exerciseId === "ex-2");

    const { result } = renderHook(() =>
      useLocalExerciseCompletion([exercise("ex-1"), exercise("ex-2")], "day-1"),
    );

    await waitFor(() => expect(result.current.completedExerciseIds.has("ex-2")).toBe(true));

    expect(result.current.completedExerciseIds.has("ex-1")).toBe(false);
    expect(getExerciseCompleteMock).toHaveBeenCalledWith("day-1", "ex-1");
    expect(getExerciseCompleteMock).toHaveBeenCalledWith("day-1", "ex-2");
  });

  it("does not update state after unmount when completion promises resolve", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let resolveCompletion: (value: boolean) => void = () => undefined;
    getExerciseCompleteMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveCompletion = resolve;
      }),
    );

    const { result, unmount } = renderHook(() =>
      useLocalExerciseCompletion([exercise("ex-1")], "day-1"),
    );

    unmount();
    resolveCompletion(true);

    await Promise.resolve();

    expect(result.current.completedExerciseIds.size).toBe(0);
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("state update on an unmounted component"),
    );
  });
});
