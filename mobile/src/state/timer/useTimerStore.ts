import { create } from "zustand";

export type TimerEntry = {
  segmentId: string;
  activeMode: "segment" | "rest";

  segmentTotalSeconds: number | null;
  segmentElapsedSeconds: number;
  segmentIsRunning: boolean;
  segmentStartedAtMs: number | null;

  restTotalSeconds: number;
  restElapsedSeconds: number;
  restIsRunning: boolean;
  restStartedAtMs: number | null;
};

type TimerStoreState = {
  entries: Record<string, TimerEntry>;
  activeSegmentId: string | null;

  initEntry: (p: { segmentId: string; segmentTotal: number | null; restTotal: number }) => void;
  startSegment: (segmentId: string) => void;
  pauseSegment: (segmentId: string) => void;
  resetSegment: (segmentId: string) => void;
  finishSegment: (segmentId: string) => void;
  startRest: (segmentId: string) => void;
  stopRest: (segmentId: string) => void;
  resetRest: (segmentId: string) => void;
  finishRest: (segmentId: string) => void;
};

function commitElapsed(entry: TimerEntry, mode: "segment" | "rest"): TimerEntry {
  if (mode === "segment") {
    if (!entry.segmentIsRunning || entry.segmentStartedAtMs == null) return entry;
    const added = Math.floor((Date.now() - entry.segmentStartedAtMs) / 1000);
    return {
      ...entry,
      segmentElapsedSeconds: entry.segmentElapsedSeconds + added,
      segmentIsRunning: false,
      segmentStartedAtMs: null,
    };
  }

  if (!entry.restIsRunning || entry.restStartedAtMs == null) return entry;
  const added = Math.floor((Date.now() - entry.restStartedAtMs) / 1000);
  return {
    ...entry,
    restElapsedSeconds: entry.restElapsedSeconds + added,
    restIsRunning: false,
    restStartedAtMs: null,
  };
}

export const useTimerStore = create<TimerStoreState>((set) => ({
  entries: {},
  activeSegmentId: null,

  initEntry: ({ segmentId, segmentTotal, restTotal }) =>
    set((state) => {
      if (state.entries[segmentId]) return state;

      const nextEntry: TimerEntry = {
        segmentId,
        activeMode: "segment",
        segmentTotalSeconds: segmentTotal,
        segmentElapsedSeconds: 0,
        segmentIsRunning: false,
        segmentStartedAtMs: null,
        restTotalSeconds: Math.max(1, Math.floor(restTotal)),
        restElapsedSeconds: 0,
        restIsRunning: false,
        restStartedAtMs: null,
      };

      return {
        ...state,
        entries: {
          ...state.entries,
          [segmentId]: nextEntry,
        },
      };
    }),

  startSegment: (segmentId) =>
    set((state) => {
      const current = state.entries[segmentId];
      if (!current) return state;

      const nextEntries = { ...state.entries };

      if (state.activeSegmentId && state.activeSegmentId !== segmentId) {
        const old = nextEntries[state.activeSegmentId];
        if (old) {
          nextEntries[state.activeSegmentId] = {
            ...old,
            segmentElapsedSeconds: 0,
            restElapsedSeconds: 0,
            segmentIsRunning: false,
            restIsRunning: false,
            segmentStartedAtMs: null,
            restStartedAtMs: null,
            activeMode: "segment",
          };
        }
      }

      const withCommittedRest = commitElapsed(nextEntries[segmentId] ?? current, "rest");
      nextEntries[segmentId] = {
        ...withCommittedRest,
        restIsRunning: false,
        restStartedAtMs: null,
        segmentIsRunning: true,
        segmentStartedAtMs: Date.now(),
        activeMode: "segment",
      };

      return {
        ...state,
        entries: nextEntries,
        activeSegmentId: segmentId,
      };
    }),

  pauseSegment: (segmentId) =>
    set((state) => {
      const entry = state.entries[segmentId];
      if (!entry) return state;

      return {
        ...state,
        entries: {
          ...state.entries,
          [segmentId]: commitElapsed(entry, "segment"),
        },
      };
    }),

  resetSegment: (segmentId) =>
    set((state) => {
      const entry = state.entries[segmentId];
      if (!entry) return state;

      return {
        ...state,
        entries: {
          ...state.entries,
          [segmentId]: {
            ...entry,
            segmentElapsedSeconds: 0,
            segmentIsRunning: false,
            segmentStartedAtMs: null,
          },
        },
      };
    }),

  finishSegment: (segmentId) =>
    set((state) => {
      const entry = state.entries[segmentId];
      if (!entry) return state;

      const committed = commitElapsed(entry, "segment");
      return {
        ...state,
        entries: {
          ...state.entries,
          [segmentId]: {
            ...committed,
            segmentIsRunning: false,
            segmentStartedAtMs: null,
            activeMode: committed.restTotalSeconds > 0 ? "rest" : committed.activeMode,
          },
        },
      };
    }),

  startRest: (segmentId) =>
    set((state) => {
      const entry = state.entries[segmentId];
      if (!entry) return state;

      const committed = commitElapsed(entry, "segment");
      return {
        ...state,
        entries: {
          ...state.entries,
          [segmentId]: {
            ...committed,
            segmentIsRunning: false,
            segmentStartedAtMs: null,
            restElapsedSeconds: 0,
            restStartedAtMs: Date.now(),
            restIsRunning: true,
            activeMode: "rest",
          },
        },
        activeSegmentId: segmentId,
      };
    }),

  stopRest: (segmentId) =>
    set((state) => {
      const entry = state.entries[segmentId];
      if (!entry) return state;

      const committed = commitElapsed(entry, "rest");
      const chargedSegmentElapsed =
        committed.segmentTotalSeconds !== null
          ? committed.segmentElapsedSeconds + committed.restElapsedSeconds
          : committed.segmentElapsedSeconds;

      return {
        ...state,
        entries: {
          ...state.entries,
          [segmentId]: {
            ...committed,
            segmentElapsedSeconds: chargedSegmentElapsed,
            restElapsedSeconds: 0,
            restIsRunning: false,
            restStartedAtMs: null,
            activeMode: "segment",
            segmentIsRunning: true,
            segmentStartedAtMs: Date.now(),
          },
        },
        activeSegmentId: segmentId,
      };
    }),

  resetRest: (segmentId) =>
    set((state) => {
      const entry = state.entries[segmentId];
      if (!entry) return state;

      return {
        ...state,
        entries: {
          ...state.entries,
          [segmentId]: {
            ...entry,
            restElapsedSeconds: 0,
            restIsRunning: false,
            restStartedAtMs: null,
          },
        },
      };
    }),

  finishRest: (segmentId) =>
    set((state) => {
      const entry = state.entries[segmentId];
      if (!entry) return state;

      const committed = commitElapsed(entry, "rest");
      const chargedSegmentElapsed =
        committed.segmentTotalSeconds !== null
          ? committed.segmentElapsedSeconds + committed.restElapsedSeconds
          : committed.segmentElapsedSeconds;

      return {
        ...state,
        entries: {
          ...state.entries,
          [segmentId]: {
            ...committed,
            segmentElapsedSeconds: chargedSegmentElapsed,
            restElapsedSeconds: 0,
            restIsRunning: false,
            restStartedAtMs: null,
            activeMode: "segment",
            segmentIsRunning: true,
            segmentStartedAtMs: Date.now(),
          },
        },
        activeSegmentId: segmentId,
      };
    }),
}));

