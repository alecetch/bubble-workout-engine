/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setWorkoutComplete } from "../../../utils/localWorkoutLog";
import { useDayCompletionFlow } from "./useDayCompletionFlow";

vi.mock("../../../api/hooks", () => ({
  queryKeys: {
    programOverview: (programId: string, options: { userId?: string }) => [
      "programOverview",
      programId,
      options,
    ],
    programEndCheck: (programId: string) => ["programEndCheck", programId],
  },
}));

vi.mock("../../../api/history", () => ({
  getPrsFeed: vi.fn().mockResolvedValue({ rows: [] }),
}));

vi.mock("../../../api/programCompletion", () => ({
  getProgramEndCheck: vi.fn(),
}));

vi.mock("../../../api/programViewer", () => ({
  getProgramOverview: vi.fn(),
}));

vi.mock("../../../utils/localWorkoutLog", () => ({
  setWorkoutComplete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../utils/storeReview", () => ({
  hasRequestedStoreReview: vi.fn().mockResolvedValue(true),
}));

const setWorkoutCompleteMock = vi.mocked(setWorkoutComplete);

function renderFlow(overrides: Partial<Parameters<typeof useDayCompletionFlow>[0]> = {}) {
  const markDayComplete = {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  } as any;
  const completeProgram = {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  } as any;
  const queryClient = {
    fetchQuery: vi.fn(),
  } as any;
  const nav = {
    navigate: vi.fn(),
  } as any;
  const params = {
    programDayId: "day-1",
    programId: "",
    userId: "user-1",
    markDayComplete,
    completeProgram,
    queryClient,
    nav,
    setSummaryVisible: vi.fn(),
    setWorkoutCompleteState: vi.fn(),
    setConfirmationText: vi.fn(),
    computeSessionStats: vi.fn(() => ({ totalVolumeKg: 123 })),
    day: { weekNumber: 1 },
    ...overrides,
  };
  const rendered = renderHook(() => useDayCompletionFlow(params));
  return { ...rendered, params, markDayComplete, completeProgram, queryClient, nav };
}

function overview() {
  return {
    calendarDays: [],
  };
}

function endCheck(overrides: Record<string, unknown>) {
  return {
    lifecycleStatus: "active",
    isLastScheduledDayComplete: false,
    missedWorkoutsCount: 1,
    canCompleteWithSkips: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useDayCompletionFlow", () => {
  it("marks the day complete and persists local completion", async () => {
    const { result, markDayComplete, params } = renderFlow();

    await act(async () => {
      await result.current.handleSummaryDismiss();
    });

    expect(markDayComplete.mutateAsync).toHaveBeenCalledWith({
      programDayId: "day-1",
      isCompleted: true,
      userId: "user-1",
    });
    expect(setWorkoutCompleteMock).toHaveBeenCalledWith("day-1", true);
    expect(params.setWorkoutCompleteState).toHaveBeenCalledWith(true);
  });

  it("navigates to ProgramComplete when lifecycleStatus is completed", async () => {
    const { result, queryClient, nav } = renderFlow({ programId: "program-1" });
    queryClient.fetchQuery
      .mockResolvedValueOnce(overview())
      .mockResolvedValueOnce(endCheck({ lifecycleStatus: "completed" }));

    await act(async () => {
      await result.current.handleSummaryDismiss();
    });

    expect(nav.navigate).toHaveBeenCalledWith("ProgramComplete", { programId: "program-1" });
  });

  it("completes the program as scheduled when the last scheduled day has no misses", async () => {
    const { result, queryClient, completeProgram, nav } = renderFlow({ programId: "program-1" });
    queryClient.fetchQuery
      .mockResolvedValueOnce(overview())
      .mockResolvedValueOnce(endCheck({ isLastScheduledDayComplete: true, missedWorkoutsCount: 0 }));

    await act(async () => {
      await result.current.handleSummaryDismiss();
    });

    expect(completeProgram.mutateAsync).toHaveBeenCalledWith({
      programId: "program-1",
      mode: "as_scheduled",
    });
    expect(nav.navigate).toHaveBeenCalledWith("ProgramComplete", { programId: "program-1" });
  });

  it("navigates to ProgramEndCheck when completion with skips is available", async () => {
    const { result, queryClient, nav } = renderFlow({ programId: "program-1" });
    queryClient.fetchQuery
      .mockResolvedValueOnce(overview())
      .mockResolvedValueOnce(endCheck({ canCompleteWithSkips: true }));

    await act(async () => {
      await result.current.handleSummaryDismiss();
    });

    expect(nav.navigate).toHaveBeenCalledWith("ProgramEndCheck", { programId: "program-1" });
  });
});
