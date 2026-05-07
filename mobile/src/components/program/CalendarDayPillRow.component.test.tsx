import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CalendarDayPillRow, type CalendarDayPillItem } from "./CalendarDayPillRow";

vi.mock("../interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress, style }: any) => (
    <button
      type="button"
      disabled={disabled}
      data-style={JSON.stringify(style)}
      onClick={() => onPress?.()}
    >
      {children}
    </button>
  ),
}));

const days: CalendarDayPillItem[] = [
  { id: "cal-1", scheduledDate: "2026-05-04", isTrainingDay: true, programDayId: "day-1" },
  { id: "cal-2", scheduledDate: "2026-05-05", isTrainingDay: true, programDayId: "day-2" },
  { id: "cal-3", scheduledDate: "2026-05-06", isTrainingDay: false },
  { id: "cal-4", scheduledDate: "2026-05-07", isTrainingDay: true, programDayId: "day-4", isSkipped: true },
  { id: "cal-5", scheduledDate: "2026-05-08", isTrainingDay: true, programDayId: "day-5" },
];

function renderRow(onSelectProgramDay = vi.fn()) {
  render(
    <CalendarDayPillRow
      days={days}
      selectedProgramDayId="day-1"
      onSelectProgramDay={onSelectProgramDay}
      dayStatusByProgramDayId={{ "day-2": "complete" }}
    />,
  );
  return onSelectProgramDay;
}

describe("CalendarDayPillRow", () => {
  it("renders all 5 days", () => {
    renderRow();
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("applies a selected style to the selected day", () => {
    renderRow();
    expect(screen.getAllByRole("button")[0].getAttribute("data-style")).toContain("backgroundColor");
  });

  it("disables skipped days", () => {
    renderRow();
    expect(screen.getAllByRole("button")[3]).toBeDisabled();
  });

  it("does not select a concrete program day for a rest day", () => {
    const onSelect = renderRow();
    fireEvent.click(screen.getAllByRole("button")[2]);
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });

  it("calls onSelectProgramDay with the training day id", () => {
    const onSelect = renderRow();
    fireEvent.click(screen.getAllByRole("button")[1]);
    expect(onSelect).toHaveBeenCalledWith("day-2");
  });

  it("renders a complete-status pill without disabling the day", () => {
    renderRow();
    expect(screen.getAllByRole("button")[1]).not.toBeDisabled();
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});
