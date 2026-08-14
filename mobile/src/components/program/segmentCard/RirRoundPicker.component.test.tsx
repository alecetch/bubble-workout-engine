import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildExercise } from "../../../__test-utils__";
import { RIR_OPTIONS, RirRoundPicker } from "./RirRoundPicker";

vi.mock("../../interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress, style }: any) => {
    const flattened = Array.isArray(style)
      ? Object.assign({}, ...style.filter(Boolean))
      : style;
    return (
      <button
        type="button"
        aria-label={accessibilityLabel}
        data-selected={flattened?.backgroundColor === "#3B82F6" ? "true" : "false"}
        disabled={disabled}
        onClick={() => onPress?.()}
      >
        {children}
      </button>
    );
  },
}));

describe("RirRoundPicker", () => {
  it("renders one pill per RIR option and the exercise name", () => {
    render(<RirRoundPicker exercise={buildExercise()} selectedRir={null} onSelect={vi.fn()} />);

    expect(screen.getByText("Barbell Squat")).toBeInTheDocument();
    for (const option of RIR_OPTIONS) {
      expect(screen.getByRole("button", { name: `Barbell Squat ${option} reps in reserve` })).toBeInTheDocument();
    }
  });

  it("applies the selected style to the matching pill", () => {
    render(<RirRoundPicker exercise={buildExercise()} selectedRir={2} onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Barbell Squat 2 reps in reserve" })).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: "Barbell Squat 3 reps in reserve" })).toHaveAttribute(
      "data-selected",
      "false",
    );
  });

  it("calls onSelect with numeric RIR values", () => {
    const onSelect = vi.fn();
    render(<RirRoundPicker exercise={buildExercise()} selectedRir={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Barbell Squat 3 reps in reserve" }));
    fireEvent.click(screen.getByRole("button", { name: "Barbell Squat 4+ reps in reserve" }));

    expect(onSelect).toHaveBeenNthCalledWith(1, 3);
    expect(onSelect).toHaveBeenNthCalledWith(2, 4);
  });
});
