import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "jest-axe";
import { YearGoalScreen } from "./YearGoalScreen";

vi.mock("@react-navigation/bottom-tabs", async () => {
  const actual = await import("react");
  return { BottomTabBarHeightContext: actual.createContext(0) };
});
vi.mock("../../components/interaction/haptics", () => ({ hapticMedium: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress, testID }: any) => (
    <button type="button" disabled={disabled} onClick={onPress} data-testid={testID}>{children}</button>
  ),
}));

function renderGoal() {
  const navigation = { replace: vi.fn() };
  render(<YearGoalScreen navigation={navigation as any} route={{} as any} />);
  return navigation;
}

describe("YearGoalScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 1, 12));
  });
  afterEach(() => vi.useRealTimers());

  it("introduces the yearly goal, clubs and pro-rated target without any inputs", () => {
    renderGoal();
    expect(screen.getByText("The goal: 200 training days this year.")).toBeInTheDocument();
    expect(screen.getByText("Then Club 250. Then Club 300.")).toBeInTheDocument();
    expect(screen.getByText("You're starting partway through 2026, so this year's target is 50. Next year it's 200.")).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 4")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Let's go" })).toBeEnabled();
  });
  it("omits pro-rating on 1 January", () => {
    vi.setSystemTime(new Date(2026, 0, 1, 12));
    renderGoal();
    expect(screen.queryByText(/You're starting partway/)).not.toBeInTheDocument();
  });
  it("continues in one tap using the scaffold's stable Maestro ID", async () => {
    const navigation = renderGoal();
    fireEvent.click(screen.getByTestId("year-goal-continue"));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("Step3Schedule"));
  });
  it("can return to equipment without entering a baseline auto-skip loop", () => {
    const navigation = renderGoal();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(navigation.replace).toHaveBeenCalledWith("Step2Equipment");
  });
  it("has no accessibility violations", async () => {
    renderGoal();
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
