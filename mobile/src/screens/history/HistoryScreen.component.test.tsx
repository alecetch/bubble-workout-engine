import React from "react";
import { axe } from "jest-axe";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOutsideSessions, useDeleteOutsideSession } from "../../api/hooks/trainingSessionHooks";
import { HistoryScreen } from "./HistoryScreen";
import {
  useEntitlement,
  useHistoryPrograms,
  useHistoryTimeline,
  useLoggedExercisesSearch,
  usePhysiqueCheckIns,
  usePrsFeed,
  useSessionHistoryMetrics,
  useYearProgress,
} from "../../api/hooks";
import { normalizeYearProgress } from "../../api/yearProgress";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { mockZustandSelector, renderWithProviders } from "../../__test-utils__";

vi.unmock("@tanstack/react-query");
vi.mock("../../components/today/LogOutsideSessionSheet", () => ({
  LogOutsideSessionSheet: ({ onClose }: any) => <button onClick={onClose}>Outside session sheet</button>,
}));

vi.mock("../../api/hooks/trainingSessionHooks", () => ({
  outsideSessionsKey: ["outsideSessions"], useOutsideSessions: vi.fn(), useDeleteOutsideSession: vi.fn(),
}));


// React Native Web loads images outside the DOM; expose the native error callback
// on an img so fireEvent.error exercises the screen's fallback behavior.
vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  return {
    ...actual,
    Image: ({ source, onError }: { source: { uri: string }; onError?: () => void }) => (
      <img src={source.uri} onError={onError} alt="" />
    ),
  };
});

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
  useYearProgress: vi.fn(),
}));

vi.mock("../../state/session/sessionStore", () => ({
  useSessionStore: vi.fn(),
}));

vi.mock("../../state/onboarding/onboardingStore", () => ({
  useOnboardingStore: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress, style, accessibilityLabel }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()} style={style} aria-label={accessibilityLabel}>
      {children}
    </button>
  ),
}));

const useSessionHistoryMetricsMock = vi.mocked(useSessionHistoryMetrics);
const useYearProgressMock = vi.mocked(useYearProgress);
const yearFixture = normalizeYearProgress({ ok: true, year: 2026, count: 87, target: 200,
  today_local: "2026-11-03", window_start: "2026-01-01", window_end: "2026-12-31",
  pace_status: "ahead", pace_delta: 3.3, projected_year_end: 212, training_dates: ["2026-10-01"],
  years: [{ year: 2026, count: 87, target: 200, best_club: null }, { year: 2025, count: 214, target: 200, best_club: 200 }] });
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
  heroMediaUrl: null,
  highlight: { value: 120, exerciseName: "Back Squat", exerciseId: "squat" },
};

function renderScreen() {
  const rendered = renderWithProviders(<HistoryScreen />);
  ({ queryClient } = rendered);
  return rendered;
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
    vi.mocked(useOutsideSessions).mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() } as any);
    vi.mocked(useDeleteOutsideSession).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined) } as any);
    useYearProgressMock.mockReturnValue({ data: yearFixture, isLoading: false, isError: false, refetch: vi.fn() } as any);
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
  it("has no accessibility violations in the default render state", async () => {
    renderScreen();
    await act(async () => {});
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });


  it('renders "Training History" heading', () => {
    renderScreen();

    expect(screen.getByText("Training History")).toBeInTheDocument();
  });

  it("renders the yearly hero, pace and sessions mini stat without Day Streak", () => {
    renderScreen();

    expect(screen.getByText("Sessions Completed")).toBeInTheDocument();
    expect(screen.getByText("Training days in 2026")).toBeInTheDocument();
    expect(screen.getByText("3 ahead · on track for ~212")).toBeInTheDocument();
    expect(screen.queryByText(/Day Streak/i)).not.toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("87")).toBeInTheDocument();
  });

  it("switches years and redraws the hero and heatmap with the selected response", () => {
    const past = { ...yearFixture, year: 2025, count: 214, window_start: "2025-01-01", window_end: "2025-12-31", training_dates: ["2025-10-01"] };
    useYearProgressMock.mockImplementation(year => ({ data: year === 2025 ? past : yearFixture, refetch: vi.fn() } as any));
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Choose training year" }));
    fireEvent.click(screen.getByRole("button", { name: "View 2025 training year" }));
    expect(useYearProgressMock).toHaveBeenLastCalledWith(2025);
    expect(screen.getByText("Training days in 2025")).toBeInTheDocument();
    expect(within(screen.getByTestId("history-year-stat")).getByText("214")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "1 training day in 2025; best month October with 1" })).toBeInTheDocument();
    expect(screen.getByText("2025 · 214 · 200")).toBeInTheDocument();
  });

  it("falls back to sessions and independently retries a year-progress failure", () => {
    const retry = vi.fn();
    useYearProgressMock.mockReturnValue({ data: yearFixture, isError: true, refetch: retry } as any);
    renderScreen();
    const hero = within(screen.getByTestId("history-year-stat"));
    expect(hero.getByText("12")).toBeInTheDocument();
    expect(hero.getByText("Sessions Completed")).toBeInTheDocument();
    expect(screen.queryByText("87")).not.toBeInTheDocument();
    expect(screen.getByText("Timeline")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading training year" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("keeps history visible while the yearly hero loads", () => {
    useYearProgressMock.mockReturnValue({ data: undefined, isLoading: true, refetch: vi.fn() } as any);
    renderScreen();
    expect(within(screen.getByTestId("history-year-stat")).getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText("Timeline")).toBeInTheDocument();
    expect(screen.queryByTestId("year-heatmap")).not.toBeInTheDocument();
  });

  it("keeps the year choices during loading and never labels old data with the new year", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 3, 12));
    useYearProgressMock.mockImplementation(year => year === 2025
      ? ({ data: undefined, isLoading: true, refetch: vi.fn() } as any)
      : ({ data: yearFixture, refetch: vi.fn() } as any));
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Choose training year" }));
    fireEvent.click(screen.getByRole("button", { name: "View 2025 training year" }));
    expect(screen.getByText("Training days in 2025")).toBeInTheDocument();
    expect(screen.queryByText("87")).not.toBeInTheDocument();
    expect(screen.queryByTestId("year-heatmap")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose training year" }));
    fireEvent.click(screen.getByRole("button", { name: "View 2026 training year" }));
    expect(screen.getByText("87")).toBeInTheDocument();
  });

  it("keeps premium history for a cancelled but paid-through subscriber", () => {
    useEntitlementMock.mockReturnValue({ data: { subscription_status: "cancelled", is_active: true, is_premium: true }, isSuccess: true } as any);
    renderScreen();
    expect(screen.queryByText("PREMIUM")).not.toBeInTheDocument();
  });

  it("renders PR feed items", () => {
    renderScreen();

    expect(screen.getAllByText("Back Squat").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bench Press").length).toBeGreaterThan(0);
  });

  it("prefers hero card renditions for timeline and programs", () => {
    useHistoryTimelineMock.mockReturnValue({ data: { pages: [{ items: [{ ...timelineItem, heroMediaUrl: "https://cdn.test/original.png", heroMediaCardUrl: "https://cdn.test/day-card.webp", heroMediaThumbhash: "day-hash" }] }] } } as any);
    useHistoryProgramsMock.mockReturnValue({ data: [{ programId: "a", programTitle: "Strength", startDate: "2026-05-01", completionRatio: 1, heroMediaUrl: "https://cdn.test/original.png", heroMediaCardUrl: "https://cdn.test/program-card.webp", heroMediaThumbhash: "program-hash" }] } as any);
    const { container } = renderScreen();
    expect(container.querySelector('img[src="https://cdn.test/day-card.webp"]')).toHaveAttribute("data-thumbhash", "day-hash");
    expect(container.querySelector('img[src="https://cdn.test/day-card.webp"]')).toHaveAttribute("data-recycling-key", "https://cdn.test/day-card.webp");
    expect(container.querySelector('img[src="https://cdn.test/program-card.webp"]')).toHaveAttribute("data-thumbhash", "program-hash");
    fireEvent.error(container.querySelector('img[src="https://cdn.test/day-card.webp"]')!);
    expect(screen.getByText("No Media")).toBeInTheDocument();
  });

  it("renders timeline session entries", () => {
    renderScreen();

    expect(screen.getByText("Lower Body")).toBeInTheDocument();
    expect(screen.getByText("45 mins")).toBeInTheDocument();
  });

  it("renders timeline and program hero URLs instead of media IDs", () => {
    useHistoryTimelineMock.mockReturnValue({
      data: { pages: [{ items: [{ ...timelineItem, heroMediaId: "day-media-id", heroMediaUrl: "https://cdn.test/day.png" }] }] },
    } as any);
    useHistoryProgramsMock.mockReturnValue({
      data: [{ programId: "program-1", programTitle: "Strength", startDate: "2026-05-01", completionRatio: 1,
        heroMediaId: "program-media-id", heroMediaUrl: "https://cdn.test/program.png" }],
    } as any);
    const { container } = renderScreen();
    expect(Array.from(container.querySelectorAll("img")).map((image) => image.getAttribute("src")))
      .toEqual(expect.arrayContaining(["https://cdn.test/day.png", "https://cdn.test/program.png"]));
    expect(container.querySelector('img[src="day-media-id"]')).toBeNull();
    expect(container.querySelector('img[src="program-media-id"]')).toBeNull();
  });

  it("shows No Media when the hero URL is null even if the ID exists", () => {
    useHistoryTimelineMock.mockReturnValue({
      data: { pages: [{ items: [{ ...timelineItem, heroMediaId: "media-id", heroMediaUrl: null }] }] },
    } as any);
    renderScreen();
    expect(screen.getByText("No Media")).toBeInTheDocument();
  });

  it.each(["timeline", "program"])("replaces a failed %s hero with No Media and retries when its URL changes", async (kind) => {
    const setUrl = (url: string) => {
      if (kind === "timeline") {
        useHistoryTimelineMock.mockReturnValue({
          data: { pages: [{ items: [{ ...timelineItem, heroMediaUrl: url }] }] },
        } as any);
      } else {
        useHistoryTimelineMock.mockReturnValue({ data: { pages: [{ items: [] }] } } as any);
        useHistoryProgramsMock.mockReturnValue({
          data: [{ programId: "program-1", programTitle: "Strength", startDate: "2026-05-01",
            completionRatio: 1, heroMediaId: "media-id", heroMediaUrl: url }],
        } as any);
      }
    };
    setUrl("https://cdn.test/missing.png");
    const { container, rerender } = renderScreen();
    fireEvent.error(container.querySelector('img[src="https://cdn.test/missing.png"]')!);
    expect(screen.getByText("No Media")).toBeInTheDocument();
    expect(container.querySelector('img[src="https://cdn.test/missing.png"]')).toBeNull();

    setUrl("https://cdn.test/replacement.png");
    rerender(<HistoryScreen />);
    await waitFor(() => expect(container.querySelector('img[src="https://cdn.test/replacement.png"]')).not.toBeNull());
    expect(screen.queryByText("No Media")).not.toBeInTheDocument();
  });

  it("shows the Timeline section before the Programs and metrics sections", () => {
    const { container } = renderScreen();

    const content = container.textContent ?? "";
    const timelineIndex = content.indexOf("Timeline");
    const programsIndex = content.indexOf("Programs");
    const progressOverviewIndex = content.indexOf("Progress Overview");

    expect(timelineIndex).toBeGreaterThan(-1);
    expect(programsIndex).toBeGreaterThan(-1);
    expect(progressOverviewIndex).toBeGreaterThan(-1);
    expect(timelineIndex).toBeLessThan(programsIndex);
    expect(timelineIndex).toBeLessThan(progressOverviewIndex);
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
  it("lists outside sessions and deletes only after confirmation", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useDeleteOutsideSession).mockReturnValue({ mutateAsync: remove } as any);
    vi.mocked(useOutsideSessions).mockReturnValue({ data: [{ id: "outside-1", activity_type: "run", local_date: "2026-11-03", duration_min: 40 }] } as any);
    renderScreen();
    expect(screen.getByText("Run")).toBeInTheDocument();
    expect(screen.getByText(/2026-11-03.*40 minutes/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Log outside session"));
    expect(screen.getByText("Outside session sheet")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Outside session sheet"));
    fireEvent.click(screen.getByText("Delete"));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Cancel"));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByText("Delete session"));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("outside-1"));
    await waitFor(() => expect(screen.queryByText("Delete outside session?")).not.toBeInTheDocument());
  });

  it("retains the confirmation on a failed deletion and allows retry", async () => {
    const remove = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(undefined);
    vi.mocked(useDeleteOutsideSession).mockReturnValue({ mutateAsync: remove } as any);
    vi.mocked(useOutsideSessions).mockReturnValue({ data: [{ id: "outside-1", activity_type: "swim", local_date: "2026-11-02", duration_min: 45 }] } as any);
    renderScreen();
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByText("Delete session"));
    await screen.findByText("Offline");
    fireEvent.click(screen.getByText("Delete session"));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Delete outside session?")).not.toBeInTheDocument());
  });

  it("shows an outside-list error with retry while leaving logging available", () => {
    const retry = vi.fn();
    vi.mocked(useOutsideSessions).mockReturnValue({ isError: true, refetch: retry } as any);
    renderScreen();
    expect(screen.getByText("Unable to load outside sessions.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry outside sessions"));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByText("Log outside session")).toBeInTheDocument();
  });

  it("allows an expired user to log outside training while keeping program history locked", () => {
    useEntitlementMock.mockReturnValue({ data: { is_active: false, subscription_status: "expired" }, isSuccess: true } as any);
    renderScreen();
    expect(parentNavigateMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Sessions Completed")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Log outside session"));
    expect(screen.getByText("Outside session sheet")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Outside session sheet"));
    fireEvent.click(screen.getByText("Unlock program history"));
    expect(parentNavigateMock).toHaveBeenCalledWith("HomeTab", { screen: "Paywall" });
  });

});
