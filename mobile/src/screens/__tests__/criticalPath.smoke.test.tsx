import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TodayScreen } from "../today/TodayScreen";
import { SegmentCard } from "../../components/program/SegmentCard";
import {
  useActivePrograms,
  useEntitlement,
  useProgramOverview,
  useSaveSegmentLogs,
  useSegmentExerciseLogs,
} from "../../api/hooks";
import { useSessionStore } from "../../state/session/sessionStore";
import { useTimerStore } from "../../state/timer/useTimerStore";
import { getDayStatus } from "../../utils/localWorkoutLog";
import { buildExercise, buildSegment, mockZustandSelector } from "../../__test-utils__";

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
  useSaveSegmentLogs: vi.fn(),
  useSegmentExerciseLogs: vi.fn(),
}));

vi.mock("../../state/session/sessionStore", () => ({
  useSessionStore: vi.fn(),
}));

vi.mock("../../state/timer/useTimerStore", () => ({
  useTimerStore: vi.fn(),
}));

vi.mock("../../utils/localWorkoutLog", () => ({
  getDayStatus: vi.fn(),
  getExerciseComplete: vi.fn().mockResolvedValue(false),
  setExerciseComplete: vi.fn().mockResolvedValue(undefined),
  allExercisesComplete: vi.fn().mockResolvedValue(true),
  getWorkoutComplete: vi.fn().mockResolvedValue(false),
  getSegmentLog: vi.fn().mockResolvedValue(null),
  setSegmentLog: vi.fn().mockResolvedValue(undefined),
  setWorkoutComplete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const useProgramOverviewMock = vi.mocked(useProgramOverview);
const useActiveProgramsMock = vi.mocked(useActivePrograms);
const useEntitlementMock = vi.mocked(useEntitlement);
const useSaveSegmentLogsMock = vi.mocked(useSaveSegmentLogs);
const useSegmentExerciseLogsMock = vi.mocked(useSegmentExerciseLogs);
const useSessionStoreMock = vi.mocked(useSessionStore);
const useTimerStoreMock = vi.mocked(useTimerStore);
const getDayStatusMock = vi.mocked(getDayStatus);

let sessionState = { userId: "user-1", activeProgramId: "prog-1" };
const saveLogsMock = vi.fn().mockResolvedValue({ saved: 3, prs: [] });
const initEntryMock = vi.fn();
const startRestMock = vi.fn();

function overview(calendarDays: any[], selectedDayPreview: any = undefined) {
  return {
    program: { id: "prog-1", title: "Strength Block" },
    weeks: [{ weekNumber: 1 }],
    calendarDays,
    selectedDayPreview,
  };
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function mockScheduledToday(isActive = true): void {
  useEntitlementMock.mockReturnValue({ data: { is_active: isActive } } as any);
  useProgramOverviewMock.mockReturnValue({
    data: overview(
      [{ calendarDate: "2026-05-01", isTrainingDay: true, programDayId: "day-1", weekNumber: 1 }],
      { programDayId: "day-1", label: "Lower Body", type: "strength", sessionDuration: 45 },
    ),
    isLoading: false,
    isError: false,
    error: null,
  } as any);
}

describe("critical path smoke", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
    navigationMocks.navigate.mockReset();
    saveLogsMock.mockClear();
    initEntryMock.mockClear();
    startRestMock.mockClear();

    sessionState = { userId: "user-1", activeProgramId: "prog-1" };
    mockZustandSelector(useSessionStoreMock as any, sessionState);
    mockZustandSelector(useTimerStoreMock as any, {
      entries: {},
      initEntry: initEntryMock,
      startRest: startRestMock,
      stopRest: vi.fn(),
    });

    useActiveProgramsMock.mockReturnValue({ data: undefined, isLoading: false } as any);
    useEntitlementMock.mockReturnValue({ data: { is_active: true } } as any);
    useProgramOverviewMock.mockReturnValue({
      data: overview([]),
      isLoading: false,
      isError: false,
      error: null,
    } as any);
    useSegmentExerciseLogsMock.mockReturnValue({ data: [], isLoading: false } as any);
    useSaveSegmentLogsMock.mockReturnValue({
      mutateAsync: saveLogsMock,
      isPending: false,
      isError: false,
    } as any);
    getDayStatusMock.mockResolvedValue("scheduled");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("navigates from today's scheduled workout to ProgramDay with the exact programDayId", async () => {
    mockScheduledToday(true);

    render(<TodayScreen />);
    await flushEffects();

    fireEvent.click(screen.getByText("Start Workout"));

    expect(navigationMocks.navigate).toHaveBeenCalledWith("ProgramsTab", {
      screen: "ProgramDay",
      params: { programDayId: "day-1" },
    });
  });

  it("redirects Start Workout to the Paywall when subscription is inactive", async () => {
    mockScheduledToday(false);

    render(<TodayScreen />);
    await flushEffects();

    fireEvent.click(screen.getByText("Start Workout"));

    expect(navigationMocks.navigate).toHaveBeenCalledWith("HomeTab", { screen: "Paywall" });
    expect(navigationMocks.navigate).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ screen: "ProgramDay" }),
    );
  });

  it("navigates to Program Review when no active program exists", () => {
    sessionState = { userId: "user-1", activeProgramId: null as any };
    mockZustandSelector(useSessionStoreMock as any, sessionState);
    useActiveProgramsMock.mockReturnValue({ data: undefined, isLoading: false } as any);

    render(<TodayScreen />);

    expect(screen.getByText("No Active Program")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Go To Program Review"));

    expect(navigationMocks.navigate).toHaveBeenCalledWith("HomeTab", { screen: "ProgramReview" });
  });

  it("logs workout rows through SegmentCard's save mutation path", async () => {
    vi.useRealTimers();
    const onAllSetsSaved = vi.fn();
    const segment = buildSegment(
      { id: "seg-1", segmentName: "Main Strength" },
      [
        buildExercise({
          id: "ex-1",
          exerciseId: "back-squat",
          name: "Back Squat",
          sets: 3,
          reps: "8",
          repsUnit: "reps",
          isLoadable: true,
          restSeconds: 90,
        }),
      ],
    );

    render(
      <SegmentCard
        segment={segment}
        isLogged={false}
        programId="prog-1"
        programDayId="day-1"
        userId="user-1"
        onViewExerciseDetail={vi.fn()}
        onAllSetsSaved={onAllSetsSaved}
      />,
    );

    fireEvent.click(screen.getByText("Start Exercise"));
    const inputs = await screen.findAllByPlaceholderText("0");
    fireEvent.change(inputs[0], { target: { value: "60" } });
    fireEvent.change(inputs[1], { target: { value: "8" } });
    fireEvent.click(screen.getByText("Log all sets as complete"));

    await waitFor(() => expect(saveLogsMock).toHaveBeenCalledTimes(1));
    expect(saveLogsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        programId: "prog-1",
        programDayId: "day-1",
        workoutSegmentId: "seg-1",
        rows: expect.arrayContaining([
          expect.objectContaining({
            programExerciseId: "ex-1",
            weightKg: 60,
            repsCompleted: 8,
          }),
        ]),
      }),
    );
  });
});
