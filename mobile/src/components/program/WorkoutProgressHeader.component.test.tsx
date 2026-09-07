import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkoutProgressHeader } from "./WorkoutProgressHeader";

vi.mock("../interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

describe("WorkoutProgressHeader", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders exercise and set progress", () => {
    render(
      <WorkoutProgressHeader
        completedExercises={2}
        totalExercises={5}
        loggedSets={6}
        totalSets={14}
        startedAtMs={null}
        showJumpToNext
        onJumpToNext={vi.fn()}
      />,
    );

    expect(screen.getByText("2 of 5 exercises")).toBeInTheDocument();
    expect(screen.getByText("6 of 14 sets")).toBeInTheDocument();
  });

  it("renders no elapsed time when startedAtMs is null", () => {
    render(
      <WorkoutProgressHeader
        completedExercises={0}
        totalExercises={2}
        loggedSets={0}
        totalSets={6}
        startedAtMs={null}
        showJumpToNext={false}
      />,
    );

    expect(screen.queryByText(/\d\d:\d\d/)).not.toBeInTheDocument();
  });

  it("updates elapsed time once started", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T10:00:00.000Z"));

    render(
      <WorkoutProgressHeader
        completedExercises={0}
        totalExercises={2}
        loggedSets={0}
        totalSets={6}
        startedAtMs={Date.now()}
        showJumpToNext={false}
      />,
    );

    expect(screen.getByText("00:00")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("00:03")).toBeInTheDocument();
  });

  it("hides the jump button when disabled", () => {
    render(
      <WorkoutProgressHeader
        completedExercises={2}
        totalExercises={2}
        loggedSets={6}
        totalSets={6}
        startedAtMs={null}
        showJumpToNext={false}
        onJumpToNext={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Jump to next exercise" })).not.toBeInTheDocument();
  });

  it("calls onJumpToNext when pressed", () => {
    const onJumpToNext = vi.fn();
    render(
      <WorkoutProgressHeader
        completedExercises={1}
        totalExercises={2}
        loggedSets={3}
        totalSets={6}
        startedAtMs={null}
        showJumpToNext
        onJumpToNext={onJumpToNext}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Jump to next exercise" }));

    expect(onJumpToNext).toHaveBeenCalledTimes(1);
  });
});
