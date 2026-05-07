import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetForTest,
  getDayStatus,
  getSegmentLog,
  hasAnySegmentLog,
  setSegmentLog,
  setWorkoutComplete,
} from "./localWorkoutLog";

describe("localWorkoutLog", () => {
  beforeEach(() => {
    _resetForTest();
  });

  it("returns scheduled for a day with no logs", async () => {
    await expect(getDayStatus("day-1", [])).resolves.toBe("scheduled");
  });

  it("returns complete when the workout complete marker is set", async () => {
    await setSegmentLog("day-1", "seg-1", { rounds: 3 });
    await setSegmentLog("day-1", "seg-2", { rounds: 2 });
    await setWorkoutComplete("day-1", true);
    await expect(getDayStatus("day-1", ["seg-1", "seg-2"])).resolves.toBe("complete");
  });

  it("returns started when only some required segments are logged", async () => {
    await setSegmentLog("day-1", "seg-1", { rounds: 3 });
    await expect(getDayStatus("day-1", ["seg-1", "seg-2"])).resolves.toBe("started");
  });

  it("returns scheduled for an unknown program day id", async () => {
    await setSegmentLog("day-1", "seg-1", { rounds: 3 });
    await expect(getDayStatus("unknown-day", ["seg-1"])).resolves.toBe("scheduled");
  });

  it("returns scheduled for nullish program day ids without throwing", async () => {
    await expect(getDayStatus(undefined as unknown as string, [])).resolves.toBe("scheduled");
    await expect(getDayStatus(null as unknown as string, [])).resolves.toBe("scheduled");
  });

  it("returns one of the known statuses", async () => {
    const status = await getDayStatus("day-1", []);
    expect(["scheduled", "started", "complete", "completed"]).toContain(status);
  });

  it("is deterministic for identical inputs", async () => {
    await setSegmentLog("day-1", "seg-1", { rounds: 3 });
    const first = await getDayStatus("day-1", ["seg-1"]);
    const second = await getDayStatus("day-1", ["seg-1"]);
    expect(second).toBe(first);
  });

  it("stores and reads segment logs for UUID-like ids", async () => {
    const dayId = "550e8400-e29b-41d4-a716-446655440000";
    await setSegmentLog(dayId, "seg-a", { rounds: 4, notes: "felt good" });
    await expect(hasAnySegmentLog(dayId, ["seg-a"])).resolves.toBe(true);
    await expect(getSegmentLog(dayId, "seg-a")).resolves.toMatchObject({
      rounds: 4,
      notes: "felt good",
    });
  });
});
