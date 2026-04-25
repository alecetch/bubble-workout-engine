import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SegmentCard } from "./SegmentCard";
import type { ProgramDayFullResponse } from "../../api/programViewer";

type Segment = ProgramDayFullResponse["segments"][number];
type Exercise = Segment["exercises"][number];

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "ex-1",
    exerciseId: "bb-squat",
    name: "Barbell Squat",
    sets: 3,
    reps: "5-8",
    repsUnit: "reps",
    intensity: null,
    tempo: null,
    restSeconds: null,
    notes: null,
    equipment: null,
    isLoadable: true,
    guidelineLoad: null,
    progressionRecommendation: null,
    adaptationDecision: null,
    ...overrides,
  };
}

function makeSegment(
  segmentOverrides: Partial<Omit<Segment, "exercises">> = {},
  exercises: Exercise[] = [makeExercise()],
): Segment {
  return {
    id: "seg-1",
    segmentType: "single",
    segmentTypeLabel: null,
    segmentName: "Main Work",
    orderInDay: 1,
    rounds: 1,
    segmentDurationSeconds: null,
    segmentDurationMmss: null,
    notes: null,
    postSegmentRestSec: 0,
    exercises,
    ...segmentOverrides,
  };
}

function renderCard(
  props: Partial<{
    segment: Segment;
    isLogged: boolean;
    onLogSegment: () => void;
    onSwapExercise: (id: string, name: string) => void;
    onViewDecisionHistory: (exerciseId: string, name: string, programExerciseId: string) => void;
  }> = {},
) {
  return render(
    <SegmentCard
      segment={props.segment ?? makeSegment()}
      isLogged={props.isLogged ?? false}
      onLogSegment={props.onLogSegment ?? vi.fn()}
      onSwapExercise={props.onSwapExercise}
      onViewDecisionHistory={props.onViewDecisionHistory}
    />,
  );
}

describe("SegmentCard adaptation chip integration", () => {
  function makeDecisionExercise(): Exercise {
    return makeExercise({
      adaptationDecision: {
        outcome: "increase_load",
        primaryLever: "load",
        confidence: "high",
        recommendedLoadKg: 80,
        recommendedLoadDeltaKg: 5,
        recommendedRepsTarget: null,
        recommendedRepDelta: null,
        displayChip: "Load increased â†‘",
        displayDetail: "You hit all sets at the top of your rep range.",
        decidedAt: "2026-04-10T18:32:00.000Z",
      },
    });
  }

  it("renders the adaptation chip above the prescription text", () => {
    const segment = makeSegment({}, [makeDecisionExercise()]);
    renderCard({ segment });
    const chipEl = screen.getByText("Load increased â†‘");
    const prescEl = screen.getByText(/3 sets 5-8 reps/);
    expect(
      chipEl.compareDocumentPosition(prescEl) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("calls onViewDecisionHistory when the history link is tapped", () => {
    const onViewDecisionHistory = vi.fn();
    const segment = makeSegment({}, [makeDecisionExercise()]);
    renderCard({ segment, onViewDecisionHistory });
    fireEvent.click(screen.getByRole("button", { name: /Adaptation: Load increased/i }));
    fireEvent.click(screen.getByRole("button", { name: /View full history/i }));
    expect(onViewDecisionHistory).toHaveBeenCalledWith("bb-squat", "Barbell Squat", "ex-1");
  });

  it("collapses the expanded chip when tapping elsewhere on the card", () => {
    const segment = makeSegment({}, [makeDecisionExercise()]);
    renderCard({ segment });
    fireEvent.click(screen.getByRole("button", { name: /Adaptation: Load increased/i }));
    expect(screen.getByText("You hit all sets at the top of your rep range.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("3 sets 5-8 reps"));
    expect(screen.queryByText("You hit all sets at the top of your rep range.")).not.toBeInTheDocument();
  });

  it("keeps only one chip open at a time within the card", () => {
    const segment = makeSegment({}, [
      makeDecisionExercise(),
      {
        ...makeDecisionExercise(),
        id: "ex-2",
        exerciseId: "bb-bench",
        name: "Bench Press",
        adaptationDecision: {
          ...makeDecisionExercise().adaptationDecision!,
          displayChip: "Reps progressing â†‘",
          outcome: "increase_reps",
          displayDetail: "You are ready to push the rep target.",
        },
      },
    ]);
    renderCard({ segment });
    fireEvent.click(screen.getByRole("button", { name: /Adaptation: Load increased/i }));
    expect(screen.getByText("You hit all sets at the top of your rep range.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Adaptation: Reps progressing/i }));
    expect(screen.queryByText("You hit all sets at the top of your rep range.")).not.toBeInTheDocument();
    expect(screen.getByText("You are ready to push the rep target.")).toBeInTheDocument();
  });
});
