import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PresetCard } from "./PresetCard";

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

describe("PresetCard", () => {
  it("renders the title and optional description", () => {
    render(
      <PresetCard
        title="Home gym"
        description="Basic home setup"
        selected={false}
        onPress={vi.fn()}
      />,
    );
    expect(screen.getByText("Home gym")).toBeInTheDocument();
    expect(screen.getByText("Basic home setup")).toBeInTheDocument();
  });

  it("calls onPress when the card is pressed", async () => {
    const onPress = vi.fn();
    render(<PresetCard title="Home gym" selected={false} onPress={onPress} />);
    fireEvent.click(screen.getByRole("button", { name: "Home gym" }));
    await waitFor(() => expect(onPress).toHaveBeenCalledTimes(1));
  });

  it("does not show a help button when selected", () => {
    render(<PresetCard title="Home gym" selected onPress={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "?" })).not.toBeInTheDocument();
  });
});
