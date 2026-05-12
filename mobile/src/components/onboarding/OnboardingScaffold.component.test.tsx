import React from "react";
import { Text } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingScaffold } from "./OnboardingScaffold";

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

function renderScaffold(props: Partial<React.ComponentProps<typeof OnboardingScaffold>> = {}) {
  const onBack = vi.fn();
  const onNext = vi.fn();
  render(
    <OnboardingScaffold
      step={2}
      title="Goals"
      subtitle="Tell us what you want"
      errorBannerVisible={false}
      onBack={onBack}
      onNext={onNext}
      nextLabel="Continue"
      nextDisabled={false}
      isSaving={false}
      {...props}
    >
      <Text>Inner content</Text>
    </OnboardingScaffold>,
  );
  return { onBack, onNext };
}

describe("OnboardingScaffold", () => {
  it("renders the title and subtitle", () => {
    renderScaffold();
    expect(screen.getByText("Goals")).toBeInTheDocument();
    expect(screen.getByText("Tell us what you want")).toBeInTheDocument();
  });

  it("renders children", () => {
    renderScaffold();
    expect(screen.getByText("Inner content")).toBeInTheDocument();
  });

  it("renders progress text", () => {
    renderScaffold();
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  });

  it("does not render the error banner when hidden", () => {
    renderScaffold({ errorBannerVisible: false });
    expect(screen.queryByText("Please fix the highlighted fields")).not.toBeInTheDocument();
  });

  it("renders the error banner when visible", () => {
    renderScaffold({ errorBannerVisible: true });
    expect(screen.getByText("Please fix the highlighted fields")).toBeInTheDocument();
  });

  it("calls onBack when Back is pressed", () => {
    const { onBack } = renderScaffold();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("calls onNext when the next button is pressed", async () => {
    const { onNext } = renderScaffold();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
  });
});
