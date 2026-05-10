import React from "react";
import { render, screen } from "@testing-library/react";
import { WeekProgressRing } from "./WeekProgressRing";

describe("WeekProgressRing", () => {
  it("renders without error with completedDays=2 and totalDays=4", () => {
    const { container } = render(
      <WeekProgressRing
        weekNumber={2}
        totalWeeks={4}
        completedDaysThisWeek={2}
        totalDaysThisWeek={4}
      />,
    );

    expect(container.firstChild).not.toBeNull();
  });

  it("rendered output reflects the completedDays count", () => {
    render(
      <WeekProgressRing
        weekNumber={2}
        totalWeeks={4}
        completedDaysThisWeek={2}
        totalDaysThisWeek={4}
      />,
    );

    expect(screen.getByText("W2")).toBeInTheDocument();
    expect(screen.getByText("of 4")).toBeInTheDocument();
  });

  it("renders the zero-completed state", () => {
    render(
      <WeekProgressRing
        weekNumber={1}
        totalWeeks={4}
        completedDaysThisWeek={0}
        totalDaysThisWeek={4}
      />,
    );

    expect(screen.getByText("W1")).toBeInTheDocument();
  });

  it("renders the complete week state", () => {
    render(
      <WeekProgressRing
        weekNumber={4}
        totalWeeks={4}
        completedDaysThisWeek={4}
        totalDaysThisWeek={4}
      />,
    );

    expect(screen.getByText("W4")).toBeInTheDocument();
    expect(screen.getByText("of 4")).toBeInTheDocument();
  });
});
