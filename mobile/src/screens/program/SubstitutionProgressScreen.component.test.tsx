import React from "react";
import { act, render, screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Alert } from "react-native";
import { pollSubstitutionJob } from "../../api/programDayActions";
import { SubstitutionProgressScreen } from "./SubstitutionProgressScreen";

vi.mock("../../api/programDayActions", () => ({
  pollSubstitutionJob: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const alertSpy = vi.spyOn(Alert, "alert").mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
const invalidateQueriesMock = vi.fn();
const mockGoBack = vi.fn();
const mockNavigate = vi.fn();
const mockPollSubstitutionJob = vi.mocked(pollSubstitutionJob);

function renderScreen() {
  return render(
    <SubstitutionProgressScreen
      route={{ params: { programId: "prog-1", jobId: "job-abc" } } as any}
      navigation={{
        navigate: mockNavigate,
        goBack: mockGoBack,
        setOptions: vi.fn(),
      } as any}
    />,
  );
}

describe("SubstitutionProgressScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    alertSpy.mockClear();
    consoleErrorSpy.mockClear();
    invalidateQueriesMock.mockReset();
    mockGoBack.mockReset();
    mockNavigate.mockReset();
    mockPollSubstitutionJob.mockReset();
    vi.mocked(useQueryClient).mockReturnValue({ invalidateQueries: invalidateQueriesMock } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders polling UI on mount", () => {
    mockPollSubstitutionJob.mockReturnValue(new Promise(() => {}));

    renderScreen();

    expect(screen.getByText("Updating your program...")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByText("Go back")).not.toBeInTheDocument();
  });

  it("navigates to ProgramDashboard and invalidates query when job completes", async () => {
    mockPollSubstitutionJob
      .mockResolvedValueOnce({ status: "running" })
      .mockResolvedValueOnce({
        status: "complete",
        swappedCount: 5,
        unsubstitutedExerciseIds: [],
      });

    renderScreen();
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["programOverview"] });
    expect(mockNavigate).toHaveBeenCalledWith("ProgramDashboard", { programId: "prog-1" });
  });

  it("shows timeout error and Go back button after 30 s of running status", async () => {
    mockPollSubstitutionJob.mockResolvedValue({ status: "running" });

    renderScreen();
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(32000);
    });

    expect(screen.getByText("This is taking too long")).toBeInTheDocument();
    expect(screen.getByText("Go back")).toBeInTheDocument();
    expect(screen.queryByText("Updating your program...")).not.toBeInTheDocument();
  });

  it("stops polling on unmount without state update errors", async () => {
    mockPollSubstitutionJob.mockResolvedValue({ status: "running" });

    const { unmount } = renderScreen();
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
