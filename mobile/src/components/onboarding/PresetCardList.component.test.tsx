import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PresetCardList } from "./PresetCardList";

vi.mock("../interaction/haptics", () => ({
  hapticLight: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <div
      role="button"
      aria-disabled={disabled ? "true" : undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={() => {
        if (!disabled) onPress?.();
      }}
    >
      {children}
    </div>
  ),
}));

const options = [
  { value: "home", title: "Home gym", description: "Basic home setup" },
  { value: "commercial", title: "Commercial gym" },
];

describe("PresetCardList", () => {
  it("renders both card titles", () => {
    render(<PresetCardList options={options} selectedValue={null} onSelect={vi.fn()} />);
    expect(screen.getByText("Home gym")).toBeInTheDocument();
    expect(screen.getByText("Commercial gym")).toBeInTheDocument();
  });

  it("calls onSelect with home when Home gym is pressed", async () => {
    const onSelect = vi.fn();
    render(<PresetCardList options={options} selectedValue={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Home gym/ }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("home"));
  });

  it("calls onSelect with commercial when Commercial gym is pressed", async () => {
    const onSelect = vi.fn();
    render(<PresetCardList options={options} selectedValue={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Commercial gym" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("commercial"));
  });

  it("marks selected cards by exposing the selected card help action", () => {
    render(<PresetCardList options={options} selectedValue="home" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "?" })).toBeInTheDocument();
  });
});
