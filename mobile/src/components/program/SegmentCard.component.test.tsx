import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SegmentCard } from "./SegmentCard";
import type { ProgramDayFullResponse } from "../../api/programViewer";

// PremiumTimer has a stateful timer machine irrelevant to these tests — stub it out.
vi.mock("../timers/PremiumTimer", () => ({
  PremiumTimer: () => null,
}));

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

// ── GuidelineLoadHint guard ───────────────────────────────────────────────────

describe("SegmentCard — GuidelineLoadHint guard", () => {
  it("does not render GuidelineLoadHint when isLogged is true, even with a valid guidelineLoad", () => {
    const segment = makeSegment({}, [
      makeExercise({
        guidelineLoad: { value: 80, unit: "kg", confidence: "high", source: "manual" },
      }),
    ]);
    renderCard({ segment, isLogged: true });
    expect(screen.queryByText(/Suggested start:/)).not.toBeInTheDocument();
  });

  it("renders GuidelineLoadHint when isLogged is false and guidelineLoad.value > 0", () => {
    const segment = makeSegment({}, [
      makeExercise({
        guidelineLoad: { value: 80, unit: "kg", confidence: "high", source: "manual" },
      }),
    ]);
    renderCard({ segment, isLogged: false });
    expect(screen.getByText(/Suggested start: 80 kg/)).toBeInTheDocument();
  });

  it("does not render GuidelineLoadHint when guidelineLoad.value is 0", () => {
    const segment = makeSegment({}, [
      makeExercise({
        guidelineLoad: { value: 0, unit: "kg", confidence: "low", source: "rank_default" },
      }),
    ]);
    renderCard({ segment, isLogged: false });
    expect(screen.queryByText(/Suggested start:/)).not.toBeInTheDocument();
  });

  it("does not render GuidelineLoadHint when guidelineLoad is null", () => {
    const segment = makeSegment({}, [makeExercise({ guidelineLoad: null })]);
    renderCard({ segment, isLogged: false });
    expect(screen.queryByText(/Suggested start:/)).not.toBeInTheDocument();
  });

  it("renders GuidelineLoadHint from progressionRecommendation when recommendedLoadKg > 0", () => {
    const segment = makeSegment({}, [
      makeExercise({
        guidelineLoad: null,
        progressionRecommendation: {
          outcome: "increase_load",
          primaryLever: "load",
          confidence: "high",
          source: "layer_b",
          reasoning: ["Previous session was completed at the top of the rep range."],
          recommendedLoadKg: 85,
          recommendedRepsTarget: null,
          recommendedSets: null,
          recommendedRestSeconds: null,
        },
      }),
    ]);
    renderCard({ segment, isLogged: false });
    expect(screen.getByText(/Suggested start: 85 kg/)).toBeInTheDocument();
  });

  it("falls back to guidelineLoad when progressionRecommendation.recommendedLoadKg is null", () => {
    const segment = makeSegment({}, [
      makeExercise({
        guidelineLoad: { value: 75, unit: "kg", confidence: "medium", source: "manual" },
        progressionRecommendation: {
          outcome: "hold",
          primaryLever: null,
          confidence: "medium",
          source: "layer_b",
          reasoning: [],
          recommendedLoadKg: null,
          recommendedRepsTarget: null,
          recommendedSets: null,
          recommendedRestSeconds: null,
        },
      }),
    ]);
    renderCard({ segment, isLogged: false });
    expect(screen.getByText(/Suggested start: 75 kg/)).toBeInTheDocument();
  });

  it("does not render GuidelineLoadHint when progressionRecommendation.recommendedLoadKg is 0", () => {
    const segment = makeSegment({}, [
      makeExercise({
        guidelineLoad: null,
        progressionRecommendation: {
          outcome: "increase_load",
          primaryLever: "load",
          confidence: "high",
          source: "layer_b",
          reasoning: [],
          recommendedLoadKg: 0,
          recommendedRepsTarget: null,
          recommendedSets: null,
          recommendedRestSeconds: null,
        },
      }),
    ]);
    renderCard({ segment, isLogged: false });
    expect(screen.queryByText(/Suggested start:/)).not.toBeInTheDocument();
  });
});

// ── Logged badge ──────────────────────────────────────────────────────────────

describe("SegmentCard — Logged badge", () => {
  it("shows the Logged badge when isLogged is true", () => {
    renderCard({ isLogged: true });
    expect(screen.getByText("Logged")).toBeInTheDocument();
  });

  it("does not show the Logged badge when isLogged is false", () => {
    renderCard({ isLogged: false });
    expect(screen.queryByText("Logged")).not.toBeInTheDocument();
  });
});

// ── Swap exercise link ────────────────────────────────────────────────────────

describe("SegmentCard — Swap exercise link", () => {
  it("shows the swap link when isLogged is false and onSwapExercise is provided", () => {
    renderCard({ isLogged: false, onSwapExercise: vi.fn() });
    expect(screen.getByText("Swap exercise")).toBeInTheDocument();
  });

  it("does not show the swap link when isLogged is true", () => {
    renderCard({ isLogged: true, onSwapExercise: vi.fn() });
    expect(screen.queryByText("Swap exercise")).not.toBeInTheDocument();
  });

  it("does not show the swap link when onSwapExercise is not provided", () => {
    renderCard({ isLogged: false, onSwapExercise: undefined });
    expect(screen.queryByText("Swap exercise")).not.toBeInTheDocument();
  });

  it("calls onSwapExercise with the exercise id and name on tap", () => {
    const onSwapExercise = vi.fn();
    renderCard({ isLogged: false, onSwapExercise });
    fireEvent.click(screen.getByText("Swap exercise"));
    expect(onSwapExercise).toHaveBeenCalledWith("ex-1", "Barbell Squat");
  });
});

// ── AdaptationChip rendering ──────────────────────────────────────────────────

describe("SegmentCard — AdaptationChip", () => {
  it("renders the adaptation chip when adaptationDecision is present", () => {
    const segment = makeSegment({}, [
      makeExercise({
        adaptationDecision: {
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
        },
      }),
    ]);
    renderCard({ segment });
    expect(screen.getByText("Load increased ↑")).toBeInTheDocument();
  });

  it("does not render an adaptation chip when adaptationDecision is null", () => {
    const segment = makeSegment({}, [makeExercise({ adaptationDecision: null })]);
    renderCard({ segment });
    expect(screen.queryByText(/↑/)).not.toBeInTheDocument();
  });

  it("calls onViewDecisionHistory when the history link is tapped", () => {
    const onViewDecisionHistory = vi.fn();
    const segment = makeSegment({}, [
      makeExercise({
        adaptationDecision: {
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
        },
      }),
    ]);
    renderCard({ segment, onViewDecisionHistory });
    // Expand the chip detail card first
    fireEvent.click(screen.getByRole("button", { name: /Adaptation: Load increased/ }));
    fireEvent.click(screen.getByText("View full history ->"));
    expect(onViewDecisionHistory).toHaveBeenCalledWith("bb-squat", "Barbell Squat", "ex-1");
  });
});

// ── Basic rendering ───────────────────────────────────────────────────────────

describe("SegmentCard — basic rendering", () => {
  it("renders the segment name", () => {
    renderCard();
    expect(screen.getByText("Main Work")).toBeInTheDocument();
  });

  it("renders exercise name, sets and reps", () => {
    renderCard();
    expect(screen.getByText("Barbell Squat")).toBeInTheDocument();
    expect(screen.getByText("3 sets 5-8 reps")).toBeInTheDocument();
  });

  it("renders the Log segment button for a non-logged segment", () => {
    renderCard({ isLogged: false });
    expect(screen.getByText("Log segment")).toBeInTheDocument();
  });

  it("calls onLogSegment when Log segment is tapped", () => {
    const onLogSegment = vi.fn();
    renderCard({ isLogged: false, onLogSegment });
    fireEvent.click(screen.getByText("Log segment"));
    expect(onLogSegment).toHaveBeenCalledTimes(1);
  });

  it("renders warmup notes instead of exercise list for warmup segments", () => {
    const segment = makeSegment(
      { segmentType: "warmup", segmentName: "Warm Up", notes: "Prep your joints." },
      [],
    );
    renderCard({ segment });
    expect(screen.getByText("Prep your joints.")).toBeInTheDocument();
    expect(screen.queryByText("Log segment")).not.toBeInTheDocument();
  });
});
