import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DayChipRow } from "./DayChipRow";

vi.mock("../interaction/haptics", () => ({
  hapticLight: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const days = [
  { label: "Mon", value: "monday" },
  { label: "Tue", value: "tuesday" },
  { label: "Wed", value: "wednesday" },
];

describe("DayChipRow", () => {
  it("renders all day labels", () => {
    render(<DayChipRow days={days} selectedValues={[]} onToggle={vi.fn()} />);
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Tue")).toBeInTheDocument();
    expect(screen.getByText("Wed")).toBeInTheDocument();
  });

  it("calls onToggle with the day value when pressed", async () => {
    const onToggle = vi.fn();
    render(<DayChipRow days={days} selectedValues={[]} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Mon" }));
    await waitFor(() => expect(onToggle).toHaveBeenCalledWith("monday"));
  });
});
