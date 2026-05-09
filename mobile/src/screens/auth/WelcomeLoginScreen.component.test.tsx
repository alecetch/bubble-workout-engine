import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WelcomeLoginScreen } from "./WelcomeLoginScreen";

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

function makeNav() {
  return { navigate: vi.fn(), goBack: vi.fn(), replace: vi.fn() };
}

function renderScreen() {
  const navigation = makeNav();
  render(<WelcomeLoginScreen navigation={navigation as any} route={{ params: {} } as any} />);
  return navigation;
}

describe("WelcomeLoginScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Sign in and Create account buttons", () => {
    renderScreen();

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("buttons navigate to the correct auth screens", () => {
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(navigation.navigate).toHaveBeenCalledWith("Login");
    expect(navigation.navigate).toHaveBeenCalledWith("Register");
  });
});
