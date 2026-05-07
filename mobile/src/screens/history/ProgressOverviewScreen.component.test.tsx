import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionHistoryMetrics } from "../../api/hooks";
import { useSessionStore } from "../../state/session/sessionStore";
import { ProgressOverviewScreen } from "./ProgressOverviewScreen";

vi.mock("../../api/hooks", () => ({
  useSessionHistoryMetrics: vi.fn(),
}));

vi.mock("../../state/session/sessionStore", () => ({
  useSessionStore: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
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
    mockNavigate.mockReset();
    mockRefetch.mockReset();
    useSessionStoreMock.mockImplementation((selector: any) =>
      selector({ userId: "user-123" }),
    );
    useSessionHistoryMetricsMock.mockReturnValue({
      data: METRICS_FIXTURE,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    } as any);
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

  it("renders day streak, session count, and consistency from fixture", () => {
    renderScreen();

    expect(screen.getByText("Day streak")).toBeInTheDocument();
    expect(screen.getByText("Sessions (28d)")).toBeInTheDocument();
    expect(screen.getByText("Consistency")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("83%")).toBeInTheDocument();
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
