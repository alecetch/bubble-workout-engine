import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExerciseSwapSheet } from "./ExerciseSwapSheet";
import { useApplyExerciseSwap, useExerciseSwapOptions } from "../../api/hooks";

vi.mock("../../api/hooks", () => ({
  useApplyExerciseSwap: vi.fn(),
  useExerciseSwapOptions: vi.fn(),
}));

vi.mock("../interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  return {
    ...actual,
    Modal: ({ visible, children }: any) => (visible ? <div>{children}</div> : null),
  };
});

const useExerciseSwapOptionsMock = vi.mocked(useExerciseSwapOptions);
const useApplyExerciseSwapMock = vi.mocked(useApplyExerciseSwap);
const mutateMock = vi.fn();

const options = [
  { exerciseId: "ex-1", name: "Goblet Squat", rationale: "Similar squat pattern", isLoadable: true },
  { exerciseId: "ex-2", name: "Leg Press", rationale: "Quad dominant", isLoadable: true },
  { exerciseId: "ex-3", name: "Step Up", rationale: "Single-leg option", isLoadable: false },
];

function renderSheet() {
  render(
    <ExerciseSwapSheet
      visible
      programExerciseId="pe-1"
      currentExerciseName="Back Squat"
      programDayId="day-1"
      userId="user-1"
      onClose={vi.fn()}
    />,
  );
}

describe("ExerciseSwapSheet", () => {
  beforeEach(() => {
    mutateMock.mockReset();
    useApplyExerciseSwapMock.mockReturnValue({
      mutate: mutateMock,
      isPending: false,
      isError: false,
    } as any);
    useExerciseSwapOptionsMock.mockReturnValue({
      data: { options },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);
  });

  it("renders the loading state", () => {
    useExerciseSwapOptionsMock.mockReturnValueOnce({ isLoading: true } as any);
    renderSheet();
    expect(screen.getByText("Loading swap options...")).toBeInTheDocument();
  });

  it("renders swap alternatives", () => {
    renderSheet();
    expect(screen.getByText("Goblet Squat")).toBeInTheDocument();
    expect(screen.getByText("Leg Press")).toBeInTheDocument();
    expect(screen.getByText("Step Up")).toBeInTheDocument();
  });

  it("shows a confirmation step after selecting an option", () => {
    renderSheet();
    fireEvent.click(screen.getByText("Leg Press"));
    expect(screen.getByText("Swap Back Squat for Leg Press?")).toBeInTheDocument();
    expect(screen.getByText("Confirm swap")).toBeInTheDocument();
  });

  it("confirms swaps with the selected exercise payload", () => {
    renderSheet();
    fireEvent.click(screen.getByText("Leg Press"));
    fireEvent.click(screen.getByText("Confirm swap"));
    expect(mutateMock).toHaveBeenCalledWith(
      {
        programExerciseId: "pe-1",
        exerciseId: "ex-2",
        reason: null,
        programDayId: "day-1",
        userId: "user-1",
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("renders an empty state", () => {
    useExerciseSwapOptionsMock.mockReturnValueOnce({
      data: { options: [] },
      isLoading: false,
      isError: false,
    } as any);
    renderSheet();
    expect(screen.getByText("No swap options available")).toBeInTheDocument();
  });

  it("renders an error state", () => {
    useExerciseSwapOptionsMock.mockReturnValueOnce({
      isLoading: false,
      isError: true,
      error: { message: "fail" },
      refetch: vi.fn(),
    } as any);
    renderSheet();
    expect(screen.getByText("Unable to load swap options")).toBeInTheDocument();
  });
});
