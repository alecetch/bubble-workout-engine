import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogSegmentModal } from "./LogSegmentModal";
import { useSegmentExerciseLogs, useSaveSegmentLogs } from "../../api/hooks";
import { useTimerStore } from "../../state/timer/useTimerStore";
import type { SegmentLogRow } from "../../api/segmentLog";

vi.mock("../../api/hooks", () => ({
  useSegmentExerciseLogs: vi.fn(),
  useSaveSegmentLogs: vi.fn(),
}));

vi.mock("../../state/timer/useTimerStore", () => ({
  useTimerStore: vi.fn(),
}));

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
}));

vi.mock("../interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const useSegmentExerciseLogsMock = vi.mocked(useSegmentExerciseLogs);
const useSaveSegmentLogsMock = vi.mocked(useSaveSegmentLogs);
const useTimerStoreMock = vi.mocked(useTimerStore);

const saveMutateMock = vi.fn();
const onSaveMock = vi.fn();

const mockSegment = {
  id: "seg-1",
  purpose: "main",
  segmentType: "single",
  segmentTypeLabel: null,
  segmentName: "Main Strength",
  orderInDay: 1,
  rounds: 1,
  segmentDurationSeconds: null,
  segmentDurationMmss: null,
  notes: null,
  postSegmentRestSec: 90,
  exercises: [
    {
      id: "ex-1",
      exerciseId: "back-squat",
      name: "Back Squat",
      sets: 3,
      reps: "5",
      repsUnit: "reps",
      intensity: "100 kg",
      tempo: null,
      restSeconds: 90,
      notes: null,
      equipment: null,
      isLoadable: true,
      guidelineLoad: { value: 100, unit: "kg", source: "planned" },
      progressionRecommendation: null,
      adaptationDecision: null,
      coachingCuesJson: [],
      isNewExercise: false,
    },
    {
      id: "ex-2",
      exerciseId: "bench-press",
      name: "Bench Press",
      sets: 3,
      reps: "8",
      repsUnit: "reps",
      intensity: "70 kg",
      tempo: null,
      restSeconds: 90,
      notes: null,
      equipment: null,
      isLoadable: true,
      guidelineLoad: { value: 70, unit: "kg", source: "planned" },
      progressionRecommendation: null,
      adaptationDecision: null,
      coachingCuesJson: [],
      isNewExercise: false,
    },
  ],
};

function renderModal(visible = true) {
  const onClose = vi.fn();
  render(
    <LogSegmentModal
      segment={mockSegment as any}
      visible={visible}
      onClose={onClose}
      onSave={onSaveMock}
      programDayId="day-1"
      programId="program-1"
      userId="user-1"
    />,
  );
  return { onClose };
}

describe("LogSegmentModal", () => {
  beforeEach(() => {
    saveMutateMock.mockReset();
    saveMutateMock.mockImplementation((_payload, options) => options?.onSuccess?.({ saved: 6, prs: [] }));
    onSaveMock.mockReset();

    useTimerStoreMock.mockImplementation((selector: any) => selector({ entries: {} }));
    (useTimerStoreMock as any).getState = () => ({ stopRest: vi.fn() });
    useSegmentExerciseLogsMock.mockReturnValue({
      data: [],
      isLoading: false,
    } as any);
    useSaveSegmentLogsMock.mockReturnValue({
      mutate: saveMutateMock,
      isPending: false,
      isError: false,
    } as any);
  });

  it("renders segment name and planned sets", () => {
    renderModal();

    expect(screen.getByText("Log Segment")).toBeInTheDocument();
    expect(screen.getByText("Main Strength")).toBeInTheDocument();
    expect(screen.getAllByText("Back Squat").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Bench Press").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Set [123]/)).toHaveLength(6);
  });

  it("renders planned weight and reps for each set", () => {
    renderModal();

    expect(screen.getByText("3 sets x 5 • 100 kg")).toBeInTheDocument();
    expect(screen.getByText("3 sets x 8 • 70 kg")).toBeInTheDocument();
  });

  it("Save button calls mutation with correct payload", async () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      renderModal();

      fireEvent.change(screen.getByLabelText("Back Squat set 1 weight"), { target: { value: "105" } });
      fireEvent.change(screen.getByLabelText("Back Squat set 1 reps"), { target: { value: "6" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(saveMutateMock).toHaveBeenCalledTimes(1));
      expect(saveMutateMock.mock.calls[0][0]).toMatchObject({
        userId: "user-1",
        programId: "program-1",
        programDayId: "day-1",
        workoutSegmentId: "seg-1",
        rows: expect.arrayContaining([
          {
            programExerciseId: "ex-1",
            orderIndex: 1,
            weightKg: 105,
            repsCompleted: 6,
            rirActual: null,
          },
        ]),
      });
    } finally {
      consoleLogSpy.mockRestore();
    }
  });

  it('shows "Saved workout data loaded" banner when prior logs exist', () => {
    const rows: SegmentLogRow[] = [
      {
        id: "log-1",
        programExerciseId: "ex-1",
        orderIndex: 1,
        weightKg: 110,
        repsCompleted: 4,
        rirActual: 2,
      },
    ];
    useSegmentExerciseLogsMock.mockReturnValue({
      data: rows,
      isLoading: false,
    } as any);

    renderModal();

    expect(screen.getByText("Saved workout data loaded")).toBeInTheDocument();
    expect(screen.getByText("Fields marked as saved came from your last logged entry, not from the prefill.")).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("shows effort selector and records RIR selection", () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Could do 2 more reps" }));

    expect(screen.getByText("Could do 2 more reps")).toBeInTheDocument();
  });

  it("Save button is disabled while mutation is pending", () => {
    useSaveSegmentLogsMock.mockReturnValue({
      mutate: saveMutateMock,
      isPending: true,
      isError: false,
    } as any);

    renderModal();

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
  });

  it("shows save error when mutation rejects", () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      saveMutateMock.mockImplementation((_payload, options) => options?.onError?.(new Error("save failed")));
      useSaveSegmentLogsMock.mockReturnValue({
        mutate: saveMutateMock,
        isPending: false,
        isError: true,
      } as any);

      renderModal();

      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(screen.getByText("Save failed. Please try again.")).toBeInTheDocument();
    } finally {
      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    }
  });

  it("Cancel button calls onClose without saving", () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(saveMutateMock).not.toHaveBeenCalled();
  });
});
