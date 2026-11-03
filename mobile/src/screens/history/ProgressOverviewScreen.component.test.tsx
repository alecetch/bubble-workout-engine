import React from "react";
import { axe } from "jest-axe";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionHistoryMetrics, useYearProgress } from "../../api/hooks";
import { useSessionStore } from "../../state/session/sessionStore";
import { ProgressOverviewScreen } from "./ProgressOverviewScreen";
import { mockZustandSelector } from "../../__test-utils__";

vi.mock("../../api/hooks", () => ({
  useSessionHistoryMetrics: vi.fn(),
  useYearProgress: vi.fn(),
}));

vi.mock("../../state/session/sessionStore", () => ({
  useSessionStore: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const METRICS_FIXTURE = {
  dayStreak: 7,
  sessionsCount28d: 10,
  consistency28d: { rate: 0.83 },
  weeklyVolumeByRegion8w: {
    full: [{ weekStart: "2025-01-06", volumeLoad: 12000 }],
    upper: [{ weekStart: "2025-01-06", volumeLoad: 6000 }],
    lower: [{ weekStart: "2025-01-06", volumeLoad: 6000 }],
  },
  strengthUpper28d: {
    exerciseId: "ex-bench",
    exerciseName: "Bench Press",
    bestE1rmKg: 100,
    trendPct: 2.5,
  },
  strengthLower28d: {
    exerciseId: "ex-squat",
    exerciseName: "Back Squat",
    bestE1rmKg: 140,
    trendPct: -1.0,
  },
};

const mockNavigate = vi.fn();
const mockRefetch = vi.fn();
const useSessionHistoryMetricsMock = vi.mocked(useSessionHistoryMetrics);
const useSessionStoreMock = vi.mocked(useSessionStore);

function renderScreen() {
  render(
    <ProgressOverviewScreen
      route={{} as any}
      navigation={{ navigate: mockNavigate, goBack: vi.fn(), setOptions: vi.fn() } as any}
    />,
  );
}

describe("ProgressOverviewScreen", () => {
  beforeEach(() => {
    vi.mocked(useYearProgress).mockReturnValue({ data: { ok: true, count: 87, target: 200 }, isLoading: false, refetch: vi.fn() } as any);
    mockNavigate.mockReset();
    mockRefetch.mockReset();
    mockZustandSelector(useSessionStoreMock as any, { userId: "user-123" });
    useSessionHistoryMetricsMock.mockReturnValue({
      data: METRICS_FIXTURE,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    } as any);
  });
  it("has no accessibility violations in the default render state", async () => {
    renderScreen();
    await act(async () => {});
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });


  it("shows loading indicator when isLoading is true", () => {
    useSessionHistoryMetricsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: mockRefetch,
    } as any);

    renderScreen();

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText("Unable to load progress overview")).not.toBeInTheDocument();
  });

  it("shows error state and Retry button when isError is true; Retry calls refetch", () => {
    useSessionHistoryMetricsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    } as any);

    renderScreen();

    expect(screen.getByText("Unable to load progress overview")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("shows empty state when all volume data arrays are empty", () => {
    useSessionHistoryMetricsMock.mockReturnValue({
      data: {
        ...METRICS_FIXTURE,
        weeklyVolumeByRegion8w: { full: [], upper: [], lower: [] },
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    } as any);

    renderScreen();

    expect(screen.getByText("No volume data for this region yet.")).toBeInTheDocument();
  });

  it("renders days this year, session count, and consistency without day streak", () => {
    renderScreen();

    expect(screen.getByText("Days this year")).toBeInTheDocument();
    expect(screen.getByText("of 200")).toBeInTheDocument();
    expect(screen.queryByText(/Day streak/i)).not.toBeInTheDocument();
    expect(screen.getByText("Sessions (28d)")).toBeInTheDocument();
    expect(screen.getByText("Consistency")).toBeInTheDocument();
    expect(screen.getByText("87")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("83%")).toBeInTheDocument();
  });

  it("uses the pro-rated target and retries year errors without blocking volume data", () => {
    const retry = vi.fn();
    vi.mocked(useYearProgress).mockReturnValue({ data: { ok: true, count: 24, target: 50 }, refetch: retry } as any);
    const view = render(<ProgressOverviewScreen navigation={{} as any} route={{} as any} />);
    expect(screen.getByText("of 50")).toBeInTheDocument();
    vi.mocked(useYearProgress).mockReturnValue({ data: undefined, isError: true, refetch: retry } as any);
    view.rerender(<ProgressOverviewScreen navigation={{} as any} route={{} as any} />);
    expect(screen.getByText("Days this year")).toBeInTheDocument();
    expect(screen.getByText("Sessions (28d)")).toBeInTheDocument();
    expect(screen.queryByText("24")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading training year" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("does not invent a zero while year progress loads", () => {
    vi.mocked(useYearProgress).mockReturnValue({ data: undefined, isLoading: true, refetch: vi.fn() } as any);
    renderScreen();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText("Days this year")).toBeInTheDocument();
    expect(screen.queryByText("of 200")).not.toBeInTheDocument();
  });

  it("region pills update the active region without error", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Lower" }));
    expect(screen.getByText("Progress Overview")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Full" }));
    expect(screen.getByText("Progress Overview")).toBeInTheDocument();
  });

  it("tapping Bench Press strength card navigates to ExerciseTrend", () => {
    renderScreen();

    fireEvent.click(screen.getByText("Bench Press"));

    expect(mockNavigate).toHaveBeenCalledWith("ExerciseTrend", {
      exerciseId: "ex-bench",
      exerciseName: "Bench Press",
    });
  });
});
