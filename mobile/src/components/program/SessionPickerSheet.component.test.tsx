import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { SessionsByDateItem } from "../../api/activePrograms";
import { SessionPickerSheet } from "./SessionPickerSheet";

function makeSession(overrides: Partial<SessionsByDateItem> = {}): SessionsByDateItem {
  return {
    program_id: "prog-1", program_day_id: "pd-1", program_title: "Strength Block",
    program_type: "strength", is_primary_program: false, day_label: "Week 1 Day 1",
    session_duration_mins: null, is_completed: false, ...overrides,
  };
}
function setup(overrides: Partial<React.ComponentProps<typeof SessionPickerSheet>> = {}) {
  const props = { visible: true, scheduledDate: "2026-04-21", sessions: [makeSession()],
    onSelectSession: vi.fn(), onClose: vi.fn(), ...overrides };
  render(<SessionPickerSheet {...props} />);
  return props;
}

describe("SessionPickerSheet", () => {
  it("does not render the sheet when hidden", () => {
    setup({ visible: false });
    expect(screen.queryByText("Choose a session")).not.toBeInTheDocument();
    expect(screen.queryByText("Strength Block")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Close session picker")).not.toBeInTheDocument();
  });

  it("shows the date, program title and day label", () => {
    setup();
    expect(screen.getByText("2026-04-21")).toBeInTheDocument();
    expect(screen.getByText("Choose a session")).toBeInTheDocument();
    const card = within(screen.getByRole("button", { name: "Strength Block: Week 1 Day 1" }));
    expect(card.getByText("Strength Block")).toBeInTheDocument();
    expect(card.getByText("Week 1 Day 1")).toBeInTheDocument();
  });

  it("renders two cards in caller order even when day labels are reversed", () => {
    setup({ sessions: [makeSession({ day_label: "Week 1 Day 3" }), makeSession({ program_day_id: "pd-2", program_title: "Hyrox Block", day_label: "Week 1 Day 1" })] });
    const cards = screen.getAllByRole("button").filter(element => element.getAttribute("aria-label")?.includes("Block:"));
    expect(cards.map(element => element.getAttribute("aria-label"))).toEqual([
      "Strength Block: Week 1 Day 3", "Hyrox Block: Week 1 Day 1",
    ]);
  });

  it("shows a completed badge only on the completed card", () => {
    setup({ sessions: [makeSession({ is_completed: true }), makeSession({ program_day_id: "pd-2", day_label: "Week 1 Day 2" })] });
    expect(within(screen.getByRole("button", { name: "Strength Block: Week 1 Day 1" })).getByText("Completed")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Strength Block: Week 1 Day 2" })).queryByText("Completed")).not.toBeInTheDocument();
  });

  it("does not show a completed badge for an incomplete session", () => {
    setup();
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });

  it("closes before selecting the tapped program day, rather than the program", () => {
    const events: string[] = [];
    const onClose = vi.fn(() => { events.push("close"); });
    const onSelectSession = vi.fn((id: string) => { events.push(`select:${id}`); });
    setup({ sessions: [makeSession(), makeSession({ program_day_id: "pd-2", day_label: "Week 1 Day 2" })], onClose, onSelectSession });
    fireEvent.click(screen.getByRole("button", { name: "Strength Block: Week 1 Day 2" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelectSession).toHaveBeenCalledTimes(1);
    expect(onSelectSession).toHaveBeenCalledWith("pd-2");
    expect(events).toEqual(["close", "select:pd-2"]);
  });

  it("dismisses via the overlay without selecting a session", () => {
    const { onClose, onSelectSession } = setup();
    fireEvent.click(screen.getByLabelText("Close session picker"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelectSession).not.toHaveBeenCalled();
  });

  it("keeps an empty sheet dismissible without inventing session cards", () => {
    const { onClose, onSelectSession } = setup({ sessions: [] });
    expect(screen.getByText("Choose a session")).toBeInTheDocument();
    expect(screen.queryByText("Strength Block")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Close session picker"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelectSession).not.toHaveBeenCalled();
  });

  it("shows optional duration and primary indicators only on the matching card", () => {
    setup({ sessions: [makeSession({ session_duration_mins: 45, is_primary_program: true }), makeSession({ program_day_id: "pd-2", day_label: "Week 1 Day 2" })] });
    const primary = within(screen.getByRole("button", { name: "Strength Block: Week 1 Day 1" }));
    const secondary = within(screen.getByRole("button", { name: "Strength Block: Week 1 Day 2" }));
    expect(primary.getByText("45 min")).toBeInTheDocument();
    expect(primary.getByText("\u2605")).toBeInTheDocument();
    expect(secondary.queryByText(/ min$/)).not.toBeInTheDocument();
    expect(secondary.queryByText("\u2605")).not.toBeInTheDocument();
  });
});
