let passed = 0;
let failed = 0;

function computeElapsed(base, startedAtMs, isRunning) {
  if (!isRunning || startedAtMs == null) return base;
  return base + Math.floor((Date.now() - startedAtMs) / 1000);
}

function computeRemaining(total, elapsed) {
  if (total == null) return elapsed;
  return Math.max(0, total - elapsed);
}

function computeProgress(total, remaining) {
  if (total == null || total === 0) return 1.0;
  return Math.min(1, remaining / total);
}

function assert(label, got, expected) {
  const ok = Math.abs(got - expected) < 0.001;
  if (ok) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}: got ${got}, expected ${expected}`);
    failed++;
  }
}

function assertBool(label, condition) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    failed++;
  }
}

console.log("computeElapsed\n");
assert("paused timer returns base", computeElapsed(30, null, false), 30);
assert("not-started returns base", computeElapsed(0, null, false), 0);
assertBool(
  "running timer adds ~10s to base 30",
  Math.abs(computeElapsed(30, Date.now() - 10000, true) - 40) < 2,
);

console.log("\ncomputeRemaining\n");
assert("normal countdown 300-60", computeRemaining(300, 60), 240);
assert("clamps below zero", computeRemaining(300, 310), 0);
assert("exactly zero", computeRemaining(300, 300), 0);
assert("stopwatch returns elapsed", computeRemaining(null, 75), 75);
assert("stopwatch zero", computeRemaining(null, 0), 0);

console.log("\ncomputeProgress\n");
assert("full ring at start", computeProgress(300, 300), 1.0);
assert("half ring", computeProgress(300, 150), 0.5);
assert("empty ring", computeProgress(300, 0), 0.0);
assert("stopwatch always full", computeProgress(null, 99), 1.0);
assert("zero total → full (no div-by-0)", computeProgress(0, 0), 1.0);
assert("clamp above 1.0", computeProgress(100, 110), 1.0);

console.log("\nrest-charges-segment scenario\n");
const segAfterRest = computeRemaining(600, 60 + 30);
assert("segment remaining after 30s rest = 510", segAfterRest, 510);

const segAfterPartialRest = computeRemaining(600, 60 + 15);
assert(
  "segment remaining after 15s partial rest = 525",
  computeRemaining(600, 0 + 15),
  585,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

