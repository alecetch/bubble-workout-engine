import type { TimerEntry } from "../../state/timer/useTimerStore";

export function buildTimerEntry(overrides?: Partial<TimerEntry>): TimerEntry {
  return {
    segmentId: "segment-test-1",
    activeMode: "segment",
    segmentTotalSeconds: null,
    segmentElapsedSeconds: 0,
    segmentIsRunning: false,
    segmentStartedAtMs: null,
    restTotalSeconds: 60,
    restElapsedSeconds: 0,
    restIsRunning: false,
    restStartedAtMs: null,
    ...overrides,
  };
}
