import test from "node:test";
import assert from "node:assert/strict";
import {
  assembleSummary,
  buildHealthFindings,
  buildNarrationFindings,
  buildPreviewFindings,
  buildRepRuleFindings,
  buildSlotCoverageFindings,
  readReviewMatrix,
} from "../programQualityService.js";

const thresholds = {
  slot_min_candidates_warning: 2,
  slot_min_candidates_critical: 1,
  rep_rule_fallback_only_critical: true,
  preview_generation_failure_critical: true,
};

test("buildSlotCoverageFindings maps zero candidates to critical", () => {
  const rows = [{ slot: "A:squat", config_key: "k", equipment_preset: "commercial_gym", fitness_rank: 0, candidate_count: 0 }];
  const findings = buildSlotCoverageFindings(rows, thresholds);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "critical");
});

test("buildSlotCoverageFindings maps one candidate to warning", () => {
  const rows = [{ slot: "A:squat", config_key: "k", equipment_preset: "commercial_gym", fitness_rank: 0, candidate_count: 1 }];
  const findings = buildSlotCoverageFindings(rows, thresholds);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "warning");
});

test("buildSlotCoverageFindings ignores healthy candidate counts", () => {
  const rows = [{ slot: "A:squat", config_key: "k", equipment_preset: "commercial_gym", fitness_rank: 0, candidate_count: 3 }];
  assert.deepEqual(buildSlotCoverageFindings(rows, thresholds), []);
});

test("buildNarrationFindings maps missing contexts to warnings", () => {
  const findings = buildNarrationFindings({ missing_contexts: [{ scope: "day", field: "DAY_TITLE" }], orphaned_templates: [] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "warning");
  assert.equal(findings[0].scope, "narration");
});

test("buildNarrationFindings maps orphaned templates to suggestions", () => {
  const findings = buildNarrationFindings({ missing_contexts: [], orphaned_templates: [{ template_id: "t1" }] });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "suggestion");
});

test("buildRepRuleFindings maps fallback-only matches to critical when enabled", () => {
  const findings = buildRepRuleFindings({ fallback_only_matches: [{ rep_rule_id: "fallback", exercise_id: "ex1" }], orphaned_rules: [] }, thresholds);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "critical");
});

test("buildRepRuleFindings maps orphaned rules to warnings", () => {
  const findings = buildRepRuleFindings({ fallback_only_matches: [], orphaned_rules: [{ rule_id: "r1" }] }, thresholds);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "warning");
});

test("buildHealthFindings maps error to critical", () => {
  const findings = buildHealthFindings([{ severity: "error", finding: "bad" }]);
  assert.equal(findings[0].severity, "critical");
});

test("buildHealthFindings maps warning to warning", () => {
  const findings = buildHealthFindings([{ severity: "warning", finding: "warn" }]);
  assert.equal(findings[0].severity, "warning");
});

test("buildHealthFindings maps info to suggestion", () => {
  const findings = buildHealthFindings([{ severity: "info", finding: "note" }]);
  assert.equal(findings[0].severity, "suggestion");
});

test("buildPreviewFindings maps generation errors to critical", () => {
  const findings = buildPreviewFindings([{ config_key: "k", program_type: "hypertrophy", error: "timeout" }], thresholds);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "critical");
});

test("buildPreviewFindings maps low allowed exercise count to warning", () => {
  const findings = buildPreviewFindings([{ config_key: "k", program_type: "hypertrophy", allowed_exercise_count: 3 }], thresholds);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "warning");
});

test("assembleSummary passes with no findings", () => {
  assert.deepEqual(assembleSummary([]), {
    status: "pass",
    critical_count: 0,
    warning_count: 0,
    suggestion_count: 0,
  });
});

test("assembleSummary needs attention with warnings", () => {
  assert.equal(assembleSummary([{ severity: "warning" }]).status, "needs_attention");
});

test("assembleSummary fails with critical findings", () => {
  assert.equal(assembleSummary([{ severity: "critical" }]).status, "fail");
});

test("readReviewMatrix returns the real matrix shape", async () => {
  const matrix = await readReviewMatrix();
  assert.equal(typeof matrix.version, "number");
  assert.ok(matrix.default_matrix);
  assert.ok(matrix.thresholds);
});
