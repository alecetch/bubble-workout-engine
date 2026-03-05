import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { colors } from "../../theme/colors";
import { useTimerStore } from "../../state/timer/useTimerStore";

export type UseSegmentTimerParams = {
  segmentId: string;
  segmentTotal: number | null;
  restTotal: number;
};

export type UseSegmentTimerResult = {
  activeMode: "segment" | "rest";
  displaySeconds: number;
  progress: number;
  ringColor: string;
  isRunning: boolean;
  segmentFinished: boolean;
  restFinished: boolean;
  hasRest: boolean;
  canSwitchToRest: boolean;
  onStartPause: () => void;
  onReset: () => void;
  onSwitchMode: () => void;
};

type DisplayState = {
  activeMode: "segment" | "rest";
  displaySeconds: number;
  progress: number;
  ringColor: string;
  isRunning: boolean;
  segmentFinished: boolean;
  restFinished: boolean;
  canSwitchToRest: boolean;
};

function computeElapsed(base: number, startedAtMs: number | null, isRunning: boolean): number {
  if (!isRunning || startedAtMs == null) return base;
  return base + Math.floor((Date.now() - startedAtMs) / 1000);
}

function computeRemaining(total: number | null, elapsed: number): number {
  if (total == null) return elapsed;
  return Math.max(0, total - elapsed);
}

function computeProgress(total: number | null, remaining: number): number {
  if (total == null || total === 0) return 1.0;
  return Math.min(1, remaining / total);
}

export function useSegmentTimer(params: UseSegmentTimerParams): UseSegmentTimerResult {
  const { segmentId, segmentTotal, restTotal } = params;
  const finishedSegmentRef = useRef(false);
  const finishedRestRef = useRef(false);

  const [displayState, setDisplayState] = useState<DisplayState>({
    activeMode: "segment",
    displaySeconds: segmentTotal == null ? 0 : Math.max(0, segmentTotal),
    progress: computeProgress(segmentTotal, segmentTotal == null ? 0 : Math.max(0, segmentTotal)),
    ringColor: colors.success,
    isRunning: false,
    segmentFinished: false,
    restFinished: false,
    canSwitchToRest: false,
  });

  useEffect(() => {
    useTimerStore.getState().initEntry({ segmentId, segmentTotal, restTotal });
    // Intentionally run once on first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const entry = useTimerStore.getState().entries[segmentId];
      if (!entry) return;

      const liveSegmentElapsedRaw = computeElapsed(
        entry.segmentElapsedSeconds,
        entry.segmentStartedAtMs,
        entry.segmentIsRunning,
      );
      const liveSegmentElapsed = Math.max(
        0,
        segmentTotal == null ? liveSegmentElapsedRaw : Math.min(liveSegmentElapsedRaw, segmentTotal),
      );

      const liveRestElapsedRaw = computeElapsed(
        entry.restElapsedSeconds,
        entry.restStartedAtMs,
        entry.restIsRunning,
      );
      const liveRestElapsed = Math.max(0, Math.min(liveRestElapsedRaw, restTotal));

      const segmentRemaining = computeRemaining(segmentTotal, liveSegmentElapsed);
      const restRemaining = computeRemaining(restTotal, liveRestElapsed);

      if (entry.segmentIsRunning && segmentRemaining === 0 && !finishedSegmentRef.current) {
        finishedSegmentRef.current = true;
        useTimerStore.getState().finishSegment(segmentId);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      if (entry.restIsRunning && restRemaining === 0 && !finishedRestRef.current) {
        finishedRestRef.current = true;
        useTimerStore.getState().finishRest(segmentId);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      const activeMode = entry.activeMode;
      const displaySeconds = activeMode === "segment" ? segmentRemaining : restRemaining;
      const progress =
        activeMode === "segment"
          ? computeProgress(segmentTotal, segmentRemaining)
          : computeProgress(restTotal, restRemaining);
      const isRunning = activeMode === "segment" ? entry.segmentIsRunning : entry.restIsRunning;
      const segmentFinished = segmentTotal !== null && segmentRemaining === 0;
      const restFinished = restRemaining === 0 && liveRestElapsed > 0;

      setDisplayState({
        activeMode,
        displaySeconds,
        progress,
        ringColor: activeMode === "segment" ? colors.success : colors.accent,
        isRunning,
        segmentFinished,
        restFinished,
        canSwitchToRest: entry.segmentIsRunning,
      });
    }, 250);

    return () => {
      clearInterval(intervalId);
    };
  }, [segmentId]);

  const onStartPause = useCallback(() => {
    const store = useTimerStore.getState();
    const entry = store.entries[segmentId];
    if (!entry) return;

    if (entry.activeMode === "segment") {
      if (entry.segmentIsRunning) {
        store.pauseSegment(segmentId);
      } else {
        finishedSegmentRef.current = false;
        store.startSegment(segmentId);
      }
      return;
    }

    if (entry.restIsRunning) {
      // Intentional behavior: pausing while in rest mode exits rest and returns to segment flow.
      store.stopRest(segmentId);
    } else {
      finishedRestRef.current = false;
      store.startRest(segmentId);
    }
  }, [segmentId]);

  const onReset = useCallback(() => {
    const store = useTimerStore.getState();
    const entry = store.entries[segmentId];
    if (!entry) return;

    if (entry.activeMode === "segment") {
      finishedSegmentRef.current = false;
      store.resetSegment(segmentId);
    } else {
      finishedRestRef.current = false;
      store.resetRest(segmentId);
    }
  }, [segmentId]);

  const onSwitchMode = useCallback(() => {
    const store = useTimerStore.getState();
    const entry = store.entries[segmentId];
    if (!entry) return;

    if (entry.activeMode === "segment") {
      if (!entry.segmentIsRunning) return;
      finishedRestRef.current = false;
      store.startRest(segmentId);
      return;
    }

    finishedRestRef.current = false;
    store.stopRest(segmentId);
  }, [segmentId]);

  return useMemo(
    () => ({
      ...displayState,
      hasRest: restTotal > 0,
      onStartPause,
      onReset,
      onSwitchMode,
    }),
    [displayState, onReset, onStartPause, onSwitchMode, restTotal],
  );
}
