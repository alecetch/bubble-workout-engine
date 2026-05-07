import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryScreen } from "./HistoryScreen";
import {
  useEntitlement,
  useHistoryPrograms,
  useHistoryTimeline,
  useLoggedExercisesSearch,
  usePhysiqueCheckIns,
  usePrsFeed,
  useSessionHistoryMetrics,
} from "../../api/hooks";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { mockZustandSelector, renderWithProviders } from "../../__test-utils__";

vi.unmock("@tanstack/react-query");

const navigationNavigateMock = vi.fn();
const parentNavigateMock = vi.fn();

vi.mock("@react-navigation/native", async () => {
  const ReactActual = await import("react");
  return {
    useNavigation: () => ({
      navigate: navigationNavigateMock,
      getParent: () => ({ navigate: parentNavigateMock }),
    }),
    useFocusEffect: (cb: () => void) => {
      ReactActual.useEffect(() => cb(), [cb]);
    },
  };
});

vi.mock("../../api/hooks", () => ({
  queryKeys: {
    historyTimeline: ["historyTimeline"],
  },
  useSessionHistoryMetrics: vi.fn(),
  usePrsFeed: vi.fn(),
  useHistoryPrograms: vi.fn(),
  useHistoryTimeline: vi.fn(),
  usePhysiqueCheckIns: vi.fn(),
  useEntitlement: vi.fn(),
  useLoggedExercisesSearch: vi.fn(),
}));

vi.mock("../../state/session/sessionStore", () => ({
  useSessionStore: vi.fn(),
}));

vi.mock("../../state/onboarding/onboardingStore", () => ({
  useOnboardingStore: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress, style }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()} style={style}>
      {children}
    </button>
  ),
}));

const useSessionHistoryMetricsMock = vi.mocked(useSessionHistoryMetrics);
const usePrsFeedMock = vi.mocked(usePrsFeed);
const useHistoryProgramsMock = vi.mocked(useHistoryPrograms);
const useHistoryTimelineMock = vi.mocked(useHistoryTimeline);
const usePhysiqueCheckInsMock = vi.mocked(usePhysiqueCheckIns);
const useEntitlementMock = vi.mocked(useEntitlement);
const useLoggedExercisesSearchMock = vi.mocked(useLoggedExercisesSearch);
const useSessionStoreMock = vi.mocked(useSessionStore);
const useOnboardingStoreMock = vi.mocked(useOnboardingStore);

let queryClient: QueryClient;

const metricsFixture = {
  sessionsCount: 12,
  dayStreak: 5,
  programmesCompleted: 2,
  consistency28d: { completed: 8, scheduled: 10, rate: 0.8 },
  volume28d: 5000,
  strengthUpper28d: { exerciseId: "bench", exerciseName: "Bench Press", bestE1rmKg: 100, trendPct: 0.05 },
  strengthLower28d: { exerciseId: "squat", exerciseName: "Back Squat", bestE1rmKg: 120, trendPct: 0.04 },
  sessionsCount28d: 8,
  weeklyVolumeByRegion8w: { upper: [], lower: [], full: [] },
};

const timelineItem = {
  programDayId: "day-1",
  scheduledDate: "2026-05-01",
  dayLabel: "Lower Body",
  durationMins: 45,
  heroMediaId: null,
  highlight: { value: 120, exerciseName: "Back Squat", exerciseId: "squat" },
};

function renderScreen() {
  ({ queryClient } = renderWithProviders(<HistoryScreen />));
}

function setAllHooksLoading() {
  const loading = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
  useSessionHistoryMetricsMock.mockReturnValue(loading as any);
  usePrsFeedMock.mockReturnValue(loading as any);
  useHistoryProgramsMock.mockReturnValue(loading as any);
  useHistoryTimelineMock.mockReturnValue({
    ...loading,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  } as any);
  usePhysiqueCheckInsMock.mockReturnValue(loading as any);
  useEntitlementMock.mockReturnValue(loading as any);
  useLoggedExercisesSearchMock.mockReturnValue({ data: [], isLoading: true } as any);
}

describe("HistoryScreen", () => {
  beforeEach(() => {
    navigationNavigateMock.mockReset();
    parentNavigateMock.mockReset();
    mockZustandSelector(useSessionStoreMock as any, { userId: "user-1" });
    mockZustandSelector(useOnboardingStoreMock as any, { userId: "onboard-user" });
    useSessionHistoryMetricsMock.mockReturnValue({
      data: metricsFixture,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
    usePrsFeedMock.mockReturnValue({
      data: {
        mode: "prs_28d",
        rows: [
          {
            exerciseId: "squat",
            exerciseName: "Back Squat",
            weightKg: 100,
            repsCompleted: 5,
            estimatedE1rmKg: 120,
            date: "2026-05-01",
          },
          {
            exerciseId: "bench",
            exerciseName: "Bench Press",
            weightKg: 80,
            repsCompleted: 5,
            estimatedE1rmKg: 90,
            date: "2026-05-02",
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
    useHistoryProgramsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
    useHistoryTimelineMock.mockReturnValue({
      data: { pages: [{ items: [timelineItem], nextCursor: null }] },
      isLoading: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    } as any);
    usePhysiqueCheckInsMock.mockReturnValue({
      data: { check_ins: [] },
      isLoading: false,
      isError: false,
    } as any);
    useEntitlementMock.mockReturnValue({
      data: { is_active: true, subscription_status: "active" },
      isLoading: false,
      isError: false,
      isSuccess: true,
    } as any);
    useLoggedExercisesSearchMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as any);
  });

  afterEach(() => {
    queryClient?.clear();
    vi.useRealTimers();
  });

  it('renders "Training History" heading', () => {
    renderScreen();

    expect(screen.getByText("Training History")).toBeInTheDocument();
  });

  it("renders sessions-completed and streak stats", () => {
    renderScreen();

    expect(screen.getByText("Sessions Completed")).toBeInTheDocument();
    expect(screen.getByText("Day Streak")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders PR feed items", () => {
    renderScreen();

    expect(screen.getAllByText("Back Squat").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bench Press").length).toBeGreaterThan(0);
  });

  it("renders timeline session entries", () => {
    renderScreen();

    expect(screen.getByText("Lower Body")).toBeInTheDocument();
    expect(screen.getByText("45 mins")).toBeInTheDocument();
  });

  it("navigates to ExerciseTrend on exercise search result tap", async () => {
    useLoggedExercisesSearchMock.mockImplementation((term: string) => ({
      data: term === "Deadlift" ? [{ exerciseId: "ex-1", exerciseName: "Deadlift" }] : [],
      isLoading: false,
      isError: false,
    }) as any);

    renderScreen();

    fireEvent.change(screen.getByPlaceholderText("Search exercises"), { target: { value: "Deadlift" } });

    expect(await screen.findByText("Deadlift")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Deadlift"));

    expect(navigationNavigateMock).toHaveBeenCalledWith("ExerciseTrend", {
      exerciseId: "ex-1",
      exerciseName: "Deadlift",
    });
  });

  it("renders without crash while all hooks are loading", () => {
    setAllHooksLoading();

    renderScreen();

    expect(screen.getByText("Loading history...")).toBeInTheDocument();
    expect(screen.queryByText("Unable to load history")).not.toBeInTheDocument();
  });

  it("shows error state when history timeline fails", () => {
    useSessionHistoryMetricsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);
    useHistoryTimelineMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    } as any);

    renderScreen();

    expect(screen.getByText("Unable to load history")).toBeInTheDocument();
  });
});
