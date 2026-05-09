import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimerStore } from "./useTimerStore";

function entry(segmentId = "seg-1") {
  return useTimerStore.getState().entries[segmentId];
}

describe("useTimerStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
    useTimerStore.setState({ entries: {}, activeSegmentId: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with no active timer entries", () => {
    expect(useTimerStore.getState().entries).toEqual({});
    expect(useTimerStore.getState().activeSegmentId).toBeNull();
  });

  it("initEntry creates a stopped segment and rest timer", () => {
    useTimerStore.getState().initEntry({ segmentId: "seg-1", segmentTotal: 90, restTotal: 30 });
    expect(entry()).toMatchObject({
      segmentTotalSeconds: 90,
      segmentElapsedSeconds: 0,
      segmentIsRunning: false,
      restTotalSeconds: 30,
      restElapsedSeconds: 0,
      restIsRunning: false,
    });
  });

  it("startSegment marks the segment as running", () => {
    useTimerStore.getState().initEntry({ segmentId: "seg-1", segmentTotal: 90, restTotal: 30 });
    useTimerStore.getState().startSegment("seg-1");
    expect(entry().segmentIsRunning).toBe(true);
    expect(useTimerStore.getState().activeSegmentId).toBe("seg-1");
  });

  it("pauseSegment commits elapsed seconds", () => {
    useTimerStore.getState().initEntry({ segmentId: "seg-1", segmentTotal: 90, restTotal: 30 });
    useTimerStore.getState().startSegment("seg-1");
    vi.setSystemTime(new Date("2026-05-01T12:00:01Z"));
    useTimerStore.getState().pauseSegment("seg-1");
    expect(entry().segmentElapsedSeconds).toBe(1);
    expect(entry().segmentIsRunning).toBe(false);
  });

  it("finishSegment commits elapsed time and switches to rest mode", () => {
    useTimerStore.getState().initEntry({ segmentId: "seg-1", segmentTotal: 90, restTotal: 30 });
    useTimerStore.getState().startSegment("seg-1");
    vi.setSystemTime(new Date("2026-05-01T12:00:03Z"));
    useTimerStore.getState().finishSegment("seg-1");
    expect(entry().segmentElapsedSeconds).toBe(3);
    expect(entry().segmentIsRunning).toBe(false);
    expect(entry().activeMode).toBe("rest");
  });

  it("startRest stops segment timing and starts rest timing", () => {
    useTimerStore.getState().initEntry({ segmentId: "seg-1", segmentTotal: 90, restTotal: 30 });
    useTimerStore.getState().startSegment("seg-1");
    vi.setSystemTime(new Date("2026-05-01T12:00:02Z"));
    useTimerStore.getState().startRest("seg-1");
    expect(entry()).toMatchObject({
      segmentElapsedSeconds: 2,
      segmentIsRunning: false,
      restElapsedSeconds: 0,
      restIsRunning: true,
      activeMode: "rest",
    });
  });

  it("stopRest charges rest elapsed time back to the segment", () => {
    useTimerStore.getState().initEntry({ segmentId: "seg-1", segmentTotal: 90, restTotal: 30 });
    useTimerStore.getState().startRest("seg-1");
    vi.setSystemTime(new Date("2026-05-01T12:00:05Z"));
    useTimerStore.getState().stopRest("seg-1");
    expect(entry().segmentElapsedSeconds).toBe(5);
    expect(entry().restElapsedSeconds).toBe(0);
    expect(entry().segmentIsRunning).toBe(true);
  });

  it("resetSegment and resetRest clear elapsed state", () => {
    useTimerStore.getState().initEntry({ segmentId: "seg-1", segmentTotal: 90, restTotal: 30 });
    useTimerStore.getState().startSegment("seg-1");
    vi.setSystemTime(new Date("2026-05-01T12:00:02Z"));
    useTimerStore.getState().pauseSegment("seg-1");
    useTimerStore.getState().startRest("seg-1");
    vi.setSystemTime(new Date("2026-05-01T12:00:05Z"));
    useTimerStore.getState().resetSegment("seg-1");
    useTimerStore.getState().resetRest("seg-1");
    expect(entry().segmentElapsedSeconds).toBe(0);
    expect(entry().restElapsedSeconds).toBe(0);
    expect(entry().segmentIsRunning).toBe(false);
    expect(entry().restIsRunning).toBe(false);
  });
});
