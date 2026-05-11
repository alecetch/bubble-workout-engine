import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StickyNavBar } from "./StickyNavBar";

vi.mock("../interaction/haptics", () => ({
  hapticMedium: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@react-navigation/bottom-tabs", async () => {
  const ReactActual = await import("react");
  return {
    BottomTabBarHeightContext: ReactActual.createContext(0),
  };
});

vi.mock("../interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

function renderNav(props: Partial<React.ComponentProps<typeof StickyNavBar>> = {}) {
  const onBack = vi.fn();
  const onNext = vi.fn();
  render(
    <StickyNavBar
      onBack={onBack}
      onNext={onNext}
      nextLabel="Continue"
      nextDisabled={false}
      isSaving={false}
      {...props}
    />,
  );
  return { onBack, onNext };
}

describe("StickyNavBar", () => {
  it("renders Back and the next label", () => {
    renderNav();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("calls onBack when Back is pressed", () => {
    const { onBack } = renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("calls onNext when the next button is pressed", async () => {
    const { onNext } = renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
  });

  it("does not call onNext when nextDisabled is true", () => {
    const { onNext } = renderNav({ nextDisabled: true });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onNext).not.toHaveBeenCalled();
  });

  it("shows Saving instead of the next label when saving", () => {
    renderNav({ isSaving: true });
    expect(screen.getByText("Saving...")).toBeInTheDocument();
    expect(screen.queryByText("Continue")).not.toBeInTheDocument();
  });

  it("disables Back when saving", () => {
    renderNav({ isSaving: true });
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });
});
