/**
 * Runnable assertion script for the day-pill mapping logic.
 * No test framework required — just Node:
 *   node mobile/scripts/testBuildDayPillParts.mjs
 *
 * These are the same pure functions used inside CalendarDayPillRow.tsx.
 * If you change the mapping logic there, keep this in sync.
 */

const UTC_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_TO_PILL_LETTER = { mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S", sun: "S" };

function toDayPillWeekday(value) {
  const key = value.trim().slice(0, 3).toLowerCase();
  if (!key) return "";
  return WEEKDAY_TO_PILL_LETTER[key] ?? key.slice(0, 1).toUpperCase();
}

function buildDayPillParts(scheduledDate) {
  let parsed = null;
  let dayNumValue = null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
    dayNumValue = Number(scheduledDate.slice(8, 10));
    parsed = new Date(`${scheduledDate}T00:00:00Z`);
  } else if (scheduledDate) {
    const candidate = new Date(`${scheduledDate}T00:00:00Z`);
    if (Number.isFinite(candidate.getTime())) {
      parsed = candidate;
      dayNumValue = candidate.getUTCDate();
    }
  }

  const weekday = parsed ? toDayPillWeekday(UTC_WEEKDAY_LABELS[parsed.getUTCDay()]) : "-";
  const dayNum = dayNumValue != null ? String(dayNumValue) : "--";
  return { weekday, dayNum };
}

// ── Assertions ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label, got, expected) {
  if (got.weekday === expected.weekday && got.dayNum === expected.dayNum) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    console.error(`       got      weekday="${got.weekday}" dayNum="${got.dayNum}"`);
    console.error(`       expected weekday="${expected.weekday}" dayNum="${expected.dayNum}"`);
    failed++;
  }
}

console.log("buildDayPillParts — regression suite\n");

// Core regression: anchor=Tue(3-Jun), preferred=[Mon,Wed,Sat].
// Before the fix the UI showed "W W F F S M" / "3 4 5 6 7 8"
// because scheduled_weekday was startOff=1 day ahead of the actual date.
// After the fix every label must match the real date's weekday.
assert("Mon 2025-06-02  →  M + 2",  buildDayPillParts("2025-06-02"), { weekday: "M", dayNum: "2" });
assert("Tue 2025-06-03  →  T + 3",  buildDayPillParts("2025-06-03"), { weekday: "T", dayNum: "3" });
assert("Wed 2025-06-04  →  W + 4",  buildDayPillParts("2025-06-04"), { weekday: "W", dayNum: "4" });
assert("Thu 2025-06-05  →  T + 5",  buildDayPillParts("2025-06-05"), { weekday: "T", dayNum: "5" });
assert("Fri 2025-06-06  →  F + 6",  buildDayPillParts("2025-06-06"), { weekday: "F", dayNum: "6" });
assert("Sat 2025-06-07  →  S + 7",  buildDayPillParts("2025-06-07"), { weekday: "S", dayNum: "7" });
assert("Sun 2025-06-08  →  S + 8",  buildDayPillParts("2025-06-08"), { weekday: "S", dayNum: "8" });

// Edge cases
assert("month boundary 31st",        buildDayPillParts("2025-01-31"), { weekday: "F", dayNum: "31" });
assert("leap day 2024-02-29",        buildDayPillParts("2024-02-29"), { weekday: "T", dayNum: "29" });
assert("empty string  →  - + --",   buildDayPillParts(""),           { weekday: "-", dayNum: "--" });
assert("bad string    →  - + --",   buildDayPillParts("not-a-date"), { weekday: "-", dayNum: "--" });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
