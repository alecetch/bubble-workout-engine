import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdaptationChip } from "./AdaptationChip";
import { buildAdaptationDecision } from "../../__test-utils__";

describe("AdaptationChip visibility rules", () => {
  it("renders the chip text for increase_load", () => {
    render(<AdaptationChip decision={buildAdaptationDecision()} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("Load increased ↑")).toBeInTheDocument();
  });

  it("renders nothing for hold outcome", () => {
    const { container } = render(
      <AdaptationChip
        decision={buildAdaptationDecision({ outcome: "hold", displayChip: "Holding steady" })}
        expanded={false}
        onToggle={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("AdaptationChip controlled expansion", () => {
  it("hides the detail card when expanded is false", () => {
    render(<AdaptationChip decision={buildAdaptationDecision()} expanded={false} onToggle={() => {}} />);
    expect(screen.queryByText("You hit all sets at the top of your rep range.")).not.toBeInTheDocument();
  });

  it("shows the detail card when expanded is true", () => {
    render(<AdaptationChip decision={buildAdaptationDecision()} expanded onToggle={() => {}} />);
    expect(screen.getByText("You hit all sets at the top of your rep range.")).toBeInTheDocument();
  });

  it("calls onToggle when the chip is tapped", () => {
    const onToggle = vi.fn();
    render(<AdaptationChip decision={buildAdaptationDecision()} expanded={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: /Adaptation: Load increased/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows confidence with first letter capitalised", () => {
    render(<AdaptationChip decision={buildAdaptationDecision({ confidence: "medium" })} expanded onToggle={() => {}} />);
    expect(screen.getByText("Confidence: Medium")).toBeInTheDocument();
  });

  it("omits the confidence line when confidence is null", () => {
    render(<AdaptationChip decision={buildAdaptationDecision({ confidence: null })} expanded onToggle={() => {}} />);
    expect(screen.queryByText(/Confidence:/)).not.toBeInTheDocument();
  });
});

describe("AdaptationChip history link", () => {
  it("shows the history link when onViewHistory is provided", () => {
    render(
      <AdaptationChip
        decision={buildAdaptationDecision()}
        expanded
        onToggle={() => {}}
        onViewHistory={vi.fn()}
      />,
    );
    expect(screen.getByText("View full history →")).toBeInTheDocument();
  });

  it("does not show the history link when onViewHistory is omitted", () => {
    render(<AdaptationChip decision={buildAdaptationDecision()} expanded onToggle={() => {}} />);
    expect(screen.queryByText("View full history →")).not.toBeInTheDocument();
  });

  it("calls onViewHistory when the link is tapped", () => {
    const onViewHistory = vi.fn();
    render(
      <AdaptationChip
        decision={buildAdaptationDecision()}
        expanded
        onToggle={() => {}}
        onViewHistory={onViewHistory}
      />,
    );
    fireEvent.click(screen.getByText("View full history →"));
    expect(onViewHistory).toHaveBeenCalledTimes(1);
  });
});
