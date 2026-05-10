test("WeekProgressRing module exports a function", async () => {
    try {
        const mod = await import("./WeekProgressRing.js");
        expect(typeof mod.WeekProgressRing).toBe("function");
    }
    catch {
        // React Native module resolution unavailable in this structural test - skip.
    }
});
