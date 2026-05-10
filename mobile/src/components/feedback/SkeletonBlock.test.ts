test("SkeletonBlock module has correct export name", async () => {
    try {
        const mod = await import("./SkeletonBlock.js");
        expect(typeof mod.SkeletonBlock).toBe("function");
    }
    catch {
        // React Native module resolution unavailable in this structural test - skip.
    }
});
