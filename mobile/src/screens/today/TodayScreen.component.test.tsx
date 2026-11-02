import React from "react";
import { axe } from "jest-axe";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TodayScreen } from "./TodayScreen";
import { useYearProgress, useActivePrograms, useEntitlement, useProgramOverview } from "../../api/hooks";
import { useSessionStore } from "../../state/session/sessionStore";
import { getDayStatus } from "../../utils/localWorkoutLog";
import { mockZustandSelector } from "../../__test-utils__";

const navigationMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

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
  });

  async function flushEffects(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }
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

  it.each([["behind", -2, "#3B82F6", "You're 2 behind. A bonus session today closes the gap."],
    ["ahead", 3, "#1E293B", "You're ahead. Rest is training too."],
    ["on_pace", 0, "#1E293B", "On pace. Rest is training too."]])("emphasises bonus workouts for %s pace", (pace_status, pace_delta, background, copy) => {
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
});
