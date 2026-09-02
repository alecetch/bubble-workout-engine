import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildExercise } from "../../../__test-utils__";
import type { SetInputState } from "../sessionUxLogic";
import { RoundExerciseColumn } from "./RoundExerciseColumn";

const value: SetInputState = { weight: "80", reps: "8", rirActual: null };

function renderColumn(
  props: Partial<React.ComponentProps<typeof RoundExerciseColumn>> = {},
) {
  const onUpdateSetInput = props.onUpdateSetInput ?? vi.fn();
  const exercise = props.exercise ?? buildExercise({ id: "ex-1", name: "Barbell Squat", reps: "8-12" });

  render(
    <RoundExerciseColumn
      exercise={exercise}
      roundIndex={props.roundIndex ?? 0}
      value={props.value ?? value}
      onUpdateSetInput={onUpdateSetInput}
      layout={props.layout ?? "column"}
    />,
  );

  return { exercise, onUpdateSetInput };
}

describe("RoundExerciseColumn", () => {
  it("renders name, prescription, and inputs in column layout", () => {
    renderColumn({ layout: "column" });

    expect(screen.getByTestId("round-exercise-ex-1-column")).toBeInTheDocument();
    expect(screen.getByText("Barbell Squat")).toBeInTheDocument();
    expect(screen.getByText("8-12 reps")).toBeInTheDocument();
    expect(screen.getByLabelText("Weight for Barbell Squat")).toHaveValue("80");
    expect(screen.getByLabelText("Reps for Barbell Squat")).toHaveValue("8");
  });

  it("renders name, prescription, and inputs in row layout", () => {
    renderColumn({ layout: "row" });

    expect(screen.getByTestId("round-exercise-ex-1-row")).toBeInTheDocument();
    expect(screen.getByText("Barbell Squat")).toBeInTheDocument();
    expect(screen.getByText("8-12 reps")).toBeInTheDocument();
    expect(screen.getByLabelText("Weight for Barbell Squat")).toHaveValue("80");
    expect(screen.getByLabelText("Reps for Barbell Squat")).toHaveValue("8");
  });

  it("sanitizes weight and reps updates", () => {
    const onUpdateSetInput = vi.fn();
    renderColumn({ onUpdateSetInput });

    fireEvent.change(screen.getByLabelText("Weight for Barbell Squat"), { target: { value: "82.5kg!" } });
    fireEvent.change(screen.getByLabelText("Reps for Barbell Squat"), { target: { value: "9 reps" } });

    expect(onUpdateSetInput).toHaveBeenNthCalledWith(1, "ex-1", 0, expect.any(Function));
    expect(onUpdateSetInput.mock.calls[0][2](value)).toEqual({ ...value, weight: "82.5" });
    expect(onUpdateSetInput).toHaveBeenNthCalledWith(2, "ex-1", 0, expect.any(Function));
    expect(onUpdateSetInput.mock.calls[1][2](value)).toEqual({ ...value, reps: "9" });
  });

  it("renders an em dash instead of a weight input for unloaded exercises", () => {
    renderColumn({
      exercise: buildExercise({
        id: "ex-1",
        name: "Push-Up",
        reps: "12-15",
        isLoadable: false,
        isUnloaded: true,
      }),
    });

    expect(screen.queryByLabelText("Weight for Push-Up")).not.toBeInTheDocument();
    expect(screen.getByLabelText("No weight input for Push-Up")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByLabelText("Reps for Push-Up")).toHaveValue("8");
  });
});
