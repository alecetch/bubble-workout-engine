// Host-side delay (GraalJS on the Maestro JVM process, not on device — no gRPC needed).
// The first launchApp restarts the Maestro instrumentation; gRPC drops while the new
// server starts. This sleep bridges that gap. Java Thread.sleep is non-blocking so it
// does not starve the emulator process the way a JS busy-wait would.
try {
    java.lang.Thread.sleep(3000);
} catch (e) {
    // Fallback if Java interop is unavailable in this GraalJS context
    var end = Date.now() + 3000;
    while (Date.now() < end) {}
}
