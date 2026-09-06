import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildExercise } from "../../../__test-utils__";
import type { SetInputState } from "../sessionUxLogic";
import { RoundBasedLoggingPanel } from "./RoundBasedLoggingPanel";

vi.mock("../../interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const exercises = [
  buildExercise({ id: "ex-1", name: "Barbell Squat" }),
  buildExercise({ id: "ex-2", exerciseId: "bb-rdl", name: "Romanian Deadlift" }),
];

const inputMap: Record<string, SetInputState[]> = {
  "ex-1": [{ weight: "80", reps: "8", rirActual: null }],
  "ex-2": [{ weight: "70", reps: "10", rirActual: null }],
};

function renderPanel(
  props: Partial<React.ComponentProps<typeof RoundBasedLoggingPanel>> = {},
) {
  return render(
    <RoundBasedLoggingPanel
      totalRounds={props.totalRounds ?? 3}
      completedRoundIndices={props.completedRoundIndices ?? new Set()}
      activeRoundIndex={props.activeRoundIndex ?? 0}
      showPostStopRir={props.showPostStopRir ?? false}
      expandedRoundIndices={props.expandedRoundIndices ?? new Set()}
      onToggleExpandedRound={props.onToggleExpandedRound ?? vi.fn()}
      loggableExercises={props.loggableExercises ?? exercises}
      inputMap={props.inputMap ?? inputMap}
      onUpdateSetInput={props.onUpdateSetInput ?? vi.fn()}
      exerciseRirMap={props.exerciseRirMap ?? {}}
      onSelectRir={props.onSelectRir ?? vi.fn()}
      useCombinedEffort={props.useCombinedEffort ?? false}
      onSelectCombinedRir={props.onSelectCombinedRir ?? vi.fn()}
      roundSaveError={props.roundSaveError ?? null}
      onRoundComplete={props.onRoundComplete ?? vi.fn()}
      onPostStopRirDone={props.onPostStopRirDone ?? vi.fn()}
      getExerciseValue={props.getExerciseValue ?? (() => "80 kg x 8")}
      showRestStrip={props.showRestStrip}
      restStripProps={props.restStripProps}
    />,
  );
}

describe("RoundBasedLoggingPanel", () => {
  it("renders completed, active, and locked round states", () => {
    renderPanel({ completedRoundIndices: new Set([0]), activeRoundIndex: 1 });

    expect(screen.getByText(/Round 1/)).toBeInTheDocument();
    expect(screen.getByText("Round 2")).toBeInTheDocument();
    expect(screen.getByText("Round 3 · complete round 2 to unlock")).toBeInTheDocument();
  });

  it("calls onSelectRir when tapping the active last round RIR picker", () => {
    const onSelectRir = vi.fn();
    renderPanel({ totalRounds: 1, activeRoundIndex: 0, onSelectRir });

    fireEvent.click(screen.getByRole("button", { name: "Barbell Squat 3 reps in reserve" }));

    expect(onSelectRir).toHaveBeenCalledWith(exercises[0], 3);
  });

  it("renders one combined effort picker on the final round when enabled", () => {
    const onSelectCombinedRir = vi.fn();
    renderPanel({
      totalRounds: 1,
      activeRoundIndex: 0,
      useCombinedEffort: true,
      onSelectCombinedRir,
      exerciseRirMap: { "ex-1": 2, "ex-2": 2 },
    });

    expect(screen.getByText("How hard was this superset?")).toBeInTheDocument();
    expect(screen.getByTestId("segment-effort-picker")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Superset effort 2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Barbell Squat 4+ reps in reserve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Romanian Deadlift 0 reps in reserve" })).not.toBeInTheDocument();
    expect(screen.getByText("Comfortable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Superset effort 3" }));

    expect(onSelectCombinedRir).toHaveBeenCalledWith(3);
  });

  it("renders post-stop RIR controls and calls onPostStopRirDone", () => {
    const onPostStopRirDone = vi.fn();
    renderPanel({ showPostStopRir: true, onPostStopRirDone });

    expect(screen.getByRole("button", { name: "Barbell Squat 4+ reps in reserve" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Done"));

    expect(onPostStopRirDone).toHaveBeenCalledTimes(1);
  });

  it("renders combined effort controls in the post-stop flow when enabled", () => {
    const onSelectCombinedRir = vi.fn();
    const onPostStopRirDone = vi.fn();
    renderPanel({
      showPostStopRir: true,
      useCombinedEffort: true,
      onSelectCombinedRir,
      onPostStopRirDone,
    });

    expect(screen.getByText("How hard was this superset?")).toBeInTheDocument();
    expect(screen.getByTestId("segment-effort-picker")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Barbell Squat 4+ reps in reserve" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Superset effort 0" }));
    fireEvent.click(screen.getByText("Done"));

    expect(onSelectCombinedRir).toHaveBeenCalledWith(0);
    expect(onPostStopRirDone).toHaveBeenCalledTimes(1);
  });

  it("keeps three-exercise fixtures on per-exercise RIR when combined effort is off", () => {
    renderPanel({
      totalRounds: 1,
      activeRoundIndex: 0,
      loggableExercises: [
        ...exercises,
        buildExercise({ id: "ex-3", exerciseId: "db-row", name: "Dumbbell Row" }),
      ],
      inputMap: {
        ...inputMap,
        "ex-3": [{ weight: "30", reps: "12", rirActual: null }],
      },
      useCombinedEffort: false,
    });

    expect(screen.getAllByRole("button", { name: /reps in reserve/ })).toHaveLength(15);
    expect(screen.queryByTestId("segment-effort-picker")).not.toBeInTheDocument();
  });

  it("renders roundSaveError when provided", () => {
    renderPanel({ roundSaveError: "Failed to save" });

    expect(screen.getByText("Failed to save")).toBeInTheDocument();
  });

  it("renders the rest strip between the completed round summary and the active round", () => {
    renderPanel({
      completedRoundIndices: new Set([0]),
      activeRoundIndex: 1,
      showRestStrip: true,
      restStripProps: {
        restDisplaySeconds: 45,
        restProgress: 0.5,
        showAdjustControls: false,
        onToggleAdjust: vi.fn(),
        onReset: vi.fn(),
        onAdjust: vi.fn(),
        onAdjustLongPress: vi.fn(),
      },
    });

    const content = document.body.textContent ?? "";
    expect(screen.getByText("Rest")).toBeInTheDocument();
    expect(screen.getByText("00:45")).toBeInTheDocument();
    expect(content.indexOf("Round 1")).toBeLessThan(content.indexOf("00:45"));
    expect(content.indexOf("00:45")).toBeLessThan(content.indexOf("Round 2"));
  });

  it("renders the rest strip before the post-stop RIR block", () => {
    renderPanel({
      showPostStopRir: true,
      showRestStrip: true,
      restStripProps: {
        restDisplaySeconds: 30,
        restProgress: 0.25,
        showAdjustControls: false,
        onToggleAdjust: vi.fn(),
        onReset: vi.fn(),
        onAdjust: vi.fn(),
        onAdjustLongPress: vi.fn(),
      },
    });

    const content = document.body.textContent ?? "";
    expect(screen.getByText("Rest")).toBeInTheDocument();
    expect(screen.getByText("00:30")).toBeInTheDocument();
    expect(content.indexOf("00:30")).toBeLessThan(content.indexOf("How many more reps"));
  });
});
