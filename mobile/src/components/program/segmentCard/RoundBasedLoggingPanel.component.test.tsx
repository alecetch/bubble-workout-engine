import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildExercise } from "../../../__test-utils__";
import type { SetInputState } from "../sessionUxLogic";
import { RoundBasedLoggingPanel } from "./RoundBasedLoggingPanel";

vi.mock("../../interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const exercises = [
  buildExercise({ id: "ex-1", name: "Barbell Squat" }),
  buildExercise({ id: "ex-2", exerciseId: "bb-rdl", name: "Romanian Deadlift" }),
];

const inputMap: Record<string, SetInputState[]> = {
  "ex-1": [{ weight: "80", reps: "8", rirActual: null }],
  "ex-2": [{ weight: "70", reps: "10", rirActual: null }],
};

function renderPanel(
  props: Partial<React.ComponentProps<typeof RoundBasedLoggingPanel>> = {},
) {
  return render(
    <RoundBasedLoggingPanel
      totalRounds={props.totalRounds ?? 3}
      completedRoundIndices={props.completedRoundIndices ?? new Set()}
      activeRoundIndex={props.activeRoundIndex ?? 0}
      showPostStopRir={props.showPostStopRir ?? false}
      expandedRoundIndices={props.expandedRoundIndices ?? new Set()}
      onToggleExpandedRound={props.onToggleExpandedRound ?? vi.fn()}
      loggableExercises={props.loggableExercises ?? exercises}
      inputMap={props.inputMap ?? inputMap}
      onUpdateSetInput={props.onUpdateSetInput ?? vi.fn()}
      exerciseRirMap={props.exerciseRirMap ?? {}}
      onSelectRir={props.onSelectRir ?? vi.fn()}
      roundSaveError={props.roundSaveError ?? null}
      onRoundComplete={props.onRoundComplete ?? vi.fn()}
      onPostStopRirDone={props.onPostStopRirDone ?? vi.fn()}
      getExerciseValue={props.getExerciseValue ?? (() => "80 kg x 8")}
    />,
  );
}

describe("RoundBasedLoggingPanel", () => {
  it("renders completed, active, and locked round states", () => {
    renderPanel({ completedRoundIndices: new Set([0]), activeRoundIndex: 1 });

    expect(screen.getByText(/Round 1/)).toBeInTheDocument();
    expect(screen.getByText("Round 2")).toBeInTheDocument();
    expect(screen.getByText("Round 3 · complete round 2 to unlock")).toBeInTheDocument();
  });

  it("calls onSelectRir when tapping the active last round RIR picker", () => {
    const onSelectRir = vi.fn();
    renderPanel({ totalRounds: 1, activeRoundIndex: 0, onSelectRir });

    fireEvent.click(screen.getByRole("button", { name: "Barbell Squat 3 reps in reserve" }));

    expect(onSelectRir).toHaveBeenCalledWith(exercises[0], 3);
  });

  it("renders post-stop RIR controls and calls onPostStopRirDone", () => {
    const onPostStopRirDone = vi.fn();
    renderPanel({ showPostStopRir: true, onPostStopRirDone });

    expect(screen.getByRole("button", { name: "Barbell Squat 4+ reps in reserve" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Done"));

    expect(onPostStopRirDone).toHaveBeenCalledTimes(1);
  });

  it("renders roundSaveError when provided", () => {
    renderPanel({ roundSaveError: "Failed to save" });

    expect(screen.getByText("Failed to save")).toBeInTheDocument();
  });
});
