import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TodayScreen } from "./TodayScreen";
import { useActivePrograms, useEntitlement, useProgramOverview } from "../../api/hooks";
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
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
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

  it("renders the no active program state", () => {
    sessionState = { userId: "user-1", activeProgramId: null as any };
    mockZustandSelector(useSessionStoreMock as any, sessionState);
    render(<TodayScreen />);
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
    expect(screen.getByText("Today's workout is done.")).toBeInTheDocument();
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

  it("renders loading state", () => {
    useProgramOverviewMock.mockReturnValue({ data: undefined, isLoading: true } as any);
    render(<TodayScreen />);
    expect(screen.getByText("Loading today's workout...")).toBeInTheDocument();
  });
});
