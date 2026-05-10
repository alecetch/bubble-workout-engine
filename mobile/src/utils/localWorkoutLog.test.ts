import { _resetForTest, getDayStatus, getSegmentLog, getWorkoutComplete, hasAnySegmentLog, setSegmentLog, setWorkoutComplete, } from "./localWorkoutLog.js";
beforeEach(() => {
    _resetForTest();
});
test("getSegmentLog returns null when nothing has been written", async () => {
    expect(await getSegmentLog("day-a7-1", "segment-a")).toBe(null);
});
test("getSegmentLog returns stored entry after setSegmentLog", async () => {
    await setSegmentLog("day-a7-2", "segment-a", { load: 80, rounds: 3, notes: "Strong" });
    const entry = await getSegmentLog("day-a7-2", "segment-a");
    expect(entry?.load).toBe(80);
    expect(entry?.rounds).toBe(3);
    expect(entry?.notes).toBe("Strong");
});
test("setSegmentLog persists load rounds notes and updatedAt", async () => {
    const entry = await setSegmentLog("day-a7-3", "segment-a", { load: 60, rounds: 2, notes: "Steady" });
    expect(entry.load).toBe(60);
    expect(entry.rounds).toBe(2);
    expect(entry.notes).toBe("Steady");
    expect(entry.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});
test("setSegmentLog overwrites an existing entry", async () => {
    await setSegmentLog("day-a7-4", "segment-a", { load: 60, rounds: 2, notes: "First" });
    await setSegmentLog("day-a7-4", "segment-a", { load: 70, rounds: 4, notes: "Second" });
    const entry = await getSegmentLog("day-a7-4", "segment-a");
    expect(entry?.load).toBe(70);
    expect(entry?.rounds).toBe(4);
    expect(entry?.notes).toBe("Second");
});
test("getWorkoutComplete defaults to false", async () => {
    expect(await getWorkoutComplete("day-a7-5")).toBe(false);
});
test("setWorkoutComplete(true) makes getWorkoutComplete return true", async () => {
    await setWorkoutComplete("day-a7-6", true);
    expect(await getWorkoutComplete("day-a7-6")).toBe(true);
});
test("setWorkoutComplete(false) makes getWorkoutComplete return false", async () => {
    await setWorkoutComplete("day-a7-7", true);
    await setWorkoutComplete("day-a7-7", false);
    expect(await getWorkoutComplete("day-a7-7")).toBe(false);
});
test("hasAnySegmentLog returns false when no logs exist", async () => {
    expect(await hasAnySegmentLog("day-a7-8", ["segment-a", "segment-b"])).toBe(false);
});
test("hasAnySegmentLog returns true after one segment is logged", async () => {
    await setSegmentLog("day-a7-9", "segment-b", { load: 50 });
    expect(await hasAnySegmentLog("day-a7-9", ["segment-a", "segment-b"])).toBe(true);
});
test("hasAnySegmentLog returns false for empty segment ids", async () => {
    expect(await hasAnySegmentLog("day-a7-10", [])).toBe(false);
});
test("getDayStatus returns scheduled with no data", async () => {
    expect(await getDayStatus("day-a7-11", ["segment-a"])).toBe("scheduled");
});
test("getDayStatus returns started after setSegmentLog", async () => {
    await setSegmentLog("day-a7-12", "segment-a", { load: 40 });
    expect(await getDayStatus("day-a7-12", ["segment-a"])).toBe("started");
});
test("getDayStatus returns complete after setWorkoutComplete(true)", async () => {
    await setWorkoutComplete("day-a7-13", true);
    expect(await getDayStatus("day-a7-13", ["segment-a"])).toBe("complete");
});
