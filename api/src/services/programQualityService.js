import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "../db.js";
import { runPipeline } from "../../engine/runPipeline.js";
import { getAllowedExerciseIds } from "../../engine/getAllowedExercises.js";
import { buildInputsFromProfile } from "./buildInputsFromProfile.js";
import { fetchCatalogueRuleHealthReport } from "./catalogueRuleHealth.js";
import { fetchActiveRepRules } from "./repRules.js";
import { fetchCoverageReport } from "../routes/adminCoverage.js";
import { fetchNarrationCoverageReport } from "../routes/adminNarration.js";
import {
  buildPreviewInputs,
  shapeToCsvRows,
  rowsToCsv,
  CSV_COLUMNS,
} from "../routes/adminPreview.js";

export const DEFAULT_REVIEW_MATRIX = {
  _comment: "Default review matrix. Capped at commercial_gym + minimal_equipment to keep preview run time bounded. Adjust to include more presets when running targeted reviews.",
  version: 1,
  default_matrix: {
    config_keys: ["hypertrophy_default_v1", "strength_default_v1"],
    program_types: ["hypertrophy", "strength"],
    fitness_ranks: [0, 1, 2, 3],
    equipment_presets: ["minimal_equipment", "commercial_gym"],
    days_per_week: [3, 5],
    duration_mins: [45, 60],
  },
  thresholds: {
    slot_min_candidates_warning: 2,
    slot_min_candidates_critical: 1,
    rep_rule_fallback_only_critical: true,
    preview_generation_failure_critical: true,
    ai_review_score_min_warning: 7.0,
    ai_review_score_min_critical: 5.0,
  },
};

function resolvePath(relativeUrl) {
  return fileURLToPath(new URL(relativeUrl, import.meta.url));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value) {
  return String(value ?? "").trim();
}

async function readTextFile(relativeUrl, fallback = "") {
  try {
    return await readFile(resolvePath(relativeUrl), "utf8");
  } catch {
    return fallback;
  }
}

export async function readReviewMatrix() {
  try {
    const raw = await readFile(resolvePath("../../config/review-matrix.json"), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return DEFAULT_REVIEW_MATRIX;
    return parsed;
  } catch {
    return DEFAULT_REVIEW_MATRIX;
  }
}

export function flattenCoverageRows(coverageReport, requestBody = {}) {
  const wantedPresets = new Set(safeArray(requestBody.equipment_presets).map(String));
  const wantedRanks = new Set(safeArray(requestBody.fitness_ranks).map(Number));
  const wantedConfigKeys = new Set(safeArray(requestBody.config_keys).map(String));
  const rows = [];

  for (const row of safeArray(coverageReport?.rows)) {
    if (wantedConfigKeys.size && !wantedConfigKeys.has(String(row?.config_key ?? ""))) continue;
    for (const preset of safeArray(coverageReport?.presets)) {
      const presetCode = String(preset?.code ?? "");
      if (wantedPresets.size && !wantedPresets.has(presetCode)) continue;
      for (const rank of safeArray(coverageReport?.ranks)) {
        const rankValue = Number(rank?.value);
        if (wantedRanks.size && !wantedRanks.has(rankValue)) continue;
        rows.push({
          config_key: row.config_key,
          program_type: row.program_type,
          day_key: row.day_key,
          day_index: row.day_index,
          slot: row.slot,
          equipment_preset: presetCode,
          fitness_rank: rankValue,
          candidate_count: Number(row?.counts?.[`${presetCode}_${rankValue}`] ?? 0),
        });
      }
    }
  }

  return rows;
}

export function buildSlotCoverageFindings(coverageData, thresholds = DEFAULT_REVIEW_MATRIX.thresholds) {
  const criticalMin = Number(thresholds.slot_min_candidates_critical ?? 1);
  const warningMin = Number(thresholds.slot_min_candidates_warning ?? 2);
  const findings = [];
  for (const row of safeArray(coverageData)) {
    const candidateCount = Number(row?.candidate_count ?? 0);
    let severity = null;
    if (candidateCount < criticalMin) severity = "critical";
    else if (candidateCount < warningMin) severity = "warning";
    if (!severity) continue;
    findings.push({
      severity,
      scope: "slot_coverage",
      config_key: row.config_key,
      program_type: row.program_type,
      equipment_preset: row.equipment_preset,
      fitness_rank: row.fitness_rank,
      slot: row.slot,
      candidate_count: candidateCount,
      finding: `Slot "${row.slot}" has ${candidateCount} candidate(s) for ${row.equipment_preset} at rank ${row.fitness_rank}.`,
      recommendation: candidateCount === 0
        ? `Add at least one exercise matching the slot selector for the ${row.equipment_preset} equipment preset.`
        : `Add at least ${warningMin} exercises to reduce repeated selection.`,
      verification: `Slot coverage count for "${row.slot}" / ${row.equipment_preset} should be >= ${warningMin} in /admin/coverage.`,
    });
  }
  return findings;
}

export function buildNarrationFindings(narrationReport) {
  const reports = Array.isArray(narrationReport) ? narrationReport : [narrationReport].filter(Boolean);
  const findings = [];
  for (const report of reports) {
    for (const ctx of safeArray(report?.missing_contexts)) {
      findings.push({
        severity: "warning",
        scope: "narration",
        config_key: report.config_key,
        program_type: report.program_type,
        context: [ctx.scope, ctx.field, ctx.purpose, ctx.segment_type, ctx.day_focus].filter(Boolean).join(" / "),
        field: ctx.field,
        finding: `Missing narration template for ${ctx.scope}:${ctx.field}.`,
        recommendation: "Add an active narration template that matches this generated context.",
        verification: "The missing context should disappear from /admin/narration.",
      });
    }
    for (const template of safeArray(report?.orphaned_templates)) {
      findings.push({
        severity: "suggestion",
        scope: "narration",
        config_key: report.config_key,
        program_type: report.program_type,
        context: template.applies_day_focus ? `day_focus=${template.applies_day_focus}` : "",
        field: template.template_id,
        finding: `Narration template "${template.template_id}" targets a context no active config currently produces.`,
        recommendation: "Retire the template or update its applies_json to match a current program context.",
        verification: "The orphaned template should disappear from /admin/narration.",
      });
    }
  }
  return findings;
}

export function buildRepRuleFindings(repRuleReport, thresholds = DEFAULT_REVIEW_MATRIX.thresholds) {
  const findings = [];
  const fallbackSeverity = thresholds.rep_rule_fallback_only_critical === true ? "critical" : "warning";
  for (const match of safeArray(repRuleReport?.fallback_only_matches)) {
    findings.push({
      severity: fallbackSeverity,
      scope: "rep_rules",
      config_key: match.config_key,
      program_type: match.program_type,
      equipment_preset: match.equipment_preset,
      fitness_rank: match.fitness_rank,
      context: match.context ?? [match.week_number, match.day_number, match.segment_type, match.exercise_id].filter(Boolean).join(" / "),
      finding: `Exercise "${match.exercise_name || match.exercise_id || "unknown"}" matched only fallback rep rule "${match.rep_rule_id}".`,
      recommendation: "Add a more specific active rep rule for this program, segment, movement pattern, or equipment context.",
      verification: "The fallback-only match should disappear from /admin/rep-rules after rerunning preview.",
    });
  }
  for (const rule of safeArray(repRuleReport?.orphaned_rules)) {
    findings.push({
      severity: "warning",
      scope: "rep_rules",
      config_key: rule.config_key,
      program_type: rule.program_type,
      context: rule.rule_id,
      finding: `Rep rule "${rule.rule_id}" was not used by the review matrix.`,
      recommendation: "Confirm the rule is still needed, broaden its matching dimensions, or deactivate it.",
      verification: "The rule should be used by at least one preview row or intentionally removed from /admin/rep-rules.",
    });
  }
  return findings;
}

export function buildHealthFindings(healthReport) {
  const severityMap = { error: "critical", critical: "critical", warning: "warning", info: "suggestion" };
  const items = Array.isArray(healthReport)
    ? healthReport
    : [
        ...safeArray(healthReport?.uncovered_exercises?.rows),
        ...safeArray(healthReport?.orphaned_prefs?.rows),
        ...safeArray(healthReport?.orphaned_rules?.rows),
        ...safeArray(healthReport?.slot_coverage?.rows),
        ...safeArray(healthReport?.rule_coverage?.rows),
      ].filter((item) => item?.severity && item.severity !== "ok");
  return items.map((item) => ({
    severity: severityMap[item?.severity] ?? "suggestion",
    scope: "health",
    context: item?.code ?? item?.area ?? item?.scope ?? "",
    finding: item?.finding ?? item?.message ?? item?.reason ?? item?.title ?? "Health report item.",
    recommendation: item?.recommendation ?? item?.suggestion ?? "Review the health report item.",
    verification: "The item should clear from /admin/health.",
    ...item,
    severity: severityMap[item?.severity] ?? "suggestion",
    scope: "health",
  }));
}

export function buildPreviewFindings(previewResults, thresholds = DEFAULT_REVIEW_MATRIX.thresholds) {
  const findings = [];
  for (const row of safeArray(previewResults)) {
    const context = {
      config_key: row.config_key,
      program_type: row.program_type,
      fitness_rank: row.fitness_rank,
      equipment_preset: row.equipment_preset,
      days_per_week: row.days_per_week,
      duration_mins: row.duration_mins,
    };
    if (row.error && thresholds.preview_generation_failure_critical === true) {
      findings.push({
        severity: "critical",
        scope: "preview",
        ...context,
        context: JSON.stringify(context),
        finding: `Preview generation failed: ${row.error}`,
        recommendation: "Fix the config, selector, or pipeline error for this matrix combination.",
        verification: "The same matrix combination should generate successfully in /admin/preview.",
      });
      continue;
    }
    if (Number(row.allowed_exercise_count ?? 0) < 5) {
      findings.push({
        severity: "warning",
        scope: "preview",
        ...context,
        context: JSON.stringify(context),
        finding: `Preview generated with only ${Number(row.allowed_exercise_count ?? 0)} allowed exercises.`,
        recommendation: "Broaden equipment, selectors, or catalogue coverage so generated programs have a healthier exercise pool.",
        verification: "Preview allowed_exercise_count should be at least 5 in /admin/preview.",
      });
    }
  }
  return findings;
}

export function assembleSummary(allFindings) {
  const summary = {
    status: "pass",
    critical_count: 0,
    warning_count: 0,
    suggestion_count: 0,
  };
  for (const finding of safeArray(allFindings)) {
    if (finding?.severity === "critical") summary.critical_count += 1;
    else if (finding?.severity === "warning") summary.warning_count += 1;
    else if (finding?.severity === "suggestion") summary.suggestion_count += 1;
  }
  summary.status = summary.critical_count > 0
    ? "fail"
    : summary.warning_count > 0
      ? "needs_attention"
      : "pass";
  return summary;
}

function ruleIsFallbackOnly(rule) {
  return ![
    rule?.day_type,
    rule?.purpose,
    rule?.segment_type,
    rule?.movement_pattern,
    rule?.swap_group_id_1,
    rule?.swap_group_id_2,
    rule?.equipment_slug,
  ].some((value) => safeText(value));
}

export function buildRepRuleReportFromPreviewRows(previewRows, rules) {
  const rulesById = new Map(safeArray(rules).map((rule) => [String(rule.rule_id), rule]));
  const usedRuleIds = new Set();
  const fallbackOnlyMatches = [];
  for (const row of safeArray(previewRows)) {
    const ruleId = String(row?.rep_rule_id ?? "");
    if (!ruleId) continue;
    usedRuleIds.add(ruleId);
    const rule = rulesById.get(ruleId);
    if (!rule || !ruleIsFallbackOnly(rule)) continue;
    fallbackOnlyMatches.push({
      config_key: row.config_key,
      program_type: row.program_type,
      fitness_rank: Number(row.fitness_rank),
      equipment_preset: row.equipment_preset,
      week_number: row.week_number,
      day_number: row.day_number,
      segment_type: row.segment_type,
      exercise_id: row.exercise_id,
      exercise_name: row.exercise_name,
      rep_rule_id: ruleId,
    });
  }
  const orphanedRules = safeArray(rules)
    .filter((rule) => rule?.rule_id && !usedRuleIds.has(String(rule.rule_id)))
    .map((rule) => ({
      rule_id: rule.rule_id,
      program_type: rule.program_type,
    }));
  return { fallback_only_matches: fallbackOnlyMatches, orphaned_rules: orphanedRules };
}

async function fetchConfigJsonByKey(db, configKeys) {
  const keys = [...new Set(safeArray(configKeys).map(String).filter(Boolean))];
  if (!keys.length) return {};
  const result = await db.query(
    `
    SELECT config_key, program_generation_config_json
    FROM public.program_generation_config
    WHERE is_active = true
      AND config_key = ANY($1::text[])
    ORDER BY config_key ASC
    `,
    [keys],
  );
  return Object.fromEntries((result.rows ?? []).map((row) => [row.config_key, row.program_generation_config_json]));
}

export async function assembleAiPacket({
  db = pool,
  requestBody,
  allFindings,
  coverageData,
  narrationReport,
  repRuleReport,
  healthReport,
  previewRows,
}) {
  const coachingPrompt = await readTextFile("../../../docs/ai/ai-program-review-prompt.md", "");
  const configJson = await fetchConfigJsonByKey(db, requestBody.config_keys);
  const csv = previewRows?.length ? rowsToCsv(previewRows) : `${CSV_COLUMNS.join(",")}\r\n`;
  return {
    prompt_version: "program_quality_review_v1",
    exported_at: new Date().toISOString(),
    context: {
      config_keys: requestBody.config_keys,
      program_types: requestBody.program_types,
      matrix: requestBody,
    },
    config_json: configJson,
    coverage_report: coverageData,
    health_report: healthReport,
    narration_report: narrationReport,
    rep_rules_report: repRuleReport,
    deterministic_findings: allFindings,
    coaching_prompt: coachingPrompt,
    csv,
  };
}

export async function runPreviewMatrix({
  db = pool,
  requestBody,
  pipeline = runPipeline,
  getAllowed = getAllowedExerciseIds,
  buildInputs = buildInputsFromProfile,
} = {}) {
  const cachedByInput = new Map();
  const previewRows = [];
  const previewResults = [];

  for (const fitnessRank of requestBody.fitness_ranks) {
    for (const equipmentPreset of requestBody.equipment_presets) {
      for (const daysPerWeek of requestBody.days_per_week) {
        for (const durationMins of requestBody.duration_mins) {
          const cacheKey = `${fitnessRank}|${equipmentPreset}|${daysPerWeek}|${durationMins}`;
          let cached = cachedByInput.get(cacheKey);
          if (!cached) {
            cached = await buildPreviewInputs(db, getAllowed, buildInputs, {
              fitnessRank,
              equipmentPreset,
              daysPerWeek,
              durationMins,
            });
            cachedByInput.set(cacheKey, cached);
          }

          for (const configKey of requestBody.config_keys) {
            for (const programType of requestBody.program_types) {
              const base = {
                config_key: configKey,
                program_type: programType,
                fitness_rank: Number(fitnessRank),
                equipment_preset: equipmentPreset,
                days_per_week: Number(daysPerWeek),
                duration_mins: Number(durationMins),
                allowed_exercise_count: cached.allowedIds.length,
              };
              try {
                const result = await pipeline({
                  db,
                  inputs: cached.inputs,
                  programType,
                  request: {
                    ...cached.pipelineRequest,
                    config_key: configKey,
                  },
                });
                const rows = shapeToCsvRows(
                  programType,
                  { ok: true, program: result.program, debug: result.debug },
                  {
                    fitness_rank: Number(fitnessRank),
                    fitness_level: cached.synthProfile?.fitnessLevel ?? "",
                    equipment_preset: equipmentPreset,
                    days_per_week: Number(daysPerWeek),
                    duration_mins: Number(durationMins),
                    allowed_exercise_count: cached.allowedIds.length,
                    exercise_name_map: cached.exerciseNameMap,
                    rep_rule_map: cached.repRuleMap,
                  },
                );
                previewRows.push(...rows);
                previewResults.push(base);
              } catch (err) {
                previewResults.push({ ...base, error: err?.message ?? String(err) });
              }
            }
          }
        }
      }
    }
  }

  return { previewRows, previewResults };
}

export async function runFullReview({
  db = pool,
  requestBody,
  pipeline = runPipeline,
  getAllowed = getAllowedExerciseIds,
  buildInputs = buildInputsFromProfile,
} = {}) {
  const matrix = await readReviewMatrix();
  const thresholds = matrix.thresholds ?? DEFAULT_REVIEW_MATRIX.thresholds;

  const coveragePromise = fetchCoverageReport({ db });
  const healthPromise = fetchCatalogueRuleHealthReport(db);
  const narrationPromise = Promise.all(
    [...new Set(requestBody.program_types)].map((programType) =>
      fetchNarrationCoverageReport({ db, program_type: programType }).catch((err) => ({
        program_type: programType,
        expected: [],
        missing_contexts: [],
        orphaned_templates: [],
        summary: {},
        error: err?.message ?? String(err),
      })),
    ),
  );
  const rulesPromise = fetchActiveRepRules(db);
  const previewPromise = runPreviewMatrix({ db, requestBody, pipeline, getAllowed, buildInputs });

  const [coverageReport, healthReport, narrationReport, rules, preview] = await Promise.all([
    coveragePromise,
    healthPromise,
    narrationPromise,
    rulesPromise,
    previewPromise,
  ]);

  const coverageData = flattenCoverageRows(coverageReport, requestBody);
  const repRuleReport = buildRepRuleReportFromPreviewRows(preview.previewRows, rules);

  const checks = {
    slot_coverage: buildSlotCoverageFindings(coverageData, thresholds),
    narration_coverage: buildNarrationFindings(narrationReport),
    rep_rule_coverage: buildRepRuleFindings(repRuleReport, thresholds),
    health_report: buildHealthFindings(healthReport),
    preview_generation: buildPreviewFindings(preview.previewResults, thresholds),
  };
  const allFindings = Object.values(checks).flat();
  const summary = assembleSummary(allFindings);
  const result = { summary, checks };

  if (requestBody.include_preview_rows === true) {
    result.preview_rows = preview.previewRows;
  }
  if (requestBody.include_ai_packet === true) {
    result.ai_packet = await assembleAiPacket({
      db,
      requestBody,
      allFindings,
      coverageData: coverageReport,
      narrationReport,
      repRuleReport,
      healthReport,
      previewRows: preview.previewRows,
    });
  }

  return result;
}
