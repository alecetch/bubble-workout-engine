import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { RIR_OPTIONS } from "./RirRoundPicker";
import { SegmentEffortPicker } from "./SegmentEffortPicker";

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

describe("SegmentEffortPicker", () => {
  it("renders one pill per effort option", () => {
    render(<SegmentEffortPicker selectedValue={null} onSelect={vi.fn()} />);

    expect(screen.getByTestId("segment-effort-picker")).toBeInTheDocument();
    for (const option of RIR_OPTIONS) {
      expect(screen.getByRole("button", { name: `Superset effort ${option}` })).toBeInTheDocument();
    }
  });

  it("marks the selected value", () => {
    render(<SegmentEffortPicker selectedValue={2} onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Superset effort 2" })).toHaveAttribute("data-selected", "true");
    expect(screen.getByRole("button", { name: "Superset effort 3" })).toHaveAttribute("data-selected", "false");
  });

  it("calls onSelect with numeric values", () => {
    const onSelect = vi.fn();
    render(<SegmentEffortPicker selectedValue={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Superset effort 4+" }));
    fireEvent.click(screen.getByRole("button", { name: "Superset effort 0" }));

    expect(onSelect).toHaveBeenNthCalledWith(1, 4);
    expect(onSelect).toHaveBeenNthCalledWith(2, 0);
  });
});
