import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { CalendarDay, CalendarSession } from "../../api/activePrograms";
import { CombinedCalendar } from "./CombinedCalendar";

function makeSession(overrides: Partial<CalendarSession> = {}): CalendarSession {
  return {
    program_id: "prog-1", program_day_id: "pd-1", program_type: "strength",
    program_title: "Strength Block", is_primary_program: true,
    day_label: "Week 1 Day 1", is_completed: false, ...overrides,
  };
}
function makeDay(overrides: Partial<CalendarDay> = {}): CalendarDay {
  return { scheduled_date: "2026-04-21", sessions: [makeSession()], ...overrides };
}

describe("CombinedCalendar", () => {
  it("shows the empty-state message without day buttons", () => {
    render(<CombinedCalendar days={[]} onDayPress={vi.fn()} />);
    expect(screen.getByText("No sessions scheduled in this range.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([
    ["strength", "#3B82F6"], ["hypertrophy", "#22C55E"],
    ["conditioning", "#F59E0B"], ["hyrox", "#EF4444"], ["unknown", "#6B7280"],
  ])("renders an accessible %s dot with its expected colour", (program_type, colour) => {
    render(<CombinedCalendar days={[makeDay({ sessions: [makeSession({ program_type })] })]} onDayPress={vi.fn()} />);
    expect(screen.getByLabelText(`${program_type} session`)).toHaveStyle({ backgroundColor: colour });
    expect(screen.getByRole("button", { name: "2026-04-21, 1 session" })).toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("renders both dots and the count for two sessions", () => {
    render(<CombinedCalendar days={[makeDay({ sessions: [makeSession(), makeSession({ program_id: "prog-2", program_type: "hypertrophy" })] })]} onDayPress={vi.fn()} />);
    const day = within(screen.getByRole("button", { name: "2026-04-21, 2 sessions" }));
    expect(day.getAllByLabelText(/ session$/)).toHaveLength(2);
    expect(day.getByLabelText("strength session")).toBeInTheDocument();
    expect(day.getByLabelText("hypertrophy session")).toBeInTheDocument();
    expect(day.getByText("2")).toBeInTheDocument();
  });

  it("caps four sessions at three dots while showing the full count", () => {
    const sessions = ["strength", "hypertrophy", "conditioning", "hyrox"].map((program_type, index) => makeSession({ program_type, program_id: `prog-${index}` }));
    render(<CombinedCalendar days={[makeDay({ sessions })]} onDayPress={vi.fn()} />);
    const day = within(screen.getByRole("button", { name: "2026-04-21, 4 sessions" }));
    expect(day.getAllByLabelText(/ session$/)).toHaveLength(3);
    expect(day.queryByLabelText("hyrox session")).not.toBeInTheDocument();
    expect(day.getByText("4")).toBeInTheDocument();
  });

  it("passes the exact tapped day when multiple days are displayed", () => {
    const days = [makeDay(), makeDay({ scheduled_date: "2026-04-22" })];
    const onDayPress = vi.fn();
    render(<CombinedCalendar days={days} onDayPress={onDayPress} />);
    expect(screen.getByText("21")).toBeInTheDocument();
    expect(screen.getByText("22")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2026-04-22, 1 session" }));
    expect(onDayPress).toHaveBeenCalledTimes(1);
    expect(onDayPress).toHaveBeenCalledWith(days[1]);
    expect(onDayPress.mock.calls[0][0]).toBe(days[1]);
  });

  it("renders a day with no sessions without a dot or count badge", () => {
    render(<CombinedCalendar days={[makeDay({ sessions: [] })]} onDayPress={vi.fn()} />);
    const day = within(screen.getByRole("button", { name: "2026-04-21, 0 sessions" }));
    expect(day.getByText("21")).toBeInTheDocument();
    expect(day.queryByLabelText(/ session$/)).not.toBeInTheDocument();
    expect(day.queryByText("0")).not.toBeInTheDocument();
  });
});
