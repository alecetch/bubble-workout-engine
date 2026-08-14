import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildExercise } from "../../../__test-utils__";
import { RoundSummaryRow } from "./RoundSummaryRow";

vi.mock("../../interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const exercises = [
  buildExercise({ id: "ex-1", name: "Barbell Squat" }),
  buildExercise({ id: "ex-2", exerciseId: "bb-rdl", name: "Romanian Deadlift" }),
];

describe("RoundSummaryRow", () => {
  it("renders the collapsed summary without expanded detail lines", () => {
    render(
      <RoundSummaryRow
        roundIndex={0}
        expanded={false}
        onToggle={vi.fn()}
        loggableExercises={exercises}
        getExerciseValue={() => null}
      />,
    );

    expect(screen.getByText(/Round 1/)).toBeInTheDocument();
    expect(screen.queryByText("Barbell Squat: not logged")).not.toBeInTheDocument();
  });

  it("renders expanded exercise lines and not logged fallback", () => {
    render(
      <RoundSummaryRow
        roundIndex={0}
        expanded
        onToggle={vi.fn()}
        loggableExercises={exercises}
        getExerciseValue={(exercise) => (exercise.id === "ex-1" ? "80 kg x 8" : null)}
      />,
    );

    expect(screen.getByText("Barbell Squat: 80 kg x 8")).toBeInTheDocument();
    expect(screen.getByText("Romanian Deadlift: not logged")).toBeInTheDocument();
  });

  it("calls onToggle with the round index when pressed", () => {
    const onToggle = vi.fn();
    render(
      <RoundSummaryRow
        roundIndex={2}
        expanded={false}
        onToggle={onToggle}
        loggableExercises={exercises}
        getExerciseValue={() => "80 kg x 8"}
      />,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(onToggle).toHaveBeenCalledWith(2);
  });
});
