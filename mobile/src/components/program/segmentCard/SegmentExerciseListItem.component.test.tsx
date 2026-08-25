import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildExercise } from "../../../__test-utils__";
import { SegmentExerciseListItem } from "./SegmentExerciseListItem";

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

const exercise = buildExercise({ id: "ex-1", exerciseId: "bb-squat", name: "Barbell Squat" });

function renderItem(
  props: Partial<React.ComponentProps<typeof SegmentExerciseListItem>> = {},
) {
  return render(
    <SegmentExerciseListItem
      exercise={props.exercise ?? exercise}
      index={props.index ?? 0}
      line2={props.line2 ?? "3 sets 8 reps"}
      summary={props.summary ?? "3 x 8 @ 80 kg ✓"}
      isComplete={props.isComplete ?? false}
      programExerciseId={props.programExerciseId ?? "ex-1"}
      exerciseId={props.exerciseId ?? "bb-squat"}
      inlineLoggingOpen={props.inlineLoggingOpen ?? false}
      hasLoggableExercises={props.hasLoggableExercises ?? true}
      isRoundBased={props.isRoundBased ?? false}
      showResumeButton={props.showResumeButton ?? false}
      onViewExerciseDetail={props.onViewExerciseDetail ?? vi.fn()}
      onStartExercise={props.onStartExercise ?? vi.fn()}
      onResumeExercise={props.onResumeExercise ?? vi.fn()}
    />,
  );
}

describe("SegmentExerciseListItem", () => {
  it("renders line2 and summary when provided and omits them when null", () => {
    const { rerender } = renderItem();

    expect(screen.getByText("3 sets 8 reps")).toBeInTheDocument();
    expect(screen.getByText("3 x 8 @ 80 kg ✓")).toBeInTheDocument();

    rerender(
      <SegmentExerciseListItem
        exercise={exercise}
        index={0}
        line2={null}
        summary={null}
        isComplete={false}
        programExerciseId="ex-1"
        exerciseId="bb-squat"
        inlineLoggingOpen={false}
        hasLoggableExercises
        isRoundBased={false}
        showResumeButton={false}
        onViewExerciseDetail={vi.fn()}
        onStartExercise={vi.fn()}
        onResumeExercise={vi.fn()}
      />,
    );

    expect(screen.queryByText("3 sets 8 reps")).not.toBeInTheDocument();
    expect(screen.queryByText("3 x 8 @ 80 kg ✓")).not.toBeInTheDocument();
  });

  it("shows the resume button only when showResumeButton is true", () => {
    const { rerender } = renderItem({ showResumeButton: false });
    expect(screen.queryByText("Resume")).not.toBeInTheDocument();

    rerender(
      <SegmentExerciseListItem
        exercise={exercise}
        index={0}
        line2={null}
        summary={null}
        isComplete={false}
        programExerciseId="ex-1"
        exerciseId="bb-squat"
        inlineLoggingOpen={false}
        hasLoggableExercises
        isRoundBased={false}
        showResumeButton
        onViewExerciseDetail={vi.fn()}
        onStartExercise={vi.fn()}
        onResumeExercise={vi.fn()}
      />,
    );

    expect(screen.getByText("Resume")).toBeInTheDocument();
  });

  it("calls onViewExerciseDetail with the right ids when the row title is tapped", () => {
    const onViewExerciseDetail = vi.fn();
    renderItem({ onViewExerciseDetail });

    fireEvent.click(screen.getByText("Barbell Squat"));

    expect(onViewExerciseDetail).toHaveBeenCalledWith("bb-squat", "ex-1", "Barbell Squat", exercise);
  });
});
