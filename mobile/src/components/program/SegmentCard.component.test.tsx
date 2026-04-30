import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "../../api/client";
import { SegmentCard } from "./SegmentCard";
import type { AdaptationDecision, ProgramDayFullResponse } from "../../api/programViewer";

const mutateAsyncMock = vi.fn().mockResolvedValue({ saved: 1, prs: [] });
const initEntryMock = vi.fn();
const startRestMock = vi.fn();
const stopRestMock = vi.fn();

vi.mock("../../api/hooks", () => ({
  useSegmentExerciseLogs: () => ({
    data: [],
    isLoading: false,
  }),
  useSaveSegmentLogs: () => ({
    mutateAsync: mutateAsyncMock,
  }),
}));

vi.mock("../../state/timer/useTimerStore", () => {
  const storeState = {
    entries: {},
  };
  const useTimerStore = ((selector: (state: typeof storeState) => unknown) => selector(storeState)) as ((
    selector: (state: typeof storeState) => unknown,
  ) => unknown) & {
    getState: () => {
      initEntry: typeof initEntryMock;
      startRest: typeof startRestMock;
      stopRest: typeof stopRestMock;
    };
  };
  useTimerStore.getState = () => ({
    initEntry: initEntryMock,
    startRest: startRestMock,
    stopRest: stopRestMock,
  });
  return { useTimerStore };
});

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
    restSeconds: 90,
    notes: null,
    equipment: null,
    isLoadable: true,
    guidelineLoad: null,
    progressionRecommendation: null,
    adaptationDecision: null,
    coachingCuesJson: [],
    isNewExercise: false,
    ...overrides,
  };
}

function makeSegment(
  segmentOverrides: Partial<Omit<Segment, "exercises">> = {},
  exercises: Exercise[] = [makeExercise()],
): Segment {
  return {
    id: "seg-1",
    purpose: "main",
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
  props: Partial<React.ComponentProps<typeof SegmentCard>> = {},
) {
  return render(
    <SegmentCard
      segment={props.segment ?? makeSegment()}
      isLogged={props.isLogged ?? false}
      exerciseSetCounts={props.exerciseSetCounts}
      programId={props.programId ?? "program-1"}
      programDayId={props.programDayId ?? "day-1"}
      userId={props.userId}
      onViewExerciseDetail={props.onViewExerciseDetail ?? vi.fn()}
      onAllSetsSaved={props.onAllSetsSaved ?? vi.fn()}
      onSubscriptionRequired={props.onSubscriptionRequired}
    />,
  );
}

describe("SegmentCard", () => {
  beforeEach(() => {
    mutateAsyncMock.mockClear();
    initEntryMock.mockClear();
    startRestMock.mockClear();
    stopRestMock.mockClear();
  });

  it("renders Start Exercise for loadable segments", () => {
    renderCard();
    expect(screen.getByText("Start Exercise")).toBeInTheDocument();
  });

  it("navigates to exercise detail when the exercise name is tapped", () => {
    const onViewExerciseDetail = vi.fn();
    const segment = makeSegment({}, [makeExercise()]);
    renderCard({ segment, onViewExerciseDetail });

    fireEvent.click(screen.getByText("Barbell Squat"));

    expect(onViewExerciseDetail).toHaveBeenCalledWith(
      "bb-squat",
      "ex-1",
      "Barbell Squat",
      expect.objectContaining({
        id: "ex-1",
        exerciseId: "bb-squat",
        name: "Barbell Squat",
      }),
    );
  });

  it("opens the inline logging panel when Start Exercise is tapped", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));

    expect(await screen.findByText("Close")).toBeInTheDocument();
    expect(await screen.findByText("Set 1")).toBeInTheDocument();
  });

  it("does not save a set when weight or reps fields receive focus", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));

    const inputs = await screen.findAllByPlaceholderText("0");
    fireEvent.focus(inputs[0]);
    fireEvent.focus(inputs[1]);

    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("routes to subscription-required callback when set logging gets a 402", async () => {
    const onSubscriptionRequired = vi.fn();
    mutateAsyncMock.mockRejectedValueOnce(new ApiError(402, "subscription required"));
    renderCard({ onSubscriptionRequired });

    fireEvent.click(screen.getByText("Start Exercise"));
    fireEvent.click(await screen.findByText("Log all sets as complete"));

    await vi.waitFor(() => {
      expect(onSubscriptionRequired).toHaveBeenCalledTimes(1);
    });
  });

  it("renders adaptation chip text for a non-hold decision", () => {
    const decision: AdaptationDecision = {
      outcome: "increase_load",
      primaryLever: "load",
      confidence: "high",
      recommendedLoadKg: 95,
      recommendedLoadDeltaKg: 5,
      recommendedRepsTarget: null,
      recommendedRepDelta: null,
      displayChip: "Load increased ↑",
      displayDetail: "You hit all sets at your top rep range.",
      decidedAt: "2026-04-29T00:00:00.000Z",
    };
    const exercise = makeExercise({ adaptationDecision: decision });

    renderCard({ segment: makeSegment({}, [exercise]) });

    expect(screen.getByText("Load increased ↑")).toBeInTheDocument();
  });

  it("does not render chip text for outcome hold", () => {
    const decision: AdaptationDecision = {
      outcome: "hold",
      primaryLever: "hold",
      confidence: "medium",
      recommendedLoadKg: null,
      recommendedLoadDeltaKg: null,
      recommendedRepsTarget: null,
      recommendedRepDelta: null,
      displayChip: "Holding steady",
      displayDetail: "Consolidating current load.",
      decidedAt: "2026-04-29T00:00:00.000Z",
    };
    const exercise = makeExercise({ adaptationDecision: decision });

    renderCard({ segment: makeSegment({}, [exercise]) });

    expect(screen.queryByText("Holding steady")).not.toBeInTheDocument();
  });

  it("does not render any chip when adaptationDecision is null", () => {
    const exercise = makeExercise({ adaptationDecision: null });

    renderCard({ segment: makeSegment({}, [exercise]) });

    expect(screen.queryByText(/[↑↓]/)).not.toBeInTheDocument();
  });

  it("renders chip text for deload_local", () => {
    const decision: AdaptationDecision = {
      outcome: "deload_local",
      primaryLever: "load",
      confidence: "high",
      recommendedLoadKg: 80,
      recommendedLoadDeltaKg: -5,
      recommendedRepsTarget: null,
      recommendedRepDelta: null,
      displayChip: "Deload this week",
      displayDetail: "Signs of fatigue detected.",
      decidedAt: "2026-04-29T00:00:00.000Z",
    };
    const exercise = makeExercise({ adaptationDecision: decision });

    renderCard({ segment: makeSegment({}, [exercise]) });

    expect(screen.getByText("Deload this week")).toBeInTheDocument();
  });
});
