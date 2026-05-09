import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TodayWorkoutCard } from "./TodayWorkoutCard";

describe("TodayWorkoutCard", () => {
  it("renders the day label and meta line with type and duration", () => {
    render(
      <TodayWorkoutCard
        label="Day 1"
        type="Strength"
        sessionDuration={45}
        onStartWorkout={() => {}}
      />,
    );
    expect(screen.getByText("Day 1")).toBeInTheDocument();
    expect(screen.getByText("Strength · 45 min")).toBeInTheDocument();
  });

  it("omits duration from meta line when sessionDuration is null", () => {
    render(
      <TodayWorkoutCard
        label="Day 2"
        type="Hypertrophy"
        sessionDuration={null}
        onStartWorkout={() => {}}
      />,
    );
    expect(screen.getByText("Hypertrophy")).toBeInTheDocument();
    expect(screen.queryByText(/min/)).not.toBeInTheDocument();
  });

  it("fires onStartWorkout when the Start Workout button is pressed", () => {
    const onStart = vi.fn();
    render(
      <TodayWorkoutCard
        label="Day 3"
        type="Conditioning"
        sessionDuration={30}
        onStartWorkout={onStart}
      />,
    );
    fireEvent.click(screen.getByText("Start Workout"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
