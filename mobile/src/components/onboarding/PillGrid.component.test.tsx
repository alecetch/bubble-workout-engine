import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PillGrid } from "./PillGrid";

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

const options = [
  { label: "Strength", value: "strength" },
  { label: "Hypertrophy", value: "hypertrophy" },
  { label: "Conditioning", value: "conditioning" },
];

describe("PillGrid", () => {
  it("renders all option labels", () => {
    render(<PillGrid options={options} selectedValues={[]} onToggle={vi.fn()} />);
    expect(screen.getByText("Strength")).toBeInTheDocument();
    expect(screen.getByText("Hypertrophy")).toBeInTheDocument();
    expect(screen.getByText("Conditioning")).toBeInTheDocument();
  });

  it("calls onToggle with the correct value when pressed", async () => {
    const onToggle = vi.fn();
    render(<PillGrid options={options} selectedValues={[]} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Hypertrophy" }));
    await waitFor(() => expect(onToggle).toHaveBeenCalledWith("hypertrophy"));
  });

  it("still toggles selected pills with the correct value", async () => {
    const onToggle = vi.fn();
    render(<PillGrid options={options} selectedValues={["strength"]} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Strength" }));
    await waitFor(() => expect(onToggle).toHaveBeenCalledWith("strength"));
  });
});
