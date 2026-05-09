import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExerciseGuidance } from "../../api/hooks";
import { ExerciseDetailScreen } from "./ExerciseDetailScreen";

vi.mock("../../api/hooks", () => ({
  useExerciseGuidance: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

vi.mock("../../components/feedback/SkeletonBlock", () => ({
  SkeletonBlock: ({ height }: any) => (
    <div data-testid="skeleton-block" style={{ height }} />
  ),
}));

vi.mock("../../components/program/GuidelineLoadHint", () => ({
  GuidelineLoadHint: () => <div data-testid="guideline-load-hint" />,
}));

vi.mock("../../components/program/AdaptationChip", () => ({
  AdaptationChip: ({ decision, expanded, onToggle }: any) => (
    <div>
      <button type="button" onClick={onToggle} data-testid="adaptation-chip-toggle">
        Adaptation chip
      </button>
      {expanded ? (
        <div data-testid="adaptation-chip-expanded">
          {decision?.rationale ?? "Rationale content"}
        </div>
      ) : null}
    </div>
  ),
}));

const GUIDANCE_FIXTURE = {
  techniqueCue: "Lead with your chest",
  coachingCues: ["Retract scapula", "Drive feet into floor"],
  techniqueSetup: "Grip just outside shoulder width",
  techniqueExecution: ["Unrack the bar", "Lower under control", "Press to lockout"],
  techniqueMistakes: ["Flared elbows", "Bouncing off chest"],
  loadGuidance: "Start at 70% 1RM",
  loggingGuidance: "Log top set",
  techniqueVideoUrl: null,
};

const BASE_PARAMS = {
  exerciseId: "ex-bench",
  programExerciseId: "pe-1",
  exerciseName: "Bench Press",
  sets: 3,
  reps: "5",
  repsUnit: "reps",
  intensity: "100 kg",
  restSeconds: 180,
  guidelineLoadJson: null,
  adaptationDecisionJson: JSON.stringify({
    decisionType: "increase",
    lever: "load",
    confidence: "high",
    rationale: "You hit all reps last session.",
  }),
  canSwap: true,
};

const useExerciseGuidanceMock = vi.mocked(useExerciseGuidance);

function renderScreen(params = BASE_PARAMS) {
  return render(
    <ExerciseDetailScreen
      route={{ params } as any}
      navigation={{ navigate: vi.fn(), goBack: vi.fn(), setOptions: vi.fn() } as any}
    />,
  );
}

describe("ExerciseDetailScreen", () => {
  beforeEach(() => {
    useExerciseGuidanceMock.mockReturnValue({
      data: GUIDANCE_FIXTURE,
      isLoading: false,
      isError: false,
      error: null,
    } as any);
  });

  it("shows loading skeleton when isLoading is true", () => {
    useExerciseGuidanceMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as any);

    renderScreen();

    expect(screen.getByTestId("skeleton-block")).toBeInTheDocument();
    expect(screen.queryByText("No technique notes for this exercise yet.")).not.toBeInTheDocument();
  });

  it("shows error state when isError is true", () => {
    useExerciseGuidanceMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("API error"),
    } as any);

    renderScreen();

    expect(screen.getByText("API error")).toBeInTheDocument();
  });

  it("shows no-guidance fallback when data is null", () => {
    useExerciseGuidanceMock.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    renderScreen();

    expect(screen.getByText("No technique notes for this exercise yet.")).toBeInTheDocument();
  });

  it("renders prescription, intensity, rest, and technique cue", () => {
    renderScreen();

    expect(screen.getByText(/3 sets x 5 reps/)).toBeInTheDocument();
    expect(screen.getByText("@100 kg")).toBeInTheDocument();
    expect(screen.getByText("Rest 180 s")).toBeInTheDocument();
    expect(screen.getByText("Lead with your chest")).toBeInTheDocument();
  });

  it("tapping adaptation chip toggles expanded section", () => {
    renderScreen();

    expect(screen.queryByTestId("adaptation-chip-expanded")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("adaptation-chip-toggle"));
    expect(screen.getByTestId("adaptation-chip-expanded")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("adaptation-chip-toggle"));
    expect(screen.queryByTestId("adaptation-chip-expanded")).not.toBeInTheDocument();
  });
});
