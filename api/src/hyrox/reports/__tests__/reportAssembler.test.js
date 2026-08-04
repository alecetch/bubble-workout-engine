import assert from "node:assert/strict";
import test from "node:test";
import { runCopyGuards } from "../reportAssembler.js";

function validReport(overrides = {}) {
  return {
    reportId: "report-1",
    emailText: "Your finish time was strong. 12th place overall.",
    emailHtml: "<div>1:23</div>",
    sections: [
      { sectionKey: "a", content: "Run fade was 8%." },
      { sectionKey: "b", content: "Station gaps were large." },
    ],
    contract: { gapReconciliation: { largestCategory: { key: "work_time" } } },
    ...overrides,
  };
}

function fakeLog() {
  const calls = [];
  return { calls, error: (...args) => calls.push(args) };
}

test("runCopyGuards does not log anything for a clean report", () => {
  const log = fakeLog();
  runCopyGuards(validReport(), "work_time", log);
  assert.equal(log.calls.length, 0);
});

test("runCopyGuards logs (does not throw) when a guard fails — duplicate sentences", () => {
  const log = fakeLog();
  const report = validReport({
    sections: [
      { sectionKey: "a", content: "Run fade was 8%." },
      { sectionKey: "b", content: "Run fade was 8%." },
    ],
  });
  assert.doesNotThrow(() => runCopyGuards(report, "work_time", log));
  assert.equal(log.calls.length, 1);
  assert.match(log.calls[0][1], /Duplicate sentence/);
});

test("runCopyGuards logs when the background section disagrees with the contract's largest category", () => {
  const log = fakeLog();
  const report = validReport({ contract: { gapReconciliation: { largestCategory: { key: "run_time" } } } });
  assert.doesNotThrow(() => runCopyGuards(report, "work_time", log));
  assert.equal(log.calls.length, 1);
  assert.match(log.calls[0][1], /Background section claims/);
});

test("runCopyGuards logs when the email hero shows a 0:00 opportunity", () => {
  const log = fakeLog();
  const report = validReport({ emailHtml: "<div>0:00</div>" });
  assert.doesNotThrow(() => runCopyGuards(report, "work_time", log));
  assert.equal(log.calls.length, 1);
  assert.match(log.calls[0][1], /0:00 opportunity/);
});

test("runCopyGuards logs when the email text has an invalid ordinal suffix", () => {
  const log = fakeLog();
  const report = validReport({ emailText: "You finished 23th overall." });
  assert.doesNotThrow(() => runCopyGuards(report, "work_time", log));
  assert.equal(log.calls.length, 1);
  assert.match(log.calls[0][1], /Invalid ordinal/);
});
