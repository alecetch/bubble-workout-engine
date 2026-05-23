import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "../../api/client";
import { _resetForTest } from "../../utils/localWorkoutLog";
import { SegmentCard } from "./SegmentCard";
import type { ProgramDayFullResponse } from "../../api/programViewer";
import { useSettingsStore } from "../../state/settings/useSettingsStore";
import { useTimerStore } from "../../state/timer/useTimerStore";
import {
  buildAdaptationDecision,
  buildExercise,
  buildSegment,
  buildTimerEntry,
  mockZustandSelector,
} from "../../__test-utils__";

const { impactAsyncMock } = vi.hoisted(() => ({
  impactAsyncMock: vi.fn(),
}));

const mutateAsyncMock = vi.fn().mockResolvedValue({ saved: 1, prs: [] });
const initEntryMock = vi.fn();
const startRestMock = vi.fn();
const stopRestMock = vi.fn();
const adjustRestDurationMock = vi.fn();

vi.mock("../../api/hooks", () => ({
  useSegmentExerciseLogs: () => ({
    data: [],
    isLoading: false,
  }),
  useSaveSegmentLogs: () => ({
    mutateAsync: mutateAsyncMock,
  }),
}));

vi.mock("../../state/timer/useTimerStore", () => ({
  useTimerStore: vi.fn(),
}));

vi.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
  },
  impactAsync: impactAsyncMock,
}));

type Segment = ProgramDayFullResponse["segments"][number];
type Exercise = Segment["exercises"][number];
const useTimerStoreMock = vi.mocked(useTimerStore);

const makeExercise = buildExercise;
const makeSegment = buildSegment;

function segmentCardElement(
  props: Partial<React.ComponentProps<typeof SegmentCard>> = {},
) {
  return (
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
    />
  );
}

function renderCard(
  props: Partial<React.ComponentProps<typeof SegmentCard>> = {},
) {
  return render(segmentCardElement(props));
}

function setMockTimerState(
  entries: Record<string, ReturnType<typeof buildTimerEntry>> = {},
) {
  mockZustandSelector(useTimerStoreMock as any, {
    entries,
    restOverrides: {},
    initEntry: initEntryMock,
    startRest: startRestMock,
    stopRest: stopRestMock,
    adjustRestDuration: adjustRestDurationMock,
  });
}

function runningRestEntry(segmentId: string) {
  return buildTimerEntry({
    segmentId,
    activeMode: "rest",
    restTotalSeconds: 90,
    restElapsedSeconds: 0,
    restIsRunning: true,
    restStartedAtMs: Date.now(),
    restOverrideKey: "day-1:ex-1",
  });
}

describe("SegmentCard", () => {
  beforeEach(() => {
    mutateAsyncMock.mockClear();
    mutateAsyncMock.mockResolvedValue({ saved: 1, prs: [] });
    initEntryMock.mockClear();
    startRestMock.mockClear();
    stopRestMock.mockClear();
    adjustRestDurationMock.mockClear();
    impactAsyncMock.mockClear();
    useSettingsStore.setState({ showRestTimer: true, hydrated: true });
    setMockTimerState();
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

    fireEvent.click(screen.getAllByText("Start Exercise")[0]);

    expect(await screen.findByText("Close")).toBeInTheDocument();
    expect(await screen.findByText("Set 1")).toBeInTheDocument();
  });

  it("renders set rows on the first open for a multi-exercise segment", async () => {
    const segment = makeSegment({}, [
      makeExercise({ id: "ex-1", name: "Barbell Squat" }),
      makeExercise({ id: "ex-2", exerciseId: "bb-rdl", name: "Romanian Deadlift" }),
    ]);
    renderCard({ segment });

    fireEvent.click(screen.getAllByText("Start Exercise")[0]);

    expect(await screen.findByText("Close")).toBeInTheDocument();
    expect(screen.getAllByText("Set 1")).toHaveLength(2);
  });

  it("renders set rows after closing and reopening the inline logging panel", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));
    expect(await screen.findByText("Set 1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Close"));
    fireEvent.click(await screen.findByText("Start Exercise"));

    expect(await screen.findByText("Set 1")).toBeInTheDocument();
  });

  it("hides Start Exercise while the inline logging panel is open", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));

    expect(await screen.findByText("Close")).toBeInTheDocument();
    expect(screen.queryByText("Start Exercise")).not.toBeInTheDocument();
  });

  it("renders Stop Exercise at the bottom of the inline panel", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));

    expect(await screen.findByText("Set 1")).toBeInTheDocument();
    expect(screen.getByText("Stop Exercise")).toBeInTheDocument();
    expect(screen.queryByText("Start Exercise")).not.toBeInTheDocument();
  });

  it("treats an omitted loadability flag as loggable", async () => {
    const exercise = makeExercise({ isLoadable: undefined });
    renderCard({ segment: makeSegment({}, [exercise]) });

    fireEvent.click(screen.getByText("Start Exercise"));

    expect(await screen.findByText("Set 1")).toBeInTheDocument();
  });

  it("shows the rest strip after completing a set", async () => {
    const exercise = makeExercise({ isLoadable: undefined, restSeconds: 90 });
    const segment = makeSegment({}, [exercise]);
    let resolveSave: (value: { saved: number; prs: [] }) => void = () => {};
    mutateAsyncMock.mockReturnValueOnce(new Promise((resolve) => {
      resolveSave = resolve;
    }));
    startRestMock.mockImplementation((segmentId: string) => {
      setMockTimerState({ [segmentId]: runningRestEntry(segmentId) });
    });
    renderCard({ segment });

    fireEvent.click(screen.getByText("Start Exercise"));
    fireEvent.click(await screen.findByRole("button", { name: "Barbell Squat set 1 complete" }));

    await vi.waitFor(() => {
      expect(initEntryMock).toHaveBeenCalledWith(expect.objectContaining({ segmentId: segment.id, restTotal: 90 }));
      expect(startRestMock).toHaveBeenCalledWith(segment.id);
    });

    expect(await screen.findByText("Rest")).toBeInTheDocument();
    expect(screen.getByText("Reset")).toBeInTheDocument();
    resolveSave({ saved: 1, prs: [] });
  });

  it("uses a 90 second rest timer fallback when exercise rest is missing", async () => {
    const exercise = makeExercise({ restSeconds: null });
    const segment = makeSegment({}, [exercise]);
    startRestMock.mockImplementation((segmentId: string) => {
      setMockTimerState({ [segmentId]: runningRestEntry(segmentId) });
    });
    renderCard({ segment });

    fireEvent.click(screen.getByText("Start Exercise"));
    fireEvent.click(await screen.findByRole("button", { name: "Barbell Squat set 1 complete" }));

    expect(await screen.findByText("Rest")).toBeInTheDocument();
    expect(screen.getByText("01:30")).toBeInTheDocument();
    expect(initEntryMock).toHaveBeenCalledWith(expect.objectContaining({ restTotal: 90 }));
  });

  it("keeps the rest strip hidden when showRestTimer is false", async () => {
    useSettingsStore.setState({ showRestTimer: false, hydrated: true });
    const segment = makeSegment();
    renderCard({ segment });

    fireEvent.click(screen.getByText("Start Exercise"));
    fireEvent.click(await screen.findByRole("button", { name: "Barbell Squat set 1 complete" }));

    await vi.waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
    });
    expect(startRestMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Rest")).not.toBeInTheDocument();
  });

  it("toggles rest adjustment controls from the strip", async () => {
    const segment = makeSegment();
    setMockTimerState({ [segment.id]: runningRestEntry(segment.id) });
    renderCard({ segment });

    fireEvent.click(screen.getByText("Start Exercise"));
    fireEvent.click(await screen.findByText("Adjust"));

    fireEvent.click(screen.getByRole("button", { name: "-" }));
    expect(adjustRestDurationMock).toHaveBeenCalledWith(segment.id, -15, "day-1:ex-1");
    expect(screen.getByRole("button", { name: "+" })).toBeInTheDocument();
  });

  it("renders the RIR choices as accessible single-row buttons", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));

    expect(await screen.findByText("How many more reps could you complete per set?")).toBeInTheDocument();
    ["4+", "3", "2", "1", "0"].forEach((option) => {
      expect(screen.getByRole("button", { name: `${option} reps in reserve` })).toBeInTheDocument();
    });
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
    const decision = buildAdaptationDecision({
      recommendedLoadKg: 95,
      displayDetail: "You hit all sets at your top rep range.",
      decidedAt: "2026-04-29T00:00:00.000Z",
    });
    const exercise = makeExercise({ adaptationDecision: decision });

    renderCard({ segment: makeSegment({}, [exercise]) });

    expect(screen.getByText("Load increased ↑")).toBeInTheDocument();
  });

  it("does not render chip text for outcome hold", () => {
    const decision = buildAdaptationDecision({
      outcome: "hold",
      primaryLever: "hold",
      confidence: "medium",
      recommendedLoadKg: null,
      recommendedLoadDeltaKg: null,
      displayChip: "Holding steady",
      displayDetail: "Consolidating current load.",
      decidedAt: "2026-04-29T00:00:00.000Z",
    });
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
    const decision = buildAdaptationDecision({
      outcome: "deload_local",
      recommendedLoadDeltaKg: -5,
      displayChip: "Deload this week",
      displayDetail: "Signs of fatigue detected.",
      decidedAt: "2026-04-29T00:00:00.000Z",
    });
    const exercise = makeExercise({ adaptationDecision: decision });

    renderCard({ segment: makeSegment({}, [exercise]) });

    expect(screen.getByText("Deload this week")).toBeInTheDocument();
  });
});

describe("SegmentCard — unloaded exercises, button state machine, and collapsed summary", () => {
  beforeEach(() => {
    mutateAsyncMock.mockClear();
    mutateAsyncMock.mockResolvedValue({ saved: 1, prs: [] });
    _resetForTest();
    initEntryMock.mockClear();
    startRestMock.mockClear();
    stopRestMock.mockClear();
    adjustRestDurationMock.mockClear();
    impactAsyncMock.mockClear();
    useSettingsStore.setState({ showRestTimer: true, hydrated: true });
    setMockTimerState();
  });

  it("shows — in each set row instead of a weight input for unloaded exercises", async () => {
    const exercise = makeExercise({ isLoadable: false });
    renderCard({ segment: makeSegment({}, [exercise]) });

    fireEvent.click(screen.getByText("Start Exercise"));

    expect(await screen.findByText("Close")).toBeInTheDocument();
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
    expect(screen.queryAllByText("kg").length).toBe(0);
  });

  it("shows Stop Exercise when the inline logging panel is open", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));

    expect(await screen.findByText("Stop Exercise")).toBeInTheDocument();
  });

  it("shows Exercise Complete and is disabled after stopping the exercise", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));
    fireEvent.click(await screen.findByText("Stop Exercise"));

    expect(await screen.findByText("Exercise Complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exercise Complete" })).toBeDisabled();
  });

  it("collapsed summary shows bodyweight format for unloaded exercise", async () => {
    const exercise = makeExercise({ isLoadable: false });
    renderCard({ segment: makeSegment({}, [exercise]) });

    fireEvent.click(screen.getByText("Start Exercise"));
    fireEvent.click(await screen.findByText("Log all sets as complete"));
    fireEvent.click(await screen.findByText("Stop Exercise"));

    expect(await screen.findByText("3 x 7 (bodyweight) ✓")).toBeInTheDocument();
  });

  it("Resume button is absent before Stop Exercise is tapped", async () => {
    renderCard();

    expect(screen.queryByText("Resume")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Start Exercise"));
    await screen.findByText("Set 1");

    expect(screen.queryByText("Resume")).not.toBeInTheDocument();
  });

  it("Resume button appears after Stop Exercise is tapped", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));
    fireEvent.click(await screen.findByText("Stop Exercise"));

    expect(await screen.findByText("Resume")).toBeInTheDocument();
  });

  it("tapping Resume reopens the inline logging panel", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));
    fireEvent.click(await screen.findByText("Stop Exercise"));
    fireEvent.click(await screen.findByText("Resume"));

    expect(await screen.findByText("Set 1")).toBeInTheDocument();
    expect(screen.queryByText("Resume")).not.toBeInTheDocument();
  });

  it("tapping Resume shows Start Exercise again and hides Exercise Complete", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));
    fireEvent.click(await screen.findByText("Stop Exercise"));
    await screen.findByText("Exercise Complete");

    fireEvent.click(screen.getByText("Resume"));

    await screen.findByText("Set 1");
    expect(screen.queryByText("Exercise Complete")).not.toBeInTheDocument();
  });
});

describe("SegmentCard — round-based logging (superset)", () => {
  function supersetExercises(): Exercise[] {
    return [
      makeExercise({ id: "ex-1", exerciseId: "bb-squat", name: "Barbell Squat", restSeconds: 90 }),
      makeExercise({ id: "ex-2", exerciseId: "bb-rdl", name: "Romanian Deadlift", restSeconds: 90 }),
    ];
  }

  function supersetSegment() {
    return makeSegment({ segmentType: "superset", segmentTypeLabel: "Superset", rounds: 4 }, supersetExercises());
  }

  async function openSupersetPanel() {
    renderCard({ segment: supersetSegment() });
    fireEvent.click(screen.getByText("Start Exercise"));
    expect(await screen.findByText("Round 1")).toBeInTheDocument();
  }

  function fillActiveRound(weight = "80", reps = "8") {
    const inputs = screen.getAllByPlaceholderText("0");
    inputs.forEach((input, index) => {
      fireEvent.change(input, { target: { value: index % 2 === 0 ? weight : reps } });
    });
  }

  beforeEach(() => {
    mutateAsyncMock.mockClear();
    mutateAsyncMock.mockResolvedValue({ saved: 1, prs: [] });
    initEntryMock.mockClear();
    startRestMock.mockClear();
    stopRestMock.mockClear();
    adjustRestDurationMock.mockClear();
    impactAsyncMock.mockClear();
    useSettingsStore.setState({ showRestTimer: true, hydrated: true });
    setMockTimerState();
    _resetForTest();
  });

  it("renders a single Start Exercise button below all superset exercise rows", () => {
    const { container } = renderCard({ segment: supersetSegment() });

    expect(screen.getAllByText("Start Exercise")).toHaveLength(1);
    const content = container.textContent ?? "";
    expect(content.indexOf("Start Exercise")).toBeGreaterThan(content.indexOf("Barbell Squat"));
    expect(content.indexOf("Start Exercise")).toBeGreaterThan(content.indexOf("Romanian Deadlift"));
  });

  it("prefills round inputs from guideline load and prescribed reps", async () => {
    const segment = makeSegment(
      { segmentType: "superset", segmentTypeLabel: "Superset", rounds: 4 },
      [
        makeExercise({
          id: "ex-1",
          exerciseId: "bb-squat",
          name: "Barbell Squat",
          guidelineLoad: { value: 80, unit: "kg", confidence: "medium" },
          reps: "8-12",
        }),
        makeExercise({
          id: "ex-2",
          exerciseId: "bb-rdl",
          name: "Romanian Deadlift",
          guidelineLoad: { value: 80, unit: "kg", confidence: "medium" },
          reps: "8-12",
        }),
      ],
    );
    renderCard({ segment });

    fireEvent.click(screen.getByText("Start Exercise"));

    await screen.findByText("Round 1");
    const inputs = screen.getAllByPlaceholderText("0");
    expect(inputs[0]).toHaveValue("80");
    expect(inputs[1]).toHaveValue("10");
    expect(inputs[2]).toHaveValue("80");
    expect(inputs[3]).toHaveValue("10");
  });

  it("carries Round 1 logged values forward into Round 2 inputs", async () => {
    await openSupersetPanel();
    fillActiveRound("82.5", "9");

    fireEvent.click(screen.getByText("Mark round complete"));

    await vi.waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Round 2")).toBeInTheDocument();
      const inputs = screen.getAllByPlaceholderText("0");
      expect(inputs[0]).toHaveValue("82.5");
      expect(inputs[1]).toHaveValue("9");
      expect(inputs[2]).toHaveValue("82.5");
      expect(inputs[3]).toHaveValue("9");
    });
  });

  it("renders Round 1 through Round 4 when inline panel opens", async () => {
    await openSupersetPanel();

    expect(screen.getByText("Round 2 · complete round 1 to unlock")).toBeInTheDocument();
    expect(screen.getByText("Round 3 · complete round 2 to unlock")).toBeInTheDocument();
    expect(screen.getByText("Round 4 · complete round 3 to unlock")).toBeInTheDocument();
  });

  it("marks round 1 complete and advances to Round 2", async () => {
    await openSupersetPanel();
    fillActiveRound();

    fireEvent.click(screen.getByText("Mark round complete"));

    await vi.waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Round 1 ✓/)).toBeInTheDocument();
    });
    expect(screen.getByText("Round 2")).toBeInTheDocument();
    expect(screen.getByText("Round 3 · complete round 2 to unlock")).toBeInTheDocument();
  });

  it("completed round collapses to summary line", async () => {
    await openSupersetPanel();
    fillActiveRound("82.5", "7");

    fireEvent.click(screen.getByText("Mark round complete"));

    expect(await screen.findByText(/Round 1 ✓/)).toBeInTheDocument();
    expect(screen.getByText(/Barbell Squat 82.5 kg x 7/)).toBeInTheDocument();
  });

  it("rest timer starts after round completion", async () => {
    await openSupersetPanel();
    fillActiveRound();

    fireEvent.click(screen.getByText("Mark round complete"));

    await vi.waitFor(() => {
      expect(initEntryMock).toHaveBeenCalledWith(expect.objectContaining({ segmentId: "seg-1", restTotal: 90 }));
      expect(startRestMock).toHaveBeenCalledWith("seg-1");
    });
  });

  it("RIR pickers are absent on rounds 1-3 and present on round 4", async () => {
    await openSupersetPanel();
    expect(screen.queryByRole("button", { name: "Barbell Squat 4+ reps in reserve" })).not.toBeInTheDocument();

    for (let i = 0; i < 3; i += 1) {
      fillActiveRound();
      fireEvent.click(screen.getByText("Mark round complete"));
      await vi.waitFor(() => {
        expect(mutateAsyncMock).toHaveBeenCalledTimes(i + 1);
        expect(screen.getByText(new RegExp(`Round ${i + 1} .*`))).toBeInTheDocument();
      });
    }

    expect(await screen.findByLabelText("Barbell Squat 4+ reps in reserve")).toBeInTheDocument();
    expect(screen.getByLabelText("Romanian Deadlift 0 reps in reserve")).toBeInTheDocument();
  });

  it("empty round shows inline warning; second tap saves", async () => {
    await openSupersetPanel();
    screen.getAllByPlaceholderText("0").forEach((input) => {
      fireEvent.change(input, { target: { value: "" } });
    });

    fireEvent.click(screen.getByText("Mark round complete"));

    expect(await screen.findByText("No reps entered for this round. Tap again to save anyway.")).toBeInTheDocument();
    expect(mutateAsyncMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Mark round complete"));

    await vi.waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
  });

  it("fires haptic on successful round completion", async () => {
    await openSupersetPanel();
    fillActiveRound();

    fireEvent.click(screen.getByText("Mark round complete"));

    await vi.waitFor(() => {
      expect(impactAsyncMock).toHaveBeenCalledWith("light");
    });
  });

  it("Stop Exercise mid-way shows post-stop RIR prompt", async () => {
    await openSupersetPanel();

    for (let i = 0; i < 2; i += 1) {
      fillActiveRound();
      fireEvent.click(screen.getByText("Mark round complete"));
      await vi.waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(i + 1));
    }

    fireEvent.click(screen.getByText("Stop Exercise"));

    expect(await screen.findByRole("button", { name: "Barbell Squat 4+ reps in reserve" })).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("Resume button appears after Stop Exercise on a superset (no rounds completed)", async () => {
    await openSupersetPanel();

    fireEvent.click(screen.getByText("Stop Exercise"));

    expect(await screen.findByText("Resume")).toBeInTheDocument();
  });

  it("tapping Resume on a superset reopens the panel", async () => {
    await openSupersetPanel();

    fireEvent.click(screen.getByText("Stop Exercise"));
    fireEvent.click(await screen.findByText("Resume"));

    expect(await screen.findByText("Round 1")).toBeInTheDocument();
    expect(screen.queryByText("Resume")).not.toBeInTheDocument();
  });
});
