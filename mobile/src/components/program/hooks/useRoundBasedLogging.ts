import { useCallback, useState } from "react";
import type React from "react";

export function useRoundBasedLogging(): {
  activeRoundIndex: number;
  setActiveRoundIndex: React.Dispatch<React.SetStateAction<number>>;
  completedRoundIndices: Set<number>;
  setCompletedRoundIndices: React.Dispatch<React.SetStateAction<Set<number>>>;
  expandedRoundIndices: Set<number>;
  setExpandedRoundIndices: React.Dispatch<React.SetStateAction<Set<number>>>;
  roundSaveError: string | null;
  setRoundSaveError: React.Dispatch<React.SetStateAction<string | null>>;
  showPostStopRir: boolean;
  setShowPostStopRir: React.Dispatch<React.SetStateAction<boolean>>;
  resetRoundState: () => void;
} {
  const [activeRoundIndex, setActiveRoundIndex] = useState(0);
  const [completedRoundIndices, setCompletedRoundIndices] = useState<Set<number>>(new Set());
  const [expandedRoundIndices, setExpandedRoundIndices] = useState<Set<number>>(new Set());
  const [roundSaveError, setRoundSaveError] = useState<string | null>(null);
  const [showPostStopRir, setShowPostStopRir] = useState(false);

  const resetRoundState = useCallback(() => {
    setCompletedRoundIndices(new Set());
    setExpandedRoundIndices(new Set());
    setActiveRoundIndex(0);
    setRoundSaveError(null);
    setShowPostStopRir(false);
  }, []);

  return {
    activeRoundIndex,
    setActiveRoundIndex,
    completedRoundIndices,
    setCompletedRoundIndices,
    expandedRoundIndices,
    setExpandedRoundIndices,
    roundSaveError,
    setRoundSaveError,
    showPostStopRir,
    setShowPostStopRir,
    resetRoundState,
  };
}
