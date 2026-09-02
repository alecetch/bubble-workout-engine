import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildExercise } from "../../../__test-utils__";
import type { SetInputState } from "../sessionUxLogic";
import { AmrapPairLoggingPanel } from "./AmrapPairLoggingPanel";

vi.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock("../../interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const exercises = [
  buildExercise({ id: "ex-1", name: "Ski Erg", reps: "250-300", repsUnit: "m" }),
  buildExercise({ id: "ex-2", exerciseId: "sandbag-lunge", name: "Sandbag Lunge", reps: "20-24" }),
] as [
  ReturnType<typeof buildExercise>,
  ReturnType<typeof buildExercise>,
];

const inputMap: Record<string, SetInputState[]> = {
  "ex-1": [{ weight: "", reps: "275", rirActual: null }],
  "ex-2": [{ weight: "20", reps: "22", rirActual: null }],
};

function renderPanel(
  props: Partial<React.ComponentProps<typeof AmrapPairLoggingPanel>> = {},
) {
  const onUpdateSetInput = props.onUpdateSetInput ?? vi.fn();
  const onSetComplete = props.onSetComplete ?? vi.fn();

  render(
    <AmrapPairLoggingPanel
      exercises={props.exercises ?? exercises}
      inputMap={props.inputMap ?? inputMap}
      doneSetKeys={props.doneSetKeys ?? new Set()}
      activeSetKey={props.activeSetKey ?? null}
      pbSetKeys={props.pbSetKeys ?? new Set()}
      onUpdateSetInput={onUpdateSetInput}
      onSetComplete={onSetComplete}
    />,
  );

  return {
    onUpdateSetInput: vi.mocked(onUpdateSetInput),
    onSetComplete: vi.mocked(onSetComplete),
  };
}

describe("AmrapPairLoggingPanel", () => {
  it("renders a two-exercise AMRAP pair side by side", () => {
    renderPanel();

    expect(screen.getByTestId("amrap-pair-logging-panel")).toBeInTheDocument();
    expect(screen.getByTestId("amrap-pair-exercise-grid")).toBeInTheDocument();
    expect(screen.getByTestId("round-exercise-ex-1-column")).toBeInTheDocument();
    expect(screen.getByTestId("round-exercise-ex-2-column")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByLabelText("Reps for Ski Erg")).toHaveValue("275");
    expect(screen.getByLabelText("Weight for Sandbag Lunge")).toHaveValue("20");
    expect(screen.getByLabelText("Reps for Sandbag Lunge")).toHaveValue("22");
  });

  it("updates inputs and completes each exercise through the existing per-set handlers", () => {
    const { onUpdateSetInput, onSetComplete } = renderPanel();

    fireEvent.change(screen.getByLabelText("Reps for Ski Erg"), { target: { value: "290m" } });
    fireEvent.click(screen.getByRole("button", { name: "Ski Erg set 1 complete" }));

    expect(onUpdateSetInput).toHaveBeenCalledWith("ex-1", 0, expect.any(Function));
    expect(onUpdateSetInput.mock.calls[0][2](inputMap["ex-1"][0])).toEqual({
      weight: "",
      reps: "290",
      rirActual: null,
    });
    expect(onSetComplete).toHaveBeenCalledWith(exercises[0], 0);
  });

  it("does not render RIR or effort controls for AMRAP", () => {
    renderPanel();

    expect(screen.queryByRole("button", { name: /reps in reserve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Superset effort/i })).not.toBeInTheDocument();
  });

  it("disables a completed exercise set", () => {
    renderPanel({ doneSetKeys: new Set(["ex-1:0"]) });

    expect(screen.getByRole("button", { name: "Ski Erg set 1 complete" })).toBeDisabled();
    expect(screen.getByText("Logged")).toBeInTheDocument();
  });
});
