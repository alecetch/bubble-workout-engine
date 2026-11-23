import { onlineManager, QueryClient, MutationObserver } from "@tanstack/react-query";
import { Alert } from "react-native";
/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setWorkoutComplete } from "../../../utils/localWorkoutLog";
import { useDayCompletionFlow } from "./useDayCompletionFlow";

vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));

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
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  } as any;
  const completeProgram = {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  } as any;
  const queryClient = {
    fetchQuery: vi.fn(),
  } as any;
  const parentNav = {
    navigate: vi.fn(),
  };
  const nav = {
    navigate: vi.fn(),
    getParent: vi.fn(() => parentNav),
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
  return { ...rendered, params, markDayComplete, completeProgram, queryClient, nav, parentNav };
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
  onlineManager.setOnline(true);
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useDayCompletionFlow", () => {
  it("queues milestones earned by confirmed logs before the completion request", async () => {
    const row = { id: "logged", slug: "day_25", threshold: 25, year: 2026 };
    const markDayComplete = { isPending: false, mutateAsync: vi.fn().mockResolvedValue({ year_progress: {
      target: 200, new_milestones: [], unseen_milestones: [row],
    } }) } as any;
    const flow = renderFlow({ programId: "prog-1", markDayComplete });
    flow.queryClient.fetchQuery.mockResolvedValueOnce(overview()).mockResolvedValueOnce(endCheck({}));
    await act(async () => { await flow.result.current.handleSummaryDismiss(); });
    expect(flow.nav.navigate).toHaveBeenCalledWith("ProgramDashboard", expect.objectContaining({ yearMilestone: { ...row, target: 200 } }));
  });
  it("routes a milestone alone through the dashboard instead of Today", async () => {
    const milestone = { id: "day1", slug: "day_1", threshold: 1, year: 2026 };
    const markDayComplete = { isPending: false, mutateAsync: vi.fn().mockResolvedValue({ year_progress: {
      year: 2026, count: 1, target: 200, new_milestones: [milestone],
    } }) } as any;
    const flow = renderFlow({ programId: "prog-1", markDayComplete });
    flow.queryClient.fetchQuery.mockResolvedValueOnce(overview()).mockResolvedValueOnce(endCheck({}));
    await act(async () => { await flow.result.current.handleSummaryDismiss(); });
    expect(flow.nav.navigate).toHaveBeenCalledWith("ProgramDashboard", expect.objectContaining({
      yearMilestone: { ...milestone, target: 200, count: 1 },
    }));
    expect(flow.parentNav.navigate).not.toHaveBeenCalled();
  });

  it("celebrates the highest milestone before the terminal program destination", async () => {
    const rows = [{ id: "day100", slug: "day_100", threshold: 100, year: 2026 }, { id: "club200", slug: "club_200", threshold: 200, year: 2026 }];
    const markDayComplete = { isPending: false, mutateAsync: vi.fn().mockResolvedValue({ year_progress: { target: 200, new_milestones: rows } }) } as any;
    const flow = renderFlow({ programId: "prog-1", markDayComplete });
    flow.queryClient.fetchQuery.mockResolvedValueOnce(overview()).mockResolvedValueOnce(endCheck({ lifecycleStatus: "completed" }));
    await act(async () => { await flow.result.current.handleSummaryDismiss(); });
    expect(flow.nav.navigate).toHaveBeenCalledWith("ProgramDashboard", expect.objectContaining({
      completionDestination: "ProgramComplete", yearMilestone: { ...rows[1], target: 200 },
    }));
  });
  it("skips the week banner and review when a milestone precedes the terminal destination", async () => {
    const milestone = { id: "day1", slug: "day_1", threshold: 1, year: 2026 };
    const markDayComplete = { isPending: false, mutateAsync: vi.fn().mockResolvedValue({ year_progress: { target: 200, new_milestones: [milestone] } }) } as any;
    const flow = renderFlow({ programId: "prog-1", markDayComplete });
    flow.queryClient.fetchQuery.mockResolvedValueOnce(overview()).mockResolvedValueOnce(endCheck({ lifecycleStatus: "completed" }));
    await act(async () => { await flow.result.current.handleSummaryDismiss(); });
    expect(flow.nav.navigate).toHaveBeenCalledWith("ProgramDashboard", {
      programId: "prog-1", yearMilestone: { ...milestone, target: 200 }, completionDestination: "ProgramComplete",
    });
  });
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

  it("ignores a repeat summary dismiss while day completion is pending", async () => {
    let resolveMutation: (() => void) | null = null;
    const markDayComplete = {
      isPending: false,
      mutateAsync: vi.fn(() => {
        markDayComplete.isPending = true;
        return new Promise<void>((resolve) => {
          resolveMutation = resolve;
        });
      }),
    } as any;
    const { result } = renderFlow({ markDayComplete });

    const firstDismiss = act(async () => {
      const first = result.current.handleSummaryDismiss();
      await Promise.resolve();
      await result.current.handleSummaryDismiss();
      resolveMutation?.();
      await first;
    });

    await firstDismiss;

    expect(markDayComplete.mutateAsync).toHaveBeenCalledTimes(1);
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

  it("threads completed week volume through to ProgramDashboard navigation", async () => {
    const { result, queryClient, nav } = renderFlow({ programId: "program-1" });
    queryClient.fetchQuery
      .mockResolvedValueOnce({
        calendarDays: [
          {
            isTrainingDay: true,
            programDayId: "day-1",
            weekNumber: 1,
            status: "scheduled",
          },
        ],
      })
      .mockResolvedValueOnce(endCheck({}));

    await act(async () => {
      await result.current.handleSummaryDismiss();
    });

    expect(nav.navigate).toHaveBeenCalledWith("ProgramDashboard", {
      programId: "program-1",
      showReviewPrompt: undefined,
      weekCompleteNumber: 1,
      weekCompleteSessions: 1,
      weekCompleteVolumeKg: 123,
    });
  });

  it("navigates ordinary completions to TodayTab via the parent navigator", async () => {
    const { result, queryClient, nav, parentNav } = renderFlow({ programId: "program-1" });
    queryClient.fetchQuery
      .mockResolvedValueOnce({
        calendarDays: [
          {
            isTrainingDay: true,
            programDayId: "day-1",
            weekNumber: 1,
            status: "scheduled",
          },
          {
            isTrainingDay: true,
            programDayId: "day-2",
            weekNumber: 1,
            status: "scheduled",
          },
        ],
      })
      .mockResolvedValueOnce(endCheck({}));

    await act(async () => {
      await result.current.handleSummaryDismiss();
    });

    expect(parentNav.navigate).toHaveBeenCalledWith("TodayTab");
    expect(nav.navigate).not.toHaveBeenCalledWith("ProgramDashboard", expect.anything());
  });
  it("offline dismissal closes the summary without queuing completion", async()=>{
    onlineManager.setOnline(false);
    const flow=renderFlow();
    await act(async()=>flow.result.current.handleSummaryDismiss());
    expect(flow.markDayComplete.mutateAsync).not.toHaveBeenCalled();
    expect(flow.params.setSummaryVisible).toHaveBeenCalledWith(false);
    expect(Alert.alert).toHaveBeenCalledWith("You're offline",expect.stringContaining("Your sets are saved on this phone."),[{text:"OK"}]);
    expect(setWorkoutCompleteMock).not.toHaveBeenCalled();
    expect(flow.params.setWorkoutCompleteState).not.toHaveBeenCalled();
  });
  it("a never-settling request times out, ignores late success and allows another attempt",async()=>{
    vi.useFakeTimers();let resolve!:(value:any)=>void;
    const pending=new Promise(r=>{resolve=r;});
    const mutation={isPending:false,isPaused:false,mutateAsync:vi.fn().mockReturnValueOnce(pending).mockResolvedValue(undefined),reset:vi.fn()} as any;
    const flow=renderFlow({markDayComplete:mutation});
    let request!:Promise<void>;
    act(()=>{request=flow.result.current.handleSummaryDismiss();});
    await act(async()=>{await vi.advanceTimersByTimeAsync(15000);await request;});
    expect(flow.params.setConfirmationText).toHaveBeenCalledWith("Couldn't finish the workout. Check your connection and try again.");
    expect(setWorkoutCompleteMock).not.toHaveBeenCalled();expect(mutation.reset).toHaveBeenCalledOnce();
    await act(async()=>{resolve({});await Promise.resolve();});
    expect(setWorkoutCompleteMock).not.toHaveBeenCalled();
    await act(async()=>flow.result.current.handleSummaryDismiss());
    expect(mutation.mutateAsync).toHaveBeenCalledTimes(2);expect(setWorkoutCompleteMock).toHaveBeenCalledOnce();
  });
  it("removes only this paused completion so reconnect cannot send a stale date",async()=>{
    vi.useFakeTimers();const client=new QueryClient();const send=vi.fn().mockResolvedValue({});
    const observer=new MutationObserver(client,{mutationFn:send});
    const otherSend=vi.fn().mockResolvedValue({});
    const otherObserver=new MutationObserver(client,{mutationFn:otherSend});
    const mutation={isPending:false,isPaused:false,reset:()=>observer.reset(),mutateAsync:(variables:any)=>{
      onlineManager.setOnline(false);return observer.mutate(variables);
    }} as any;
    const flow=renderFlow({markDayComplete:mutation,queryClient:client,localDate:"2026-11-21"});
    let request!:Promise<void>;act(()=>{request=flow.result.current.handleSummaryDismiss();});
    void otherObserver.mutate({programDayId:"another-day"}).catch(()=>{});
    await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
    expect(client.getMutationCache().getAll()).toHaveLength(2);
    expect(client.getMutationCache().getAll()[0].state.isPaused).toBe(true);
    await act(async()=>{await vi.advanceTimersByTimeAsync(15000);await request;});
    expect(client.getMutationCache().getAll()).toHaveLength(1);
    onlineManager.setOnline(true);await client.resumePausedMutations();
    expect(send).not.toHaveBeenCalled();expect(otherSend).toHaveBeenCalledOnce();expect(setWorkoutCompleteMock).not.toHaveBeenCalled();client.clear();
  });

});
