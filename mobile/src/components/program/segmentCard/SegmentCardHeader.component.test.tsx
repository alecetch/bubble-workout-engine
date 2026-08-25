import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { SegmentCardHeader } from "./SegmentCardHeader";

vi.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock("../../interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

function renderHeader(props: Partial<React.ComponentProps<typeof SegmentCardHeader>> = {}) {
  return render(
    <SegmentCardHeader
      segmentName={props.segmentName ?? "Strength Block"}
      segmentTypeBadgeLabel={props.segmentTypeBadgeLabel ?? "Superset"}
      notesText={props.notesText ?? "Keep reps crisp"}
      initialDurationSeconds={props.initialDurationSeconds ?? 300}
      secondsLeft={props.secondsLeft ?? 300}
      timerRunning={props.timerRunning ?? false}
      onTimerPress={props.onTimerPress ?? vi.fn()}
      isLogged={props.isLogged ?? false}
    />,
  );
}

describe("SegmentCardHeader", () => {
  it("renders segmentName and the Logged badge only when isLogged is true", () => {
    const { rerender } = renderHeader({ isLogged: false });

    expect(screen.getByText("Strength Block")).toBeInTheDocument();
    expect(screen.getByText("Logged").parentElement).toHaveStyle({ opacity: 0 });

    rerender(
      <SegmentCardHeader
        segmentName="Strength Block"
        segmentTypeBadgeLabel="Superset"
        notesText="Keep reps crisp"
        initialDurationSeconds={300}
        secondsLeft={300}
        timerRunning={false}
        onTimerPress={vi.fn()}
        isLogged
      />,
    );

    expect(screen.getByText("Logged").parentElement).not.toHaveStyle({ opacity: 0 });
  });

  it("calls onTimerPress when the duration chip is tapped", () => {
    const onTimerPress = vi.fn();
    renderHeader({ onTimerPress });

    fireEvent.click(screen.getByRole("button", { name: "Start segment timer" }));

    expect(onTimerPress).toHaveBeenCalledTimes(1);
  });
});
