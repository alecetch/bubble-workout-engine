import React from "react";
import { render, screen } from "@testing-library/react";
import { WeekProgressBadge } from "./WeekProgressBadge";

describe("WeekProgressBadge", () => {
  it("renders the week label", () => {
    render(
      <WeekProgressBadge
        weekNumber={2}
        totalWeeks={4}
        completedDaysThisWeek={1}
        totalDaysThisWeek={3}
      />,
    );
    expect(screen.getByText("Week 2 of 4")).toBeInTheDocument();
  });

  it("renders the days progress label", () => {
    render(
      <WeekProgressBadge
        weekNumber={1}
        totalWeeks={6}
        completedDaysThisWeek={2}
        totalDaysThisWeek={3}
      />,
    );
    expect(screen.getByText("2/3 days this week")).toBeInTheDocument();
  });

  it("omits the days label when totalDaysThisWeek is 0", () => {
    render(
      <WeekProgressBadge
        weekNumber={1}
        totalWeeks={6}
        completedDaysThisWeek={0}
        totalDaysThisWeek={0}
      />,
    );
    expect(screen.queryByText(/days this week/)).not.toBeInTheDocument();
  });
});
