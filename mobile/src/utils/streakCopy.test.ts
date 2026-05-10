import { streakCopy } from "./streakCopy.js";
test("returns start copy for 0 streak", () => {
    expect(streakCopy(0)).toBe("Start your streak today.");
});
test("returns singular for streak of 1", () => {
    expect(streakCopy(1)).toBe("1 session down. Keep it going.");
});
test("returns momentum copy for streaks 2-4", () => {
    expect(streakCopy(3).includes("Good momentum.")).toBeTruthy();
});
test("returns strong copy for streaks 5-9", () => {
    expect(streakCopy(7).includes("strong")).toBeTruthy();
});
test("returns building copy for streaks 10-19", () => {
    expect(streakCopy(15).includes("building something real")).toBeTruthy();
});
test("returns elite copy for streaks 20+", () => {
    expect(streakCopy(25).includes("Elite")).toBeTruthy();
});
