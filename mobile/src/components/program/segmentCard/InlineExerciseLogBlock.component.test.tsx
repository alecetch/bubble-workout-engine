import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildExercise } from "../../../__test-utils__";
import type { SetInputState } from "../sessionUxLogic";
import { InlineExerciseLogBlock } from "./InlineExerciseLogBlock";

vi.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock("../../interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const exercise = buildExercise({ id: "ex-1", name: "Barbell Squat" });
const setInputs: SetInputState[] = [
  { weight: "80", reps: "8", rirActual: null },
  { weight: "82.5", reps: "7", rirActual: null },
];

function renderBlock(
  props: Partial<React.ComponentProps<typeof InlineExerciseLogBlock>> = {},
) {
  return render(
    <InlineExerciseLogBlock
      exercise={props.exercise ?? exercise}
      setInputs={props.setInputs ?? setInputs}
      doneSetKeys={props.doneSetKeys ?? new Set()}
      activeSetKey={props.activeSetKey ?? null}
      pbSetKeys={props.pbSetKeys ?? new Set()}
      exerciseRir={props.exerciseRir ?? null}
      onFillDown={props.onFillDown ?? vi.fn()}
      onSetComplete={props.onSetComplete ?? vi.fn()}
      onAddSet={props.onAddSet ?? vi.fn()}
      onRemoveSet={props.onRemoveSet ?? vi.fn()}
      onLogAllSets={props.onLogAllSets ?? vi.fn()}
      onSelectRir={props.onSelectRir ?? vi.fn()}
    />,
  );
}

describe("InlineExerciseLogBlock", () => {
  it("renders set rows from setInputs", () => {
    renderBlock();

    expect(screen.getByText("Set 1")).toBeInTheDocument();
    expect(screen.getByText("Set 2")).toBeInTheDocument();
  });

  it("calls onLogAllSets with the exercise", () => {
    const onLogAllSets = vi.fn();
    renderBlock({ onLogAllSets });

    fireEvent.click(screen.getByText("Log all sets as complete"));

    expect(onLogAllSets).toHaveBeenCalledWith(exercise);
  });

  it("calls onFillDown with the exercise when editing an input", () => {
    const onFillDown = vi.fn();
    renderBlock({ onFillDown });

    fireEvent.change(screen.getAllByPlaceholderText("0")[0], { target: { value: "100" } });

    expect(onFillDown).toHaveBeenCalledWith("ex-1", 0, "weight", "100", exercise);
  });
});
