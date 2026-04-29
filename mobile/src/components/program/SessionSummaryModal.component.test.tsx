import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionSummaryModal } from "./SessionSummaryModal";

function defaultProps(overrides: Partial<React.ComponentProps<typeof SessionSummaryModal>> = {}) {
  return {
    visible: true,
    totalVolumeKg: 5000,
    totalSets: 12,
    exerciseCount: 4,
    prHits: [],
    streakDays: 3,
    adaptedExercises: [],
    onDismiss: vi.fn(),
    ...overrides,
  };
}

describe("SessionSummaryModal", () => {
  it("renders core session content", () => {
    render(<SessionSummaryModal {...defaultProps()} />);

    expect(screen.getByText("Session complete")).toBeInTheDocument();
    expect(screen.getByText(/5\.0t/)).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders adapted this session section when adaptedExercises is non-empty", () => {
    render(
      <SessionSummaryModal
        {...defaultProps({
          adaptedExercises: [{ name: "Bench Press", displayChip: "Load increased ↑" }],
        })}
      />,
    );

    expect(screen.getByText(/adapted this session/i)).toBeInTheDocument();
    expect(screen.getByText("Bench Press")).toBeInTheDocument();
    expect(screen.getByText("Load increased ↑")).toBeInTheDocument();
  });

  it("does not render adapted this session section when adaptedExercises is empty", () => {
    render(<SessionSummaryModal {...defaultProps({ adaptedExercises: [] })} />);

    expect(screen.queryByText(/adapted this session/i)).not.toBeInTheDocument();
  });

  it("does not render adapted this session section when adaptedExercises prop is omitted", () => {
    const { adaptedExercises: _omit, ...propsWithoutAdapted } = defaultProps();

    render(<SessionSummaryModal {...propsWithoutAdapted} />);

    expect(screen.queryByText(/adapted this session/i)).not.toBeInTheDocument();
  });

  it("renders PR banner when prHits is non-empty", () => {
    render(<SessionSummaryModal {...defaultProps({ prHits: ["Bench Press"] })} />);

    expect(screen.getByText(/new pr/i)).toBeInTheDocument();
    expect(screen.getByText(/Bench Press/)).toBeInTheDocument();
  });

  it("calls onDismiss when Done is pressed", () => {
    const onDismiss = vi.fn();

    render(<SessionSummaryModal {...defaultProps({ onDismiss })} />);

    fireEvent.click(screen.getByText("Done"));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
