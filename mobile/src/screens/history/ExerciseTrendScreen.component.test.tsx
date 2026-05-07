import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExerciseHistory } from "../../api/hooks";
import { useSessionStore } from "../../state/session/sessionStore";
import { ExerciseTrendScreen } from "./ExerciseTrendScreen";
import { mockZustandSelector } from "../../__test-utils__";

vi.mock("../../api/hooks", () => ({
  useExerciseHistory: vi.fn(),
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

const HISTORY_FIXTURE = {
  series: [
    { date: "2025-01-06", e1rmKg: 80, outcome: "increase_load" },
    { date: "2025-01-13", e1rmKg: 82.5, outcome: "hold" },
    { date: "2025-01-20", e1rmKg: 82.5, outcome: "deload_local" },
    { date: "2025-01-27", e1rmKg: 85, outcome: "increase_load" },
    { date: "2025-02-03", e1rmKg: 87.5, outcome: "hold" },
  ],
  summary: { bestEstimatedE1rmKg: 87.5, bestWeightKg: 100, sessionsCount: 5 },
};

const mockRefetch = vi.fn();
const useExerciseHistoryMock = vi.mocked(useExerciseHistory);
const useSessionStoreMock = vi.mocked(useSessionStore);

function latestHistoryWindow() {
  const calls = useExerciseHistoryMock.mock.calls;
  return calls[calls.length - 1]?.[1];
}

function renderScreen() {
  render(
    <ExerciseTrendScreen
      route={{ params: { exerciseId: "ex-bench", exerciseName: "Bench Press" } } as any}
      navigation={{ goBack: vi.fn(), setOptions: vi.fn() } as any}
    />,
  );
}

describe("ExerciseTrendScreen", () => {
  beforeEach(() => {
    mockRefetch.mockReset();
    mockZustandSelector(useSessionStoreMock as any, { userId: "user-123" });
    useExerciseHistoryMock.mockReturnValue({
      data: HISTORY_FIXTURE,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    } as any);
  });

  it("shows loading indicator when isLoading is true", () => {
    useExerciseHistoryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: mockRefetch,
    } as any);

    renderScreen();

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText("No data yet for this exercise.")).not.toBeInTheDocument();
  });

  it("shows error state when isError is true", () => {
    useExerciseHistoryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    } as any);

    renderScreen();

    expect(screen.getByText("Unable to load exercise trend")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("Retry button calls refetch", () => {
    useExerciseHistoryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    } as any);

    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("shows empty state when series is empty", () => {
    useExerciseHistoryMock.mockReturnValue({
      data: {
        series: [],
        summary: { bestEstimatedE1rmKg: null, bestWeightKg: null, sessionsCount: 0 },
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    } as any);

    renderScreen();

    expect(screen.getByText("No data yet for this exercise.")).toBeInTheDocument();
  });

  it("renders session count summary when data has series", () => {
    renderScreen();

    expect(screen.getByText(/5 sessions logged/)).toBeInTheDocument();
    expect(screen.queryByText("No data yet for this exercise.")).not.toBeInTheDocument();
  });

  it("tapping window pills passes the new window value to useExerciseHistory", () => {
    renderScreen();

    expect(latestHistoryWindow()).toBe("12w");

    fireEvent.click(screen.getByRole("button", { name: "8W" }));
    expect(latestHistoryWindow()).toBe("8w");

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(latestHistoryWindow()).toBe("all");
  });
});
