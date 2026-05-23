import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BonusWorkoutSheet } from "./BonusWorkoutSheet";
import { addBonusDay } from "../../api/bonusDayApi";

vi.mock("../../api/bonusDayApi", () => ({
  addBonusDay: vi.fn(),
}));

vi.mock("../interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress, style, testID }: any) => (
    <button
      type="button"
      disabled={disabled}
      data-testid={testID}
      data-style={JSON.stringify(style)}
      onClick={() => onPress?.()}
    >
      {children}
    </button>
  ),
}));

vi.mock("react-native", async () => {
  const actual = await vi.importActual<any>("react-native");
  return {
    ...actual,
    Modal: ({ children, visible }: any) => (visible ? <div>{children}</div> : null),
  };
});

const addBonusDayMock = vi.mocked(addBonusDay);

function renderSheet(overrides: Partial<React.ComponentProps<typeof BonusWorkoutSheet>> = {}) {
  const props: React.ComponentProps<typeof BonusWorkoutSheet> = {
    visible: true,
    onClose: vi.fn(),
    onCreated: vi.fn(),
    programId: "program-1",
    todayIso: "2026-05-23",
    todayWeekday: "sat",
    currentProgramType: "hypertrophy",
    currentFocusTypes: ["upper_body", "lower_body"],
    recommendedFocusType: "lower_body",
    ...overrides,
  };
  render(<BonusWorkoutSheet {...props} />);
  return props;
}

describe("BonusWorkoutSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addBonusDayMock.mockResolvedValue({ ok: true, programDayId: "bonus-day-1", daysCreated: 1 });
  });

  it("renders focus type options from currentFocusTypes", () => {
    renderSheet();
    expect(screen.getByText(/Hypertrophy - Upper Body/)).toBeInTheDocument();
    expect(screen.getByText(/Hypertrophy - Lower Body/)).toBeInTheDocument();
  });

  it("marks the recommendedFocusType with recommended tag", () => {
    renderSheet();
    expect(screen.getByText("(Recommended)")).toBeInTheDocument();
  });

  it("advances to scope step after Confirm", () => {
    renderSheet();
    fireEvent.click(screen.getByText(/Hypertrophy - Upper Body/));
    fireEvent.click(screen.getByText("Confirm"));
    expect(screen.getByText("Just today")).toBeInTheDocument();
    expect(screen.getByText("Every Saturday from now on")).toBeInTheDocument();
  });

  it("calls addBonusDay with scope today when Just today is tapped", async () => {
    renderSheet();
    fireEvent.click(screen.getByText(/Hypertrophy - Lower Body/));
    fireEvent.click(screen.getByText("Confirm"));
    fireEvent.click(screen.getByText("Just today"));

    await waitFor(() => {
      expect(addBonusDayMock).toHaveBeenCalledWith("program-1", {
        focusType: "lower_body",
        programType: "hypertrophy",
        scope: "today",
        targetDate: "2026-05-23",
        weekday: "sat",
      });
    });
  });

  it("calls addBonusDay with scope weekday_recurring when Every weekday is tapped", async () => {
    renderSheet();
    fireEvent.click(screen.getByText("Strength"));
    fireEvent.click(screen.getByText("Confirm"));
    fireEvent.click(screen.getByText("Every Saturday from now on"));

    await waitFor(() => {
      expect(addBonusDayMock).toHaveBeenCalledWith("program-1", {
        focusType: null,
        programType: "strength",
        scope: "weekday_recurring",
        targetDate: "2026-05-23",
        weekday: "sat",
      });
    });
  });

  it("shows error message when addBonusDay rejects", async () => {
    addBonusDayMock.mockRejectedValueOnce(new Error("You already have a workout scheduled for that day"));
    renderSheet();
    fireEvent.click(screen.getByText(/Hypertrophy - Upper Body/));
    fireEvent.click(screen.getByText("Confirm"));
    fireEvent.click(screen.getByText("Just today"));

    expect(await screen.findByText("You already have a workout scheduled for that day")).toBeInTheDocument();
  });

  it("calls onCreated with programDayId on success", async () => {
    const props = renderSheet();
    fireEvent.click(screen.getByText(/Hypertrophy - Upper Body/));
    fireEvent.click(screen.getByText("Confirm"));
    fireEvent.click(screen.getByText("Just today"));

    await waitFor(() => {
      expect(props.onCreated).toHaveBeenCalledWith("bonus-day-1");
    });
  });
});
