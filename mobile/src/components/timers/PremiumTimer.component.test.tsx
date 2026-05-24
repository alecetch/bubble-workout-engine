import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PremiumTimer } from "./PremiumTimer";
import { useSegmentTimer, type UseSegmentTimerResult } from "./useSegmentTimer";

vi.mock("./useSegmentTimer", () => ({
  useSegmentTimer: vi.fn(),
}));

const { adjustRestDurationMock } = vi.hoisted(() => ({
  adjustRestDurationMock: vi.fn(),
}));

vi.mock("../../state/timer/useTimerStore", () => ({
  useTimerStore: Object.assign(vi.fn(), {
    getState: () => ({ adjustRestDuration: adjustRestDurationMock }),
  }),
}));

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Medium: "medium", Light: "light", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success" },
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
    adjustRestDurationMock.mockReset();
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

  it("renders Reset label text in non-compact mode", () => {
    render(<PremiumTimer segmentId="seg-1" />);

    expect(screen.getByText("Reset")).toBeInTheDocument();
  });

  it("renders Adjust chip when suggestedRestSeconds is provided", () => {
    render(<PremiumTimer segmentId="seg-1" suggestedRestSeconds={90} />);

    expect(screen.getByRole("button", { name: "Adjust" })).toBeInTheDocument();
  });

  it("tapping Adjust chip reveals minus and plus adjustment buttons", () => {
    render(<PremiumTimer segmentId="seg-1" suggestedRestSeconds={90} />);

    expect(screen.queryByRole("button", { name: "-" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Adjust" }));

    expect(screen.getByRole("button", { name: "-" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+" })).toBeInTheDocument();
  });

  it("tapping minus calls adjustRestDuration with -15", () => {
    render(<PremiumTimer segmentId="seg-1" suggestedRestSeconds={90} />);

    fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
    fireEvent.click(screen.getByRole("button", { name: "-" }));

    expect(adjustRestDurationMock).toHaveBeenCalledWith("seg-1", -15);
  });

  it("tapping plus calls adjustRestDuration with +15", () => {
    render(<PremiumTimer segmentId="seg-1" suggestedRestSeconds={90} />);

    fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
    fireEvent.click(screen.getByRole("button", { name: "+" }));

    expect(adjustRestDurationMock).toHaveBeenCalledWith("seg-1", 15);
  });
});
