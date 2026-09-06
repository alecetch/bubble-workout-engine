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

const { getSegmentPresentationMock } = vi.hoisted(() => ({
  getSegmentPresentationMock: vi.fn(),
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

vi.mock("./segmentCardLogic", async () => {
  const actual = await vi.importActual<typeof import("./segmentCardLogic")>("./segmentCardLogic");
  getSegmentPresentationMock.mockImplementation(actual.getSegmentPresentation);
  return {
    ...actual,
    getSegmentPresentation: getSegmentPresentationMock,
  };
});

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
      onRequestSwap={props.onRequestSwap}
	      onAllSetsSaved={props.onAllSetsSaved ?? vi.fn()}
	      onSubscriptionRequired={props.onSubscriptionRequired}
	      onInlinePanelClose={props.onInlinePanelClose}
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
    getSegmentPresentationMock.mockClear();
    useSettingsStore.setState({ showRestTimer: true, hydrated: true });
    setMockTimerState();
  });

  it("renders Start Exercise for loadable segments", () => {
    renderCard();
    expect(screen.getByText("Start Exercise")).toBeInTheDocument();
  });

  it("skips unchanged parent rerenders but updates when logged state changes", () => {
    const segment = makeSegment();
    const props: Partial<React.ComponentProps<typeof SegmentCard>> = {
      segment,
      onAllSetsSaved: vi.fn(),
      onInlinePanelClose: vi.fn(),
      onInlinePanelOpen: vi.fn(),
      onPrsDetected: vi.fn(),
      onRequestSwap: vi.fn(),
      onSubscriptionRequired: vi.fn(),
      onViewExerciseDetail: vi.fn(),
    };
    function Harness({ isLogged, tick }: { isLogged: boolean; tick: number }) {
      void tick;
      return segmentCardElement({ ...props, isLogged });
    }

    const { rerender } = render(<Harness isLogged={false} tick={0} />);
    expect(getSegmentPresentationMock).toHaveBeenCalledTimes(1);

    getSegmentPresentationMock.mockClear();
    rerender(<Harness isLogged={false} tick={1} />);
    expect(getSegmentPresentationMock).not.toHaveBeenCalled();

    rerender(<Harness isLogged={true} tick={1} />);
    expect(getSegmentPresentationMock).toHaveBeenCalledTimes(1);
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

  it("renders the swap button and calls onRequestSwap with the exercise target", () => {
    const onRequestSwap = vi.fn();
    const segment = makeSegment({}, [makeExercise({ id: "ex-1", name: "Barbell Squat" })]);
    renderCard({ segment, onRequestSwap });

    fireEvent.click(screen.getByRole("button", { name: "Swap Barbell Squat" }));

    expect(onRequestSwap).toHaveBeenCalledWith("ex-1", "Barbell Squat");
  });

  it("omits the swap button when onRequestSwap is not provided", () => {
    const segment = makeSegment({}, [makeExercise({ id: "ex-1", name: "Barbell Squat" })]);

    expect(() => renderCard({ segment })).not.toThrow();
    expect(screen.queryByRole("button", { name: "Swap Barbell Squat" })).not.toBeInTheDocument();
  });

  it("hides the swap button once the exercise is complete", async () => {
    const onRequestSwap = vi.fn();
    const segment = makeSegment({}, [makeExercise({ id: "ex-1", name: "Barbell Squat" })]);

    try {
      renderCard({ segment, onRequestSwap });

      expect(screen.getByRole("button", { name: "Swap Barbell Squat" })).toBeInTheDocument();

      fireEvent.click(screen.getByText("Start Exercise"));
      fireEvent.click(await screen.findByText("Close Log"));

      expect(await screen.findByText("Exercise Complete")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Swap Barbell Squat" })).not.toBeInTheDocument();
    } finally {
      _resetForTest();
    }
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

  it('renders "Close Log" instead of "Stop Exercise"', async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));

    expect(await screen.findByText("Set 1")).toBeInTheDocument();
    expect(screen.getByText("Close Log")).toBeInTheDocument();
    expect(screen.queryByText("Stop Exercise")).not.toBeInTheDocument();
    expect(screen.queryByText("Start Exercise")).not.toBeInTheDocument();
  });

  it("fills down weight to subsequent undone sets", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));
    expect(await screen.findByText("Set 1")).toBeInTheDocument();
    const inputs = screen.getAllByPlaceholderText("0");

    fireEvent.change(inputs[0], { target: { value: "100" } });

    expect(inputs[0]).toHaveValue("100");
    expect(inputs[2]).toHaveValue("100");
    expect(inputs[4]).toHaveValue("100");
  });

  it("does not fill down into already-completed sets", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));
    expect(await screen.findByText("Set 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Barbell Squat set 1 complete" }));
    await vi.waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
    const inputs = screen.getAllByPlaceholderText("0");

    fireEvent.change(inputs[2], { target: { value: "80" } });

    expect(inputs[0]).not.toHaveValue("80");
    expect(inputs[2]).toHaveValue("80");
    expect(inputs[4]).toHaveValue("80");
  });

  it("calls onInlinePanelClose when Close Log is pressed", async () => {
    const onClose = vi.fn();
    renderCard({ onInlinePanelClose: onClose });

    fireEvent.click(screen.getByText("Start Exercise"));
    fireEvent.click(await screen.findByText("Close Log"));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
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

  it("shows Close Log when the inline logging panel is open", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));

    expect(await screen.findByText("Close Log")).toBeInTheDocument();
  });

  it("shows Exercise Complete and is disabled after stopping the exercise", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));
    fireEvent.click(await screen.findByText("Close Log"));

    expect(await screen.findByText("Exercise Complete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exercise Complete" })).toBeDisabled();
  });

  it("collapsed summary shows bodyweight format for unloaded exercise", async () => {
    const exercise = makeExercise({ isLoadable: false });
    renderCard({ segment: makeSegment({}, [exercise]) });

    fireEvent.click(screen.getByText("Start Exercise"));
    fireEvent.click(await screen.findByText("Log all sets as complete"));
    fireEvent.click(await screen.findByText("Close Log"));

    expect(await screen.findByText("3 x 7 (bodyweight) ✓")).toBeInTheDocument();
  });

  it("Resume button is absent before Close Log is tapped", async () => {
    renderCard();

    expect(screen.queryByText("Resume")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Start Exercise"));
    await screen.findByText("Set 1");

    expect(screen.queryByText("Resume")).not.toBeInTheDocument();
  });

  it("Resume button appears after Close Log is tapped", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));
    fireEvent.click(await screen.findByText("Close Log"));

    expect(await screen.findByText("Resume")).toBeInTheDocument();
  });

  it("tapping Resume reopens the inline logging panel", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));
    fireEvent.click(await screen.findByText("Close Log"));
    fireEvent.click(await screen.findByText("Resume"));

    expect(await screen.findByText("Set 1")).toBeInTheDocument();
    expect(screen.queryByText("Resume")).not.toBeInTheDocument();
  });

  it("tapping Resume shows Start Exercise again and hides Exercise Complete", async () => {
    renderCard();

    fireEvent.click(screen.getByText("Start Exercise"));
    fireEvent.click(await screen.findByText("Close Log"));
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

  it("shows no badge for a single-exercise segment", () => {
    const segment = makeSegment({ segmentType: "single", segmentTypeLabel: "Single" });
    renderCard({ segment });

    expect(screen.queryByText("Single")).not.toBeInTheDocument();
  });

  it("still shows the badge for a superset segment", () => {
    renderCard({ segment: supersetSegment() });

    expect(screen.getByText("Superset")).toBeInTheDocument();
  });

  it("renders a single Start Exercise button below all superset exercise rows", () => {
    const { container } = renderCard({ segment: supersetSegment() });

    expect(screen.getAllByText("Start Exercise")).toHaveLength(1);
    const content = container.textContent ?? "";
    expect(content.indexOf("Start Exercise")).toBeGreaterThan(content.indexOf("Barbell Squat"));
    expect(content.indexOf("Start Exercise")).toBeGreaterThan(content.indexOf("Romanian Deadlift"));
  });

  it("groups superset exercises into a single container with one rest line instead of one per exercise", () => {
    renderCard({ segment: supersetSegment() });

    expect(screen.getAllByText(/^Rest 90/)).toHaveLength(1);
    expect(screen.getByText("Rest 90s after each round")).toBeInTheDocument();
    expect(screen.getByText("Barbell Squat")).toBeInTheDocument();
    expect(screen.getByText("Romanian Deadlift")).toBeInTheDocument();
  });

  it("still shows one rest line per exercise for a non-round-based segment", () => {
    const segment = makeSegment({}, [
      makeExercise({ id: "ex-1", exerciseId: "bb-squat", name: "Barbell Squat", restSeconds: 90 }),
      makeExercise({ id: "ex-2", exerciseId: "bb-press", name: "Overhead Press", restSeconds: 60 }),
    ]);

    renderCard({ segment });

    expect(screen.getByText("Rest 90 s")).toBeInTheDocument();
    expect(screen.getByText("Rest 60 s")).toBeInTheDocument();
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

  it("positions the rest strip between the completed round and the active round, not above the round list", async () => {
    mutateAsyncMock.mockResolvedValue({ saved: 1, prs: [] });
    startRestMock.mockImplementation((segmentId: string) => {
      setMockTimerState({ [segmentId]: runningRestEntry(segmentId) });
    });
    await openSupersetPanel();

    fillActiveRound();
    fireEvent.click(screen.getByText("Mark round complete"));

    expect(await screen.findByText("01:30")).toBeInTheDocument();
    const content = document.body.textContent ?? "";
    expect(content.indexOf("Round 1")).toBeLessThan(content.indexOf("01:30"));
    expect(content.indexOf("01:30")).toBeLessThan(content.indexOf("Round 2"));
  });

  it("RIR pickers are absent on rounds 1-3 and present on round 4", async () => {
    await openSupersetPanel();
    expect(screen.queryByRole("button", { name: "Superset effort 4+" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Barbell Squat 4+ reps in reserve" })).not.toBeInTheDocument();

    for (let i = 0; i < 3; i += 1) {
      fillActiveRound();
      fireEvent.click(screen.getByText("Mark round complete"));
      await vi.waitFor(() => {
        expect(mutateAsyncMock).toHaveBeenCalledTimes(i + 1);
        expect(screen.getByText(new RegExp(`Round ${i + 1} .*`))).toBeInTheDocument();
      });
    }

    expect(await screen.findByRole("button", { name: "Superset effort 4+" })).toBeInTheDocument();
    expect(screen.getAllByTestId("segment-effort-picker")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Barbell Squat 4+ reps in reserve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Romanian Deadlift 0 reps in reserve" })).not.toBeInTheDocument();
  });

  it("applies the selected combined effort to both final-round superset rows", async () => {
    await openSupersetPanel();

    for (let i = 0; i < 3; i += 1) {
      fillActiveRound();
      fireEvent.click(screen.getByText("Mark round complete"));
      await vi.waitFor(() => {
        expect(mutateAsyncMock).toHaveBeenCalledTimes(i + 1);
        expect(screen.getByText(new RegExp(`Round ${i + 1} .*`))).toBeInTheDocument();
      });
    }

    expect(await screen.findByText("Round 4")).toBeInTheDocument();
    fillActiveRound("82.5", "9");
    fireEvent.click(screen.getByRole("button", { name: "Superset effort 2" }));
    fireEvent.click(screen.getByText("Mark round complete"));

    await vi.waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(4));
    expect(mutateAsyncMock).toHaveBeenLastCalledWith(expect.objectContaining({
      rows: expect.arrayContaining([
        expect.objectContaining({
          programExerciseId: "ex-1",
          orderIndex: 4,
          rirActual: 2,
        }),
        expect.objectContaining({
          programExerciseId: "ex-2",
          orderIndex: 4,
          rirActual: 2,
        }),
      ]),
    }));
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

  it("Close Log mid-way shows post-stop RIR prompt", async () => {
    await openSupersetPanel();

    for (let i = 0; i < 2; i += 1) {
      fillActiveRound();
      fireEvent.click(screen.getByText("Mark round complete"));
      await vi.waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(i + 1));
    }

    fireEvent.click(screen.getByText("Close Log"));

    expect(await screen.findByRole("button", { name: "Superset effort 4+" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Barbell Squat 4+ reps in reserve" })).not.toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("applies post-stop combined effort to both rows from the last completed superset round", async () => {
    await openSupersetPanel();

    for (let i = 0; i < 2; i += 1) {
      fillActiveRound("80", "8");
      fireEvent.click(screen.getByText("Mark round complete"));
      await vi.waitFor(() => {
        expect(mutateAsyncMock).toHaveBeenCalledTimes(i + 1);
        expect(screen.getByText(new RegExp(`Round ${i + 1} .*`))).toBeInTheDocument();
      });
    }

    fireEvent.click(screen.getByText("Close Log"));
    fireEvent.click(await screen.findByRole("button", { name: "Superset effort 1" }));
    fireEvent.click(screen.getByText("Done"));

    await vi.waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(3));
    expect(mutateAsyncMock).toHaveBeenLastCalledWith(expect.objectContaining({
      rows: expect.arrayContaining([
        expect.objectContaining({
          programExerciseId: "ex-1",
          orderIndex: 2,
          rirActual: 1,
        }),
        expect.objectContaining({
          programExerciseId: "ex-2",
          orderIndex: 2,
          rirActual: 1,
        }),
      ]),
    }));
  });

  it("Resume button appears after Close Log on a superset (no rounds completed)", async () => {
    await openSupersetPanel();

    fireEvent.click(screen.getByText("Close Log"));

    expect(await screen.findByText("Resume")).toBeInTheDocument();
  });

  it("tapping Resume on a superset reopens the panel", async () => {
    await openSupersetPanel();

    fireEvent.click(screen.getByText("Close Log"));
    fireEvent.click(await screen.findByText("Resume"));

    expect(await screen.findByText("Round 1")).toBeInTheDocument();
    expect(screen.queryByText("Resume")).not.toBeInTheDocument();
  });
});
