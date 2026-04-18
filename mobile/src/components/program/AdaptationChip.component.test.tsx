import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdaptationChip } from "./AdaptationChip";
import type { AdaptationDecision } from "../../api/programViewer";

function makeDecision(overrides: Partial<AdaptationDecision> = {}): AdaptationDecision {
  return {
    outcome: "increase_load",
    primaryLever: "load",
    confidence: "high",
    recommendedLoadKg: 80,
    recommendedLoadDeltaKg: 5,
    recommendedRepsTarget: null,
    recommendedRepDelta: null,
    displayChip: "Load increased ↑",
    displayDetail: "You hit all sets at the top of your rep range.",
    decidedAt: "2026-04-10T18:32:00.000Z",
    ...overrides,
  };
}

describe("AdaptationChip — visibility rules", () => {
  it("renders the chip text for increase_load", () => {
    render(<AdaptationChip decision={makeDecision()} />);
    expect(screen.getByText("Load increased ↑")).toBeInTheDocument();
  });

  it("renders nothing for hold outcome", () => {
    const { container } = render(
      <AdaptationChip
        decision={makeDecision({ outcome: "hold", displayChip: "Holding steady" })}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the chip for deload_local", () => {
    render(
      <AdaptationChip
        decision={makeDecision({ outcome: "deload_local", displayChip: "Deload this week" })}
      />
    );
    expect(screen.getByText("Deload this week")).toBeInTheDocument();
  });

  it("renders the chip for increase_reps", () => {
    render(
      <AdaptationChip
        decision={makeDecision({ outcome: "increase_reps", displayChip: "Reps progressing ↑" })}
      />
    );
    expect(screen.getByText("Reps progressing ↑")).toBeInTheDocument();
  });

  it("renders the chip for increase_sets", () => {
    render(
      <AdaptationChip
        decision={makeDecision({ outcome: "increase_sets", displayChip: "Sets increasing ↑" })}
      />
    );
    expect(screen.getByText("Sets increasing ↑")).toBeInTheDocument();
  });

  it("renders the chip for reduce_rest", () => {
    render(
      <AdaptationChip
        decision={makeDecision({ outcome: "reduce_rest", displayChip: "Rest reduced ↓" })}
      />
    );
    expect(screen.getByText("Rest reduced ↓")).toBeInTheDocument();
  });
});

describe("AdaptationChip — tap-to-expand detail card", () => {
  it("detail card is hidden by default", () => {
    render(<AdaptationChip decision={makeDecision()} />);
    expect(
      screen.queryByText("You hit all sets at the top of your rep range.")
    ).not.toBeInTheDocument();
  });

  it("expands the detail card on first tap", () => {
    render(<AdaptationChip decision={makeDecision()} />);
    fireEvent.click(screen.getByRole("button", { name: /Adaptation: Load increased/ }));
    expect(
      screen.getByText("You hit all sets at the top of your rep range.")
    ).toBeInTheDocument();
  });

  it("collapses the detail card on second tap", () => {
    render(<AdaptationChip decision={makeDecision()} />);
    const chip = screen.getByRole("button", { name: /Adaptation: Load increased/ });
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(
      screen.queryByText("You hit all sets at the top of your rep range.")
    ).not.toBeInTheDocument();
  });

  it("shows confidence with first letter capitalised", () => {
    render(<AdaptationChip decision={makeDecision({ confidence: "high" })} />);
    fireEvent.click(screen.getByRole("button", { name: /Adaptation/ }));
    expect(screen.getByText("Confidence: High")).toBeInTheDocument();
  });

  it("shows Confidence: Medium when confidence is medium", () => {
    render(<AdaptationChip decision={makeDecision({ confidence: "medium" })} />);
    fireEvent.click(screen.getByRole("button", { name: /Adaptation/ }));
    expect(screen.getByText("Confidence: Medium")).toBeInTheDocument();
  });

  it("shows Confidence: Low when confidence is low", () => {
    render(<AdaptationChip decision={makeDecision({ confidence: "low" })} />);
    fireEvent.click(screen.getByRole("button", { name: /Adaptation/ }));
    expect(screen.getByText("Confidence: Low")).toBeInTheDocument();
  });

  it("omits the confidence line when confidence is null", () => {
    render(<AdaptationChip decision={makeDecision({ confidence: null })} />);
    fireEvent.click(screen.getByRole("button", { name: /Adaptation/ }));
    expect(screen.queryByText(/Confidence:/)).not.toBeInTheDocument();
  });

  it("omits detail text when displayDetail is null", () => {
    render(<AdaptationChip decision={makeDecision({ displayDetail: null })} />);
    fireEvent.click(screen.getByRole("button", { name: /Adaptation/ }));
    expect(screen.getByText("Confidence: High")).toBeInTheDocument();
    expect(
      screen.queryByText("You hit all sets at the top of your rep range.")
    ).not.toBeInTheDocument();
  });
});

describe("AdaptationChip — View full history link", () => {
  it("shows the history link when onViewHistory is provided", () => {
    render(<AdaptationChip decision={makeDecision()} onViewHistory={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Adaptation/ }));
    expect(screen.getByText("View full history ->")).toBeInTheDocument();
  });

  it("does not show the history link when onViewHistory is omitted", () => {
    render(<AdaptationChip decision={makeDecision()} />);
    fireEvent.click(screen.getByRole("button", { name: /Adaptation/ }));
    expect(screen.queryByText("View full history ->")).not.toBeInTheDocument();
  });

  it("calls onViewHistory when the link is tapped", () => {
    const onViewHistory = vi.fn();
    render(<AdaptationChip decision={makeDecision()} onViewHistory={onViewHistory} />);
    fireEvent.click(screen.getByRole("button", { name: /Adaptation/ }));
    fireEvent.click(screen.getByText("View full history ->"));
    expect(onViewHistory).toHaveBeenCalledTimes(1);
  });

  it("does not call onViewHistory when tapping the chip itself", () => {
    const onViewHistory = vi.fn();
    render(<AdaptationChip decision={makeDecision()} onViewHistory={onViewHistory} />);
    fireEvent.click(screen.getByRole("button", { name: /Adaptation/ }));
    expect(onViewHistory).not.toHaveBeenCalled();
  });
});
