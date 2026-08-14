/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useExerciseSwapSheet } from "./useExerciseSwapSheet";

describe("useExerciseSwapSheet", () => {
  it("opens and closes the sheet with the target exercise", () => {
    const { result } = renderHook(() => useExerciseSwapSheet());

    act(() => {
      result.current.openSwapSheet("pe-1", "Back Squat");
    });

    expect(result.current.swapSheetVisible).toBe(true);
    expect(result.current.swapTargetProgramExerciseId).toBe("pe-1");
    expect(result.current.swapTargetExerciseName).toBe("Back Squat");

    act(() => {
      result.current.closeSwapSheet();
    });

    expect(result.current.swapSheetVisible).toBe(false);
    expect(result.current.swapTargetProgramExerciseId).toBeNull();
    expect(result.current.swapTargetExerciseName).toBeNull();
  });

  it("closes the sheet and calls the applied callback after a swap", () => {
    const onSwapApplied = vi.fn();
    const { result } = renderHook(() => useExerciseSwapSheet({ onSwapApplied }));

    act(() => {
      result.current.openSwapSheet("pe-1", "Back Squat");
      result.current.handleSwapApplied();
    });

    expect(result.current.swapSheetVisible).toBe(false);
    expect(onSwapApplied).toHaveBeenCalledTimes(1);
  });
});
