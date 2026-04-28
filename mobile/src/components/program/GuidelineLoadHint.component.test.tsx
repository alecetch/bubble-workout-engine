import React from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach } from "vitest";
import { GuidelineLoadHint } from "./GuidelineLoadHint";
import type { ProgramDayFullResponse } from "../../api/programViewer";

afterEach(() => {
  cleanup();
});

type GuidelineLoad = NonNullable<
  ProgramDayFullResponse["segments"][number]["exercises"][number]["guidelineLoad"]
>;

function makeGuidelineLoad(overrides: Partial<GuidelineLoad> = {}): GuidelineLoad {
  return {
    value: 80,
    unit: "kg",
    confidence: "high",
    source: "manual",
    reasoning: ["Based on your last anchor lift of 80 kg × 5 reps."],
    set1Rule: "Start at 70% of your estimated 1RM.",
    ...overrides,
  };
}

describe("GuidelineLoadHint — summary line", () => {
  it("renders suggested start weight for kg unit", () => {
    render(<GuidelineLoadHint guidelineLoad={makeGuidelineLoad({ value: 80, unit: "kg" })} />);
    expect(screen.getByText(/Suggested start: 80 kg/)).toBeInTheDocument();
  });

  it("renders per-hand format for kg_per_hand unit", () => {
    render(
      <GuidelineLoadHint guidelineLoad={makeGuidelineLoad({ value: 20, unit: "kg_per_hand" })} />
    );
    expect(screen.getByText(/20 kg \/ hand/)).toBeInTheDocument();
  });

  it("renders per-side format for kg_per_side unit", () => {
    render(
      <GuidelineLoadHint guidelineLoad={makeGuidelineLoad({ value: 15, unit: "kg_per_side" })} />
    );
    expect(screen.getByText(/15 kg \/ side/)).toBeInTheDocument();
  });

  it("renders Bodyweight for bodyweight unit", () => {
    render(
      <GuidelineLoadHint guidelineLoad={makeGuidelineLoad({ value: 0, unit: "bodyweight" })} />
    );
    expect(screen.getByText(/Bodyweight/)).toBeInTheDocument();
  });

  it("renders High confidence label", () => {
    render(<GuidelineLoadHint guidelineLoad={makeGuidelineLoad({ confidence: "high" })} />);
    expect(screen.getByText(/High confidence/)).toBeInTheDocument();
  });

  it("renders Medium confidence label", () => {
    render(<GuidelineLoadHint guidelineLoad={makeGuidelineLoad({ confidence: "medium" })} />);
    expect(screen.getByText(/Medium confidence/)).toBeInTheDocument();
  });

  it("renders Low confidence label for rank_default source", () => {
    render(
      <GuidelineLoadHint
        guidelineLoad={makeGuidelineLoad({ source: "rank_default", confidence: "low" })}
      />
    );
    expect(screen.getByText(/Low confidence/)).toBeInTheDocument();
  });
});

describe("GuidelineLoadHint — tap-to-expand detail card", () => {
  it("detail card is hidden before tap", () => {
    render(<GuidelineLoadHint guidelineLoad={makeGuidelineLoad()} />);
    expect(screen.queryByText("Start at 70% of your estimated 1RM.")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Based on your last anchor lift of 80 kg × 5 reps.")
    ).not.toBeInTheDocument();
  });

  it("expands to show set1Rule and reasoning after tap", () => {
    render(<GuidelineLoadHint guidelineLoad={makeGuidelineLoad()} />);
    fireEvent.click(screen.getByText(/Suggested start:/));
    expect(screen.getByText("Start at 70% of your estimated 1RM.")).toBeInTheDocument();
    expect(
      screen.getByText("Based on your last anchor lift of 80 kg × 5 reps.")
    ).toBeInTheDocument();
  });

  it("collapses on second tap", () => {
    render(<GuidelineLoadHint guidelineLoad={makeGuidelineLoad()} />);
    const trigger = screen.getByText(/Suggested start:/);
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByText("Start at 70% of your estimated 1RM.")).not.toBeInTheDocument();
  });

  it("renders multiple reasoning lines", () => {
    render(
      <GuidelineLoadHint
        guidelineLoad={makeGuidelineLoad({
          reasoning: ["Reason one.", "Reason two.", "Reason three."],
        })}
      />
    );
    fireEvent.click(screen.getByText(/Suggested start:/));
    expect(screen.getByText("Reason one.")).toBeInTheDocument();
    expect(screen.getByText("Reason two.")).toBeInTheDocument();
    expect(screen.getByText("Reason three.")).toBeInTheDocument();
  });

  it("renders empty reasoning array without crashing", () => {
    render(
      <GuidelineLoadHint guidelineLoad={makeGuidelineLoad({ reasoning: [] })} />
    );
    fireEvent.click(screen.getByText(/Suggested start:/));
    expect(screen.getByText("Start at 70% of your estimated 1RM.")).toBeInTheDocument();
  });

  it("omits set1Rule when undefined", () => {
    render(
      <GuidelineLoadHint guidelineLoad={makeGuidelineLoad({ set1Rule: undefined })} />
    );
    fireEvent.click(screen.getByText(/Suggested start:/));
    expect(screen.queryByText("Start at 70% of your estimated 1RM.")).not.toBeInTheDocument();
    expect(
      screen.getByText("Based on your last anchor lift of 80 kg × 5 reps.")
    ).toBeInTheDocument();
  });

  it("renders null reasoning gracefully", () => {
    render(
      <GuidelineLoadHint guidelineLoad={makeGuidelineLoad({ reasoning: undefined })} />
    );
    fireEvent.click(screen.getByText(/Suggested start:/));
    // No crash — set1Rule is shown, no reasoning lines
    expect(screen.getByText("Start at 70% of your estimated 1RM.")).toBeInTheDocument();
  });
});
