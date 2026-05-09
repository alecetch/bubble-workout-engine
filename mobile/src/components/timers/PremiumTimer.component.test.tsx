import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PremiumTimer } from "./PremiumTimer";
import { useSegmentTimer, type UseSegmentTimerResult } from "./useSegmentTimer";

vi.mock("./useSegmentTimer", () => ({
  useSegmentTimer: vi.fn(),
}));

vi.mock("../interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

vi.mock("./RingTimer", () => ({
  RingTimer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const useSegmentTimerMock = vi.mocked(useSegmentTimer);

const onStartPauseMock = vi.fn();
const onResetMock = vi.fn();
const onSwitchModeMock = vi.fn();

function mockTimer(overrides: Partial<UseSegmentTimerResult> = {}) {
  useSegmentTimerMock.mockReturnValue({
    activeMode: "segment",
    displaySeconds: 0,
    progress: 1,
    ringColor: "#22c55e",
    isRunning: false,
    segmentFinished: false,
    restFinished: false,
    hasRest: true,
    canSwitchToRest: true,
    onStartPause: onStartPauseMock,
    onReset: onResetMock,
    onSwitchMode: onSwitchModeMock,
    ...overrides,
  });
}

describe("PremiumTimer", () => {
  beforeEach(() => {
    onStartPauseMock.mockReset();
    onResetMock.mockReset();
    onSwitchModeMock.mockReset();
    mockTimer();
  });

  it('renders formatted time "MM:SS"', () => {
    mockTimer({ displaySeconds: 90 });

    render(<PremiumTimer segmentId="seg-1" />);

    expect(screen.getByText("01:30")).toBeInTheDocument();
  });

  it("shows correct mode badge for each mode", () => {
    const { rerender } = render(<PremiumTimer segmentId="seg-1" />);
    expect(screen.getByLabelText("STOPWATCH 00:00 remaining")).toBeInTheDocument();

    mockTimer({ activeMode: "segment", displaySeconds: 45 });
    rerender(<PremiumTimer segmentId="seg-1" initialDurationSeconds={60} />);
    expect(screen.getByLabelText("SEGMENT 00:45 remaining")).toBeInTheDocument();

    mockTimer({ activeMode: "rest", displaySeconds: 30 });
    rerender(<PremiumTimer segmentId="seg-1" suggestedRestSeconds={60} />);
    expect(screen.getByLabelText("REST 00:30 remaining")).toBeInTheDocument();
  });

  it("calls onStartPause when start control is tapped", () => {
    render(<PremiumTimer segmentId="seg-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Start segment timer" }));

    expect(onStartPauseMock).toHaveBeenCalledTimes(1);
  });

  it("calls onReset when reset is tapped", () => {
    render(<PremiumTimer segmentId="seg-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Reset segment timer" }));

    expect(onResetMock).toHaveBeenCalledTimes(1);
  });

  it('shows "Rest done!" hint when rest mode is complete', () => {
    mockTimer({
      activeMode: "rest",
      displaySeconds: 0,
      restFinished: true,
    });

    render(<PremiumTimer segmentId="seg-1" suggestedRestSeconds={60} />);

    expect(screen.getByText("Rest done!")).toBeInTheDocument();
  });
});
