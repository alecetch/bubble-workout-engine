import { useCallback, useState } from "react";

export function useExerciseSwapSheet(params: {
  onSwapApplied?: () => void;
} = {}): {
  swapSheetVisible: boolean;
  swapTargetProgramExerciseId: string | null;
  swapTargetExerciseName: string | null;
  openSwapSheet: (programExerciseId: string, exerciseName: string) => void;
  closeSwapSheet: () => void;
  handleSwapApplied: () => void;
} {
  const { onSwapApplied } = params;
  const [swapSheetVisible, setSwapSheetVisible] = useState(false);
  const [swapTargetProgramExerciseId, setSwapTargetProgramExerciseId] = useState<string | null>(null);
  const [swapTargetExerciseName, setSwapTargetExerciseName] = useState<string | null>(null);

  const closeSwapSheet = useCallback(() => {
    setSwapSheetVisible(false);
    setSwapTargetProgramExerciseId(null);
    setSwapTargetExerciseName(null);
  }, []);

  const openSwapSheet = useCallback((programExerciseId: string, exerciseName: string) => {
    setSwapTargetProgramExerciseId(programExerciseId);
    setSwapTargetExerciseName(exerciseName);
    setSwapSheetVisible(true);
  }, []);

  const handleSwapApplied = useCallback(() => {
    closeSwapSheet();
    onSwapApplied?.();
  }, [closeSwapSheet, onSwapApplied]);

  return {
    swapSheetVisible,
    swapTargetProgramExerciseId,
    swapTargetExerciseName,
    openSwapSheet,
    closeSwapSheet,
    handleSwapApplied,
  };
}
