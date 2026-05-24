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
  restOverrideKey?: string | null;
};

type TimerStoreState = {
  entries: Record<string, TimerEntry>;
  restOverrides: Record<string, number>;
  activeSegmentId: string | null;

  initEntry: (p: { segmentId: string; segmentTotal: number | null; restTotal: number; restOverrideKey?: string | null }) => void;
  setRestDuration: (segmentId: string, seconds: number, restOverrideKey?: string | null) => void;
  adjustRestDuration: (segmentId: string, deltaSeconds: number, restOverrideKey?: string | null) => void;
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
  restOverrides: {},
  activeSegmentId: null,

  initEntry: ({ segmentId, segmentTotal, restTotal, restOverrideKey = null }) =>
    set((state) => {
      const overrideTotal = restOverrideKey ? state.restOverrides[restOverrideKey] : undefined;
      if (state.entries[segmentId]) {
        const current = state.entries[segmentId];
        const nextRestTotal = Math.max(0, Math.floor(overrideTotal ?? restTotal));
        if (current.restTotalSeconds === nextRestTotal && current.restOverrideKey === restOverrideKey) return state;
        return {
          ...state,
          entries: {
            ...state.entries,
            [segmentId]: {
              ...current,
              restTotalSeconds: nextRestTotal,
              restOverrideKey,
            },
          },
        };
      }

      const nextEntry: TimerEntry = {
        segmentId,
        activeMode: "segment",
        segmentTotalSeconds: segmentTotal,
        segmentElapsedSeconds: 0,
        segmentIsRunning: false,
        segmentStartedAtMs: null,
        restTotalSeconds: Math.max(0, Math.floor(overrideTotal ?? restTotal)),
        restElapsedSeconds: 0,
        restIsRunning: false,
        restStartedAtMs: null,
        restOverrideKey,
      };

      return {
        ...state,
        entries: {
          ...state.entries,
          [segmentId]: nextEntry,
        },
      };
    }),

  setRestDuration: (segmentId, seconds, restOverrideKey = null) =>
    set((state) => {
      const entry = state.entries[segmentId];
      const clamped = Math.max(0, Math.min(600, Math.floor(seconds)));
      const nextOverrides = restOverrideKey
        ? { ...state.restOverrides, [restOverrideKey]: clamped }
        : state.restOverrides;
      if (!entry) {
        return { ...state, restOverrides: nextOverrides };
      }
      const committed = commitElapsed(entry, "rest");
      return {
        ...state,
        restOverrides: nextOverrides,
        entries: {
          ...state.entries,
          [segmentId]: {
            ...committed,
            restTotalSeconds: clamped,
            restElapsedSeconds: Math.min(committed.restElapsedSeconds, clamped),
            restStartedAtMs: entry.restIsRunning ? Date.now() : null,
            restIsRunning: entry.restIsRunning,
            restOverrideKey,
          },
        },
      };
    }),

  adjustRestDuration: (segmentId, deltaSeconds, restOverrideKey = null) =>
    set((state) => {
      const entry = state.entries[segmentId];
      const base = entry?.restTotalSeconds ?? (restOverrideKey ? state.restOverrides[restOverrideKey] : 0) ?? 0;
      const clamped = Math.max(0, Math.min(600, Math.floor(base + deltaSeconds)));
      const nextOverrides = restOverrideKey
        ? { ...state.restOverrides, [restOverrideKey]: clamped }
        : state.restOverrides;
      if (!entry) {
        return { ...state, restOverrides: nextOverrides };
      }
      const committed = commitElapsed(entry, "rest");
      return {
        ...state,
        restOverrides: nextOverrides,
        entries: {
          ...state.entries,
          [segmentId]: {
            ...committed,
            restTotalSeconds: clamped,
            restElapsedSeconds: Math.min(committed.restElapsedSeconds, clamped),
            restStartedAtMs: entry.restIsRunning ? Date.now() : null,
            restIsRunning: entry.restIsRunning,
            restOverrideKey,
          },
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

