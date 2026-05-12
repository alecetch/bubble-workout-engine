import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pill } from "./Pill";

vi.mock("../interaction/haptics", () => ({
  hapticLight: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" aria-pressed={false} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

describe("Pill", () => {
  it("renders the label text", () => {
    render(<Pill label="Strength" selected={false} onPress={vi.fn()} />);
    expect(screen.getByText("Strength")).toBeInTheDocument();
  });

  it("calls onPress when pressed", async () => {
    const onPress = vi.fn();
    render(<Pill label="Strength" selected={false} onPress={onPress} />);
    fireEvent.click(screen.getByRole("button", { name: "Strength" }));
    await waitFor(() => expect(onPress).toHaveBeenCalledTimes(1));
  });

  it("does not call onPress when disabled", () => {
    const onPress = vi.fn();
    render(<Pill label="Strength" selected={false} disabled onPress={onPress} />);
    fireEvent.click(screen.getByRole("button", { name: "Strength" }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
