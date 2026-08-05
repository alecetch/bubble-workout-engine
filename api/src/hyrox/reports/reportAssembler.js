import crypto from "node:crypto";
import { HYROX_ANALYSIS_VERSION } from "../config/benchmarkThresholds.js";
import { rankInsightsForOutput } from "./insightRanker.js";
import { resolveConflicts } from "./conflictResolver.js";
import { buildTemplateA, buildTemplateB, buildTemplateStub } from "./templateSlotMapper.js";
import { buildPersonalReport } from "./personalReportBuilder.js";
import { buildBrowserSummary } from "./browserSummaryBuilder.js";
import { buildEmailReport } from "./emailReportBuilder.js";
import { deepEnforceTone } from "./copyFormatter.js";
import { buildHyroxReportContract } from "./reportContractBuilder.js";
import { buildInterpretation } from "../interpretation/hyroxInterpretationEngine.js";
import {
  assertNoOrdinalErrors,
  assertNoZeroOpportunityHero,
  assertNoDuplicateSentences,
  assertBackgroundAgreesWithContract,
} from "../interpretation/copyGuards.js";

// assertNoRawClockTimestamps is deliberately not wired in here: verified against a real
// email_report fixture that it false-positives on ordinary duration-formatted finish times
// (e.g. "1:15:00") — it can't distinguish those from an actual leaked wall-clock timestamp
// (its own intended target, e.g. "20:18:12" from a RoxZone entry/exit log). Wiring it in as-is
// would fire on nearly every real email and immediately train everyone to ignore these logs.
// Fix its pattern to be context-aware before adding it to this list.
export function runCopyGuards(report, backgroundClaimedCategory, log = console) {
  try {
    assertNoOrdinalErrors(report.emailText);
    assertNoDuplicateSentences(report.sections);
    assertNoZeroOpportunityHero(report.emailHtml);
    assertBackgroundAgreesWithContract(backgroundClaimedCategory, report.contract);
  } catch (guardErr) {
    // eslint-disable-next-line no-console
    log.error("[reportAssembler] copy guard failed for a generated email:", guardErr?.message, {
      reportId: report.reportId,
    });
  }
}

function athlete(raceResult = {}, athleteContext = {}, analysisJson = {}) {
  return {
    displayName: athleteContext.displayName ?? raceResult.athleteName ?? raceResult.name ?? "HYROX athlete",
    division: athleteContext.division ?? raceResult.division ?? analysisJson.race?.division ?? null,
  };
}

function benchmarkContext(analysisJson = {}) {
  const primary = analysisJson.benchmarkContext?.primaryBenchmarkGroup ?? {};
  return {
    primaryGroup: primary.label ?? primary.key ?? null,
    comparisonGroup: primary.key ?? null,
    sampleSize: primary.sampleSize ?? null,
  };
}

function confidence(analysisJson = {}) {
  if (analysisJson.analysisScope === "no_benchmark_data") return "low";
  return analysisJson.dataQuality?.confidence ?? "medium";
}

function selectedInsights(insights = []) {
  return insights.map((insight) => ({
    insightId: insight.id,
    title: insight.title,
    heroMetric: insight.evidence?.primaryValue ?? null,
    confidenceScore: insight.priorityScore ?? insight.priority_score ?? null,
  }));
}

function baseReport(request, resolvedInsights) {
  const outputType = request.outputType ?? "web_report";
  return {
    reportId: crypto.randomUUID(),
    outputType,
    templateId: null,
    athlete: athlete(request.raceResult, request.athleteContext, request.analysisJson),
    benchmarkContext: benchmarkContext(request.analysisJson),
    selectedInsights: selectedInsights(resolvedInsights),
    sections: null,
    slides: null,
    emailSubject: null,
    emailHtml: null,
    emailText: null,
    browserSummary: null,
    confidence: confidence(request.analysisJson),
    generatedAt: new Date().toISOString(),
    engineVersion: request.analysisJson?.analysisVersion ?? HYROX_ANALYSIS_VERSION,
  };
}

export function assembleReport(request = {}) {
  const {
    raceResult = {},
    analysisJson = {},
    insights = [],
    athleteContext: rawAthleteContext = {},
    outputType = "web_report",
    target = null,
    calculatorMode = "target",
    submissionId = null,
  } = request;
  const athleteContext = rawAthleteContext ?? {};

  const ranked = rankInsightsForOutput(insights, outputType);
  const resolved = resolveConflicts(ranked, outputType);
  const report = baseReport({ raceResult, analysisJson, athleteContext, outputType }, resolved);
  report.contract = buildHyroxReportContract({ analysisJson, athleteContext, calculatorMode, insights: resolved });
  report.narrative = report.contract;

  if (analysisJson.analysisScope === "no_benchmark_data") {
    report.templateId = outputType === "email_report" ? "PERSONAL_REPORT" : "BROWSER_SUMMARY";
    report.browserSummary = buildBrowserSummary(analysisJson, resolved, athleteContext, calculatorMode, report.contract);
    return deepEnforceTone(report);
  }

  if (outputType === "carousel_a") {
    report.templateId = "A_ATHLETE_ANALYSIS";
    report.carousel = buildTemplateA(analysisJson, resolved, { ...athleteContext, calculatorMode }, report.contract);
    report.slides = report.carousel.slides;
  } else if (outputType === "carousel_b") {
    report.templateId = "B_POPULATION_RESEARCH";
    report.carousel = buildTemplateB(target?.benchmarkGroupKey ?? athleteContext.populationBenchmarkGroupKey ?? analysisJson.benchmarkContext?.primaryBenchmarkGroup?.key, target?.band ?? "sub-75");
    report.slides = [
      report.carousel.hook,
      report.carousel.losses,
      report.carousel.limiter,
      report.carousel.opportunity,
      report.carousel.insight,
      report.carousel.cta,
    ];
  } else if (outputType === "email_report") {
    report.templateId = "PERSONAL_REPORT";
    const interpretation = buildInterpretation(analysisJson, athleteContext, calculatorMode);
    const personal = buildPersonalReport(analysisJson, resolved, athleteContext, interpretation, calculatorMode, report.contract);
    const email = buildEmailReport(personal, analysisJson, athleteContext, interpretation, calculatorMode, report.contract, submissionId);
    report.sections = personal.sections;
    report.recommendations = personal.recommendations;
    report.emailSubject = email.subject;
    report.emailHtml = email.htmlBody;
    report.emailText = email.textBody;
    runCopyGuards(report, personal.backgroundClaimedCategory);
  } else if (outputType === "web_report") {
    report.templateId = "BROWSER_SUMMARY";
    report.browserSummary = buildBrowserSummary(analysisJson, resolved, athleteContext, calculatorMode, report.contract);
  } else if (/^[C-H]$/.test(outputType)) {
    report.templateId = `${outputType}_STUB`;
    report.carousel = buildTemplateStub(outputType);
  } else {
    throw new Error(`Unsupported HYROX report outputType: ${outputType}`);
  }

  return deepEnforceTone(report);
}
