/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProgramDayFullResponse } from "../../../api/programViewer";
import {
  allExercisesComplete,
  getSegmentLog,
  getWorkoutComplete,
  setWorkoutComplete,
} from "../../../utils/localWorkoutLog";
import { useLocalDayState } from "./useLocalDayState";

vi.mock("../../../utils/localWorkoutLog", () => ({
  allExercisesComplete: vi.fn(),
  getSegmentLog: vi.fn(),
  getWorkoutComplete: vi.fn(),
  setWorkoutComplete: vi.fn(),
}));

type SegmentDetail = ProgramDayFullResponse["segments"][number];

const allExercisesCompleteMock = vi.mocked(allExercisesComplete);
const getSegmentLogMock = vi.mocked(getSegmentLog);
const getWorkoutCompleteMock = vi.mocked(getWorkoutComplete);
const setWorkoutCompleteMock = vi.mocked(setWorkoutComplete);

function segment(id: string): SegmentDetail {
  return {
    id,
    orderInDay: 1,
    segmentName: id,
    exercises: [],
  } as SegmentDetail;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useLocalDayState", () => {
  it("loads segment logs, workout completion, and exercise-card completion on mount", async () => {
    getWorkoutCompleteMock.mockResolvedValue(true);
    getSegmentLogMock.mockImplementation(async (_programDayId, segmentId) =>
      segmentId === "seg-1" ? { updatedAt: "now", exerciseSetCounts: { ex: 2 } } : null,
    );
    allExercisesCompleteMock.mockResolvedValue(true);

    const { result } = renderHook(() =>
      useLocalDayState("day-1", [segment("seg-1"), segment("seg-2")], ["ex-1"], null),
    );

    await waitFor(() => expect(result.current.workoutComplete).toBe(true));

    expect(result.current.segmentLogs["seg-1"]).toEqual({
      updatedAt: "now",
      exerciseSetCounts: { ex: 2 },
    });
    expect(result.current.segmentLogs["seg-2"]).toBeUndefined();
    expect(result.current.allExerciseCardsComplete).toBe(true);
    expect(getWorkoutCompleteMock).toHaveBeenCalledWith("day-1");
    expect(getSegmentLogMock).toHaveBeenCalledWith("day-1", "seg-1");
  });

  it("refreshExerciseCompletion re-derives allExerciseCardsComplete", async () => {
    getWorkoutCompleteMock.mockResolvedValue(false);
    getSegmentLogMock.mockResolvedValue(null);
    allExercisesCompleteMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const { result } = renderHook(() =>
      useLocalDayState("day-1", [segment("seg-1")], ["ex-1"], null),
    );
    await waitFor(() => expect(result.current.allExerciseCardsComplete).toBe(false));

    act(() => {
      result.current.refreshExerciseCompletion();
    });

    await waitFor(() => expect(result.current.allExerciseCardsComplete).toBe(true));
    expect(allExercisesCompleteMock).toHaveBeenLastCalledWith("day-1", ["ex-1"]);
  });

  it("reconciles server-completed days into local completion state", async () => {
    getWorkoutCompleteMock.mockResolvedValue(false);
    getSegmentLogMock.mockResolvedValue(null);
    allExercisesCompleteMock.mockResolvedValue(false);

    const { result } = renderHook(() =>
      useLocalDayState("day-1", [segment("seg-1")], ["ex-1"], true),
    );

    await waitFor(() => expect(result.current.workoutComplete).toBe(true));

    expect(setWorkoutCompleteMock).toHaveBeenCalledWith("day-1", true);
  });

  it("keeps local completion when the server value is false", async () => {
    getWorkoutCompleteMock.mockResolvedValue(true);
    getSegmentLogMock.mockResolvedValue(null);
    allExercisesCompleteMock.mockResolvedValue(false);

    const { result } = renderHook(() =>
      useLocalDayState("day-1", [segment("seg-1")], ["ex-1"], false),
    );

    await waitFor(() => expect(result.current.workoutComplete).toBe(true));

    expect(setWorkoutCompleteMock).not.toHaveBeenCalled();
  });
});
