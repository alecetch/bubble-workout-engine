import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { SegmentCard } from "./SegmentCard";
import type { ProgramDayFullResponse } from "../../api/programViewer";

const mutateAsyncMock = vi.fn().mockResolvedValue(undefined);
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
});
