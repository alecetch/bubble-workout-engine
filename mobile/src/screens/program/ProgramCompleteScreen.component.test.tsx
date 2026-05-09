import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProgramCompleteScreen } from "./ProgramCompleteScreen";
import { useProgramCompletionSummary } from "../../api/hooks";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { mockZustandSelector } from "../../__test-utils__";

vi.mock("../../api/hooks", () => ({
  useProgramCompletionSummary: vi.fn(),
}));

vi.mock("../../state/onboarding/onboardingStore", () => ({
  useOnboardingStore: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const useProgramCompletionSummaryMock = vi.mocked(useProgramCompletionSummary);
const useOnboardingStoreMock = vi.mocked(useOnboardingStore);
const resetFromProfileMock = vi.fn();

const summary = {
  programTitle: "Test Block",
  programType: "strength",
  completedMode: "as_scheduled",
  daysCompleted: 8,
  daysTotal: 9,
  exercisesProgressed: 4,
  avgConfidence: "high",
  skippedWorkoutsCount: 0,
  missedWorkoutsCount: 0,
  personalRecords: [],
  suggestedNextRank: 2,
  reEnrollmentOptions: [
    { option: "same_settings", label: "Same settings" },
    { option: "progress_level", label: "Progress level" },
    { option: "change_goals", label: "Change goals" },
  ],
  currentProfile: {
    fitnessLevelSlug: "intermediate",
    fitnessRank: 1,
    goals: ["strength"],
    injuryFlags: [],
    goalNotes: null,
    minutesPerSession: 45,
    preferredDays: ["mon", "wed"],
    scheduleConstraints: "",
    heightCm: null,
    weightKg: null,
    sex: null,
    ageRange: null,
    equipmentItemsSlugs: ["barbell"],
    equipmentPresetSlug: "full_gym",
    onboardingStepCompleted: 2,
  },
};

function renderScreen(navigation = { navigate: vi.fn(), goBack: vi.fn(), getParent: vi.fn(() => null) }) {
  render(
    <ProgramCompleteScreen
      route={{ params: { programId: "prog-1" } } as any}
      navigation={navigation as any}
    />,
  );
  return navigation;
}

describe("ProgramCompleteScreen", () => {
  beforeEach(() => {
    resetFromProfileMock.mockReset();
    mockZustandSelector(useOnboardingStoreMock as any, { resetFromProfile: resetFromProfileMock });
    useProgramCompletionSummaryMock.mockReturnValue({
      data: summary,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
  });

  it("renders loading state", () => {
    useProgramCompletionSummaryMock.mockReturnValueOnce({ isLoading: true, data: undefined } as any);
    renderScreen();
    expect(screen.getByText("Loading completion summary...")).toBeInTheDocument();
  });

  it("renders error state with retry", () => {
    useProgramCompletionSummaryMock.mockReturnValueOnce({
      isError: true,
      error: { message: "fail" },
      data: undefined,
      refetch: vi.fn(),
    } as any);
    renderScreen();
    expect(screen.getByText("Unable to load program summary")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("renders all re-enrollment options", () => {
    renderScreen();
    expect(screen.getByText("Same settings")).toBeInTheDocument();
    expect(screen.getByText("Progress level")).toBeInTheDocument();
    expect(screen.getByText("Change goals")).toBeInTheDocument();
  });

  it("shows skipped session copy for with_skips mode", () => {
    useProgramCompletionSummaryMock.mockReturnValue({
      data: { ...summary, completedMode: "with_skips", skippedWorkoutsCount: 2 },
      isLoading: false,
      isError: false,
    } as any);
    renderScreen();
    expect(screen.getByText(/2 skipped sessions/)).toBeInTheDocument();
  });

  it("shows missed workout count when with_skips includes misses", () => {
    useProgramCompletionSummaryMock.mockReturnValue({
      data: { ...summary, completedMode: "with_skips", skippedWorkoutsCount: 1, missedWorkoutsCount: 3 },
      isLoading: false,
      isError: false,
    } as any);
    renderScreen();
    expect(screen.getByText(/1 skipped session and 3 missed workouts/)).toBeInTheDocument();
  });

  it("continues same_settings to ProgramReview with a preserved draft", () => {
    const navigation = renderScreen();
    fireEvent.click(screen.getByText("Same settings"));
    fireEvent.click(screen.getByText("Continue"));
    expect(resetFromProfileMock).toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith("ProgramReview", { preserveDraft: true });
  });

  it("renders personal record highlights", () => {
    useProgramCompletionSummaryMock.mockReturnValue({
      data: {
        ...summary,
        personalRecords: [{ exerciseId: "abc", exerciseName: "Bench Press", bestWeightKg: 100 }],
      },
      isLoading: false,
      isError: false,
    } as any);
    renderScreen();
    expect(screen.getByText("Bench Press")).toBeInTheDocument();
    expect(screen.getByText("100 kg")).toBeInTheDocument();
  });
});
