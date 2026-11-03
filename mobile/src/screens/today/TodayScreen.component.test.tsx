import React from "react";
import { axe } from "jest-axe";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { TodayScreen } from "./TodayScreen";
import { claimYearMilestone, markYearMilestoneSeen } from "../../api/yearProgress";
import { useYearProgress, useActivePrograms, useEntitlement, useProgramOverview } from "../../api/hooks";
import { useSessionStore } from "../../state/session/sessionStore";
import { getDayStatus } from "../../utils/localWorkoutLog";
import { mockZustandSelector } from "../../__test-utils__";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }));
vi.mock("../../components/today/LogOutsideSessionSheet", () => ({
  LogOutsideSessionSheet: ({ onClose }: any) => <button onClick={onClose}>Outside session sheet</button>,
}));

const navigationMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));
vi.mock("../../api/yearProgress", () => ({ claimYearMilestone: vi.fn(), markYearMilestoneSeen: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@react-navigation/native", async () => {
  const ReactActual = await import("react");
  return {
    useNavigation: () => ({ navigate: navigationMocks.navigate }),
    useFocusEffect: (cb: () => void) => {
      ReactActual.useEffect(() => cb(), [cb]);
    },
  };
});

vi.mock("../../api/hooks", () => ({
  queryKeys: { yearProgress: ["yearProgress"] },
  useYearProgress: vi.fn(),
  useActivePrograms: vi.fn(),
  useEntitlement: vi.fn(),
  useProgramOverview: vi.fn(),
}));

vi.mock("../../state/session/sessionStore", () => ({
  useSessionStore: vi.fn(),
}));

vi.mock("../../utils/localWorkoutLog", () => ({
  getDayStatus: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress, style }: any) => (
    <button type="button" data-background={style?.backgroundColor} aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const useProgramOverviewMock = vi.mocked(useProgramOverview);
const useActiveProgramsMock = vi.mocked(useActivePrograms);
const useEntitlementMock = vi.mocked(useEntitlement);
const useSessionStoreMock = vi.mocked(useSessionStore);
const getDayStatusMock = vi.mocked(getDayStatus);

let sessionState = { userId: "user-1", activeProgramId: "prog-1" };

function overview(calendarDays: any[], selectedDayPreview: any = undefined) {
  return {
    program: { id: "prog-1", title: "Strength Block" },
    weeks: [{ weekNumber: 1 }],
    calendarDays,
    selectedDayPreview,
  };
}

describe("TodayScreen", () => {
  beforeEach(() => {
    vi.spyOn(AppState, "addEventListener").mockReturnValue({ remove: vi.fn() });
    storage.clear();
    vi.mocked(AsyncStorage.getItem).mockReset().mockImplementation(async key => storage.get(key) ?? null);
    vi.mocked(AsyncStorage.setItem).mockReset().mockImplementation(async (key, value) => { storage.set(key, value); });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
    navigationMocks.navigate.mockReset();
    sessionState = { userId: "user-1", activeProgramId: "prog-1" };
    mockZustandSelector(useSessionStoreMock as any, sessionState);
    vi.mocked(useYearProgress).mockReturnValue({ data: { ok: true, year: 2026, count: 88, target: 200, pace_status: "ahead", pace_delta: 3, projected_year_end: 212, pro_rated: false }, refetch: vi.fn() } as any);
    useActiveProgramsMock.mockReturnValue({ data: undefined, isLoading: false } as any);
    useEntitlementMock.mockReturnValue({ data: { is_active: true } } as any);
    useProgramOverviewMock.mockReturnValue({
      data: overview([]),
      isLoading: false,
      isError: false,
      error: null,
    } as any);
    getDayStatusMock.mockResolvedValue("scheduled");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function flushEffects(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }
  it("claims the highest unseen milestone once and acknowledges the whole group on dismissal", async () => {
    const milestone = { id: "day100", slug: "day_100", threshold: 100, year: 2026 };
    const older = { id: "day50", slug: "day_50", threshold: 50, year: 2026 };
    vi.mocked(useYearProgress).mockReturnValue({ data: { ok: true, year: 2026, target: 200,
      unseen_milestones: [older, milestone] }, refetch: vi.fn() } as any);
    vi.mocked(claimYearMilestone).mockClear();
    vi.mocked(claimYearMilestone).mockResolvedValue({ milestone, coalesced_ids: [older.id] });
    const view = render(<TodayScreen />);
    await flushEffects();
    expect(screen.getByText("Day 100. Half way to 200.")).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Let's go" })); });
    expect(markYearMilestoneSeen).toHaveBeenCalledWith("day100");
    expect(markYearMilestoneSeen).toHaveBeenCalledWith("day50");
    view.rerender(<TodayScreen />);
    await flushEffects();
    expect(screen.queryByText("Day 100. Half way to 200.")).not.toBeInTheDocument();
    expect(claimYearMilestone).toHaveBeenCalledTimes(1);
  });
  it("has no accessibility violations in the default render state", async () => {
    vi.useRealTimers();
    render(<TodayScreen />);
    await act(async () => {});
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });


  it("renders the no active program state", () => {
    sessionState = { userId: "user-1", activeProgramId: null as any };
    mockZustandSelector(useSessionStoreMock as any, sessionState);
    render(<TodayScreen />);
    expect(screen.queryByText("of 200")).not.toBeInTheDocument();
    expect(screen.getByText("No Active Program")).toBeInTheDocument();
    expect(screen.getByText("Go To Program Review")).toBeInTheDocument();
  });

  it("renders today's training day", async () => {
    useProgramOverviewMock.mockReturnValue({
      data: overview(
        [{ calendarDate: "2026-05-01", isTrainingDay: true, programDayId: "day-1", weekNumber: 1 }],
        { programDayId: "day-1", label: "Lower Body", type: "strength", sessionDuration: 45 },
      ),
      isLoading: false,
      isError: false,
    } as any);
    render(<TodayScreen />);
    await flushEffects();
    expect(screen.getByText("Start Workout")).toBeInTheDocument();
    expect(screen.getByText("Lower Body")).toBeInTheDocument();
    expect(screen.getByText("of 200").compareDocumentPosition(screen.getByText("Week 1 of 1")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /88 of 200 training days/ }));
    expect(navigationMocks.navigate).toHaveBeenCalledWith("HistoryTab");
  });

  it("renders a resume action for a started workout", async () => {
    getDayStatusMock.mockResolvedValue("started");
    useProgramOverviewMock.mockReturnValue({
      data: overview(
        [{ calendarDate: "2026-05-01", isTrainingDay: true, programDayId: "day-1", weekNumber: 1 }],
        { programDayId: "day-1", label: "Lower Body", type: "strength", sessionDuration: 45 },
      ),
      isLoading: false,
      isError: false,
    } as any);
    render(<TodayScreen />);
    await flushEffects();
    expect(screen.getByText("Resume Workout")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Resume Workout"));
    expect(navigationMocks.navigate).toHaveBeenCalledWith("ProgramsTab", {
      screen: "ProgramDay",
      params: { programDayId: "day-1" },
    });
  });

  it("renders today's rest day", () => {
    useProgramOverviewMock.mockReturnValue({
      data: overview([{ calendarDate: "2026-05-01", isTrainingDay: false, weekNumber: 1 }]),
      isLoading: false,
      isError: false,
    } as any);
    render(<TodayScreen />);
    expect(screen.getByText("Rest day.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Trained elsewhere today? Log it"));
    expect(screen.getByText("Outside session sheet")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Outside session sheet"));
    expect(screen.queryByText("Outside session sheet")).not.toBeInTheDocument();
  });

  it("renders today's complete state", async () => {
    getDayStatusMock.mockResolvedValue("complete");
    useProgramOverviewMock.mockReturnValue({
      data: overview([{ calendarDate: "2026-05-01", isTrainingDay: true, programDayId: "day-1", weekNumber: 1 }]),
      isLoading: false,
      isError: false,
    } as any);
    render(<TodayScreen />);
    await flushEffects();
    expect(screen.getByText("Day 88 is in.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Trained elsewhere today? Log it"));
    expect(screen.getByText("Outside session sheet")).toBeInTheDocument();
  });

  it("waits until the outside sheet closes before claiming its new milestone", async () => {
    useProgramOverviewMock.mockReturnValue({ data: overview([{ calendarDate: "2026-05-01", isTrainingDay: false, weekNumber: 1 }]) } as any);
    vi.mocked(claimYearMilestone).mockClear();
    const view = render(<TodayScreen />);
    fireEvent.click(screen.getByText("Trained elsewhere today? Log it"));
    const earned = { id: "outside-day1", slug: "day_1", threshold: 1, year: 2026 };
    vi.mocked(useYearProgress).mockReturnValue({ data: { ok: true, year: 2026, count: 1, target: 200, unseen_milestones: [earned] } } as any);
    vi.mocked(claimYearMilestone).mockResolvedValue({ milestone: earned, coalesced_ids: [] });
    view.rerender(<TodayScreen />);
    await flushEffects();
    expect(claimYearMilestone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Outside session sheet"));
    await flushEffects();
    expect(claimYearMilestone).toHaveBeenCalledWith(2026);
    expect(screen.getByText("Day 1. The year starts here.")).toBeInTheDocument();
  });

  it("does not render a missed-session warning on the Today screen", () => {
    useProgramOverviewMock.mockReturnValue({
      data: overview([
        { calendarDate: "2026-04-27", isTrainingDay: true, programDayId: "day-1", weekNumber: 1 },
        { calendarDate: "2026-04-28", isTrainingDay: true, programDayId: "day-2", weekNumber: 1 },
        { calendarDate: "2026-04-29", isTrainingDay: true, programDayId: "day-3", weekNumber: 1 },
        { calendarDate: "2026-05-01", isTrainingDay: false, weekNumber: 1 },
      ]),
      isLoading: false,
      isError: false,
    } as any);
    render(<TodayScreen />);
    expect(screen.queryByText(/sessions missed/i)).not.toBeInTheDocument();
  });

  it("renders the program complete state", async () => {
    getDayStatusMock.mockResolvedValue("complete");
    useProgramOverviewMock.mockReturnValue({
      data: overview([{ calendarDate: "2026-04-30", isTrainingDay: true, programDayId: "day-1", weekNumber: 1 }]),
      isLoading: false,
      isError: false,
    } as any);
    render(<TodayScreen />);
    await flushEffects();
    expect(screen.getByText("Program complete!")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Generate New Program"));
    expect(navigationMocks.navigate).toHaveBeenCalledWith("HomeTab", { screen: "ProgramReview" });
  });

  it.each([["behind", -2, "#3B82F6", "You're 2 behind. A bonus session today makes it 1."],
    ["behind", -80, "#3B82F6", "You're 80 behind. A bonus session today makes it 79."],
    ["ahead", 3, "#1E293B", "You're ahead. Rest is training too."],
    ["on_pace", -1, "#1E293B", "On pace. Rest is training too."]])("emphasises bonus workouts for %s pace", (pace_status, pace_delta, background, copy) => {
    vi.mocked(useYearProgress).mockReturnValue({ data: { ok: true, year: 2026, count: 88, target: 200, pace_status, pace_delta, projected_year_end: 200 }, refetch: vi.fn() } as any);
    render(<TodayScreen />);
    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a bonus workout today" })).toHaveAttribute("data-background", background);
  });

  it("keeps the workout usable when year progress fails and retries independently", async () => {
    const refetch = vi.fn();
    vi.mocked(useYearProgress).mockReturnValue({ isError: true, refetch } as any);
    useProgramOverviewMock.mockReturnValue({ data: overview([{ calendarDate: "2026-05-01", isTrainingDay: true, programDayId: "day-1" }]) } as any);
    render(<TodayScreen />);
    await flushEffects();
    expect(screen.getByText("Start Workout")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading your year" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("renders loading state", () => {
    useProgramOverviewMock.mockReturnValue({ data: undefined, isLoading: true } as any);
    render(<TodayScreen />);
    expect(screen.getByText("Loading today's workout...")).toBeInTheDocument();
  });

  it("renders error state when program overview fetch fails", () => {
    useProgramOverviewMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Network error"),
      refetch: vi.fn(),
    } as any);

    render(<TodayScreen />);

    expect(screen.getByText("Today Is Unavailable")).toBeInTheDocument();
    expect(screen.getByText("Network error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Programs" })).toBeInTheDocument();
  });
  it.each([27, 28])("shows the recap banner only from local December 28 (day %s)", async day => {
    vi.setSystemTime(new Date(2026, 11, day, 12));
    render(<TodayScreen />); await flushEffects();
    if (day === 28) {
      fireEvent.click(screen.getByText("Your 2026 recap is ready"));
      expect(navigationMocks.navigate).toHaveBeenCalledWith("HistoryTab", { screen: "YearRecap", params: { year: 2026 } });
    } else expect(screen.queryByText("Your 2026 recap is ready")).not.toBeInTheDocument();
  });
  it("remembers recap dismissal on another open in the same year", async () => {
    vi.setSystemTime(new Date(2026, 11, 28, 12));
    const view = render(<TodayScreen />); await flushEffects();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss 2026 recap banner" })); await flushEffects();
    expect(screen.queryByText("Your 2026 recap is ready")).not.toBeInTheDocument();
    view.unmount(); render(<TodayScreen />); await flushEffects();
    expect(screen.queryByText("Your 2026 recap is ready")).not.toBeInTheDocument();
  });
  it("shows the January reset once and rolls the year card over to zero", async () => {
    vi.setSystemTime(new Date(2027, 0, 1, 12));
    vi.mocked(useYearProgress).mockReturnValue({ data: { ok: true, year: 2027, today_local: "2027-01-01", count: 0, target: 200,
      pace_status: "on_pace", pace_delta: 0, projected_year_end: 0, years: [{ year: 2026, count: 214, best_club: 200 }] } } as any);
    const view = render(<TodayScreen />); await flushEffects();
    expect(screen.getByText("2027 starts now. Last year: 214. Day 1 is today.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /0 of 200 training days this year/ })).toBeInTheDocument();
    fireEvent.click(screen.getByText("See your 2026 recap"));
    expect(navigationMocks.navigate).toHaveBeenCalledWith("HistoryTab", { screen: "YearRecap", params: { year: 2026 } });
    view.unmount(); render(<TodayScreen />); await flushEffects();
    expect(screen.queryByText(/2027 starts now/)).not.toBeInTheDocument();
  });
  it("refreshes the local year and reset when the app resumes across midnight", async () => {
    vi.setSystemTime(new Date(2026, 11, 31, 23, 50));
    render(<TodayScreen />); await flushEffects();
    vi.setSystemTime(new Date(2027, 0, 1, 0, 10));
    vi.mocked(useYearProgress).mockReturnValue({ data: { ok: true, year: 2027, count: 0, target: 200, pace_status: "on_pace", pace_delta: 0,
      years: [{ year: 2026, count: 214, best_club: 200 }] } } as any);
    await act(async () => { vi.mocked(AppState.addEventListener).mock.calls.at(-1)![1]("active"); });
    await flushEffects();
    expect(screen.getByText("2027 starts now. Last year: 214. Day 1 is today.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /0 of 200 training days this year/ })).toBeInTheDocument();
    expect(screen.queryByText("Your 2026 recap is ready")).not.toBeInTheDocument();
  });
  it.each([{ day: 1, count: 0 }, { day: 15, count: 214 }])("does not show a January card outside its audience/window ($day, $count)", async ({ day, count }) => {
    vi.setSystemTime(new Date(2027, 0, day, 12));
    vi.mocked(useYearProgress).mockReturnValue({ data: { ok: true, year: 2027, count: 0, target: 200, pace_status: "on_pace", pace_delta: 0,
      years: [{ year: 2026, count }] } } as any);
    render(<TodayScreen />); await flushEffects();
    expect(screen.queryByText(/2027 starts now/)).not.toBeInTheDocument();
  });

});
