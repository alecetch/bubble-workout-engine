import { pool } from "../db.js";
import { analyseSubmission } from "./engine/hyroxAnalysisEngine.js";
import { normaliseSubmission } from "./engine/segmentNormaliser.js";
import { generateInsights } from "./insights/insightEngine.js";
import { assembleReport } from "./reports/reportAssembler.js";
import { createEmailLogEntry, sendHyroxEmail } from "./hyroxEmailService.js";

function ageGroupFromAge(age) {
  const n = Number(age);
  if (!Number.isInteger(n) || n <= 0) return null;
  if (n < 25) return "18-24";
  if (n < 30) return "25-29";
  if (n < 35) return "30-34";
  if (n < 40) return "35-39";
  if (n < 45) return "40-44";
  if (n < 50) return "45-49";
  if (n < 55) return "50-54";
  if (n < 60) return "55-59";
  if (n < 65) return "60-64";
  return "65-69";
}

function intOrNull(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function daysToRace(date) {
  if (!date) return null;
  const race = new Date(date);
  if (Number.isNaN(race.getTime())) return null;
  return Math.ceil((race.getTime() - Date.now()) / 86400000);
}

function contextForPipeline(body = {}) {
  const athleteContext = body.athleteContext ?? {};
  const performanceContext = body.performanceContext ?? {};
  const targetRaceDate = athleteContext.targetRaceDate ?? athleteContext.nextRaceDate;
  const fiveKmPbSeconds = intOrNull(
    athleteContext.run5kPbSeconds ?? performanceContext.fiveKmPbSeconds ?? performanceContext.fiveKSeconds,
  );
  const tenKmPbSeconds = intOrNull(
    athleteContext.run10kPbSeconds ?? performanceContext.tenKmPbSeconds ?? performanceContext.tenKSeconds,
  );
  const backSquatKg = numberOrNull(athleteContext.backSquat3RMKg ?? performanceContext.backSquatKg);
  const deadliftKg = numberOrNull(athleteContext.deadlift3RMKg ?? performanceContext.deadliftKg);
  const frontSquatKg = numberOrNull(performanceContext.frontSquatKg);
  const injuryConstraints = performanceContext.injuryConstraints ?? [];

  return {
    ...athleteContext,
    ...performanceContext,
    calculatorMode: body.calculatorMode ?? "target",
    displayName: body.athlete?.displayName ?? body.athlete?.name ?? athleteContext.displayName,
    email: body.athlete?.email,
    sex: body.athlete?.sex ?? null,
    targetFinishTimeSeconds: intOrNull(athleteContext.targetFinishTimeSeconds),
    targetTimeSeconds: intOrNull(athleteContext.targetFinishTimeSeconds),
    nextRaceDate: targetRaceDate,
    targetRaceDate,
    daysToRace: daysToRace(targetRaceDate),
    fiveKmPbSeconds,
    fiveKPbSeconds: fiveKmPbSeconds,
    tenKmPbSeconds,
    backSquatKg,
    squatKg: backSquatKg,
    deadliftKg,
    frontSquatKg,
    injuryConstraints,
    strengthBenchmarks: [backSquatKg, deadliftKg, frontSquatKg].some((value) => Number.isFinite(value)),
  };
}

export function submissionInput(body = {}) {
  const athlete = body.athlete ?? {};
  const race = body.race ?? {};
  const ageGroup = athlete.ageGroup ?? ageGroupFromAge(athlete.ageOnRaceDay);
  const athleteContext = contextForPipeline(body);
  return {
    athlete: {
      name: athlete.name ?? null,
      email: athlete.email,
      sex: athlete.sex,
      gender: athlete.sex,
      ageOnRaceDay: athlete.ageOnRaceDay ?? null,
      ageGroup,
      division: race.division ?? athlete.division ?? "open",
    },
    race: {
      raceName: race.raceName ?? null,
      raceDate: race.raceDate ?? null,
      eventCountry: race.eventCountry ?? null,
      division: race.division ?? athlete.division ?? "open",
      finishTimeSeconds: race.finishTimeSeconds,
      targetTimeSeconds: athleteContext.targetFinishTimeSeconds,
      source: race.source ?? "manual",
    },
    splits: body.splits ?? [],
    penalties: body.penalties ?? [],
    raceReplay: body.raceReplay ?? [],
    calculatorMode: body.calculatorMode ?? "target",
    athleteContext,
    roxzoneMode: body.roxzoneMode,
  };
}

function statusFromAnalysis(analysisJson, normalised) {
  if (analysisJson.analysisScope === "no_benchmark_data") return "degraded";
  if (analysisJson.analysisScope === "limited") return "limited";
  const requiredSplits = (normalised?.completeness?.runSplits ?? 0) + (normalised?.completeness?.stationSplits ?? 0);
  if (requiredSplits < 16) return "partial";
  return "complete";
}

async function persistSubmission(body, normalised) {
  const athlete = body.athlete ?? {};
  const race = body.race ?? {};
  const performance = body.performanceContext ?? {};
  const athleteContext = body.athleteContext ?? {};
  const fiveKmPbSeconds = intOrNull(athleteContext.run5kPbSeconds ?? performance.fiveKmPbSeconds);
  const tenKmPbSeconds = intOrNull(athleteContext.run10kPbSeconds ?? performance.tenKmPbSeconds);
  const backSquatKg = numberOrNull(athleteContext.backSquat3RMKg ?? performance.backSquatKg);
  const deadliftKg = numberOrNull(athleteContext.deadlift3RMKg ?? performance.deadliftKg);
  const athleteContextJson = {
    ...athleteContext,
    ...(athleteContext.rowErg2kSeconds != null ? { rowErg2kSeconds: Number(athleteContext.rowErg2kSeconds) } : {}),
    ...(athleteContext.skiErg1kSeconds != null ? { skiErg1kSeconds: Number(athleteContext.skiErg1kSeconds) } : {}),
    ...(athleteContext.wallBallRepsIn2Min != null ? { wallBallRepsIn2Min: Number(athleteContext.wallBallRepsIn2Min) } : {}),
    ...(athleteContext.farmerCarry200mSeconds != null ? { farmerCarry200mSeconds: Number(athleteContext.farmerCarry200mSeconds) } : {}),
    ...(athleteContext.targetRaceDate != null ? { targetRaceDate: String(athleteContext.targetRaceDate) } : {}),
  };
  const result = await pool.query(
	    `INSERT INTO hyrox_submissions (
	      email, display_name, sex, age_on_race_day, age_group, division, finish_time_seconds,
	      race_name, race_date, event_country, source, splits_json, roxzone_mode, athlete_context_json,
	      performance_context_json, marketing_consent, allow_partial, height_cm, weight_kg,
	      five_km_pb_seconds, ten_km_pb_seconds, half_marathon_pb_seconds, back_squat_kg,
	      deadlift_kg, front_squat_kg, max_unbroken_wall_balls, injury_constraints, equipment_access
	      , penalties_json, race_replay_json
	    ) VALUES (
	      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::jsonb,$15::jsonb,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27::jsonb,$28::jsonb
	      ,$29::jsonb,$30::jsonb
	    ) RETURNING *`,
    [
      athlete.email,
      athlete.name ?? null,
      athlete.sex,
      athlete.ageOnRaceDay ?? null,
      normalised.athlete?.ageGroup ?? athlete.ageGroup ?? null,
      race.division ?? "open",
	      race.finishTimeSeconds,
	      race.raceName ?? null,
	      race.raceDate ?? null,
	      race.eventCountry ?? null,
	      race.source ?? "manual",
      JSON.stringify(body.splits ?? []),
      normalised.roxzoneMode ?? "none",
      JSON.stringify(athleteContextJson),
      JSON.stringify(performance),
      body.marketingConsent === true,
      body.allowPartial === true,
      performance.heightCm ?? null,
      performance.weightKg ?? null,
      fiveKmPbSeconds,
      tenKmPbSeconds,
      performance.halfMarathonPbSeconds ?? null,
      backSquatKg,
      deadliftKg,
      performance.frontSquatKg ?? null,
      performance.maxUnbrokenWallBalls ?? null,
      JSON.stringify(performance.injuryConstraints ?? []),
      JSON.stringify(performance.equipmentAccess ?? []),
      JSON.stringify(body.penalties ?? []),
      JSON.stringify(body.raceReplay ?? []),
    ],
  );
  return result.rows[0];
}

async function persistAnalysis({ submissionId, analysisJson, insights, emailReport, carouselA, carouselB }) {
  const result = await pool.query(
    `INSERT INTO hyrox_analyses (
      submission_id, analysis_version, analysis_scope, analysis_json, benchmark_group_key,
      confidence, selected_insights_json, report_json, carousel_a_json, carousel_b_json
    ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb)
    RETURNING *`,
    [
      submissionId,
      analysisJson.analysisVersion ?? "hyrox_engine_v1.0.0",
      analysisJson.analysisScope ?? "unknown",
      JSON.stringify(analysisJson),
      analysisJson.benchmarkContext?.primaryBenchmarkGroup?.key ?? null,
      analysisJson.dataQuality?.confidence ?? null,
      JSON.stringify(insights ?? []),
      JSON.stringify(emailReport ?? null),
      JSON.stringify(carouselA ?? null),
      JSON.stringify(carouselB ?? null),
    ],
  );
  return result.rows[0];
}

function limitedAnalysis(body, normalised, reason) {
  return {
    submissionId: null,
    analysisVersion: "hyrox_engine_v1.0.0",
    analysisScope: "limited",
    reason,
    dataQuality: { confidence: "low", issues: [reason], warnings: [] },
    benchmarkContext: { primaryBenchmarkGroup: null, fallbacksUsed: [], goalBenchmarkGroup: null, ageBenchmark: { available: false }, regionalBenchmark: { available: false } },
    race: { finishTimeSeconds: body.race?.finishTimeSeconds, division: body.race?.division },
    segments: [],
    stationBreakdown: [],
    strengths: [],
    limiters: [],
    penalties: normalised.penalties ?? [],
    headline: { biggestLimiter: null, biggestStrength: null, headlineGainSeconds: 0, projectedTimeSeconds: body.race?.finishTimeSeconds ?? null },
    scores: {},
    timePotential: { headlineGainSeconds: 0, newProjectedTimeSeconds: body.race?.finishTimeSeconds ?? null },
    runningAnalysis: { available: false },
    roxzoneAnalysis: { available: false, mode: normalised.roxzoneMode },
    workRunBalance: {},
    athleteArchetype: null,
    recommendedFocusAreas: [],
    muscleGroupProfile: { available: false },
  };
}

export async function analyse(req, res) {
  const startMs = Date.now();
  try {
    const body = req.body ?? {};
    const input = submissionInput(body);
    const normalised = normaliseSubmission(input);
    const unsupportedDivision = ["mixed_doubles", "relay"].includes(String(input.race.division).toLowerCase());
    const analysisJson = unsupportedDivision
      ? limitedAnalysis(body, normalised, "doubles_relay_not_supported_v1")
      : analyseSubmission(input);
    analysisJson.race = { ...(analysisJson.race ?? {}), ...input.race };
    analysisJson.athlete = { ...(analysisJson.athlete ?? {}), ...input.athlete };
    const submission = await persistSubmission(body, normalised);
    analysisJson.submissionId = submission.id;
    const analysisDurationMs = Date.now() - startMs;
    const requestId = req.headers["x-request-id"] ?? null;
    pool.query(
      `
      UPDATE hyrox_submissions
      SET calculator_mode = $1,
          analysis_duration_ms = $2,
          request_id = $3
      WHERE id = $4
      `,
      [body.calculatorMode ?? null, analysisDurationMs, requestId, submission.id],
    ).catch((err) => {
      (req.log ?? console).error?.(
        { event: "hyrox.observability_update_failed", err: err?.message },
        "HYROX observability update failed",
      );
    });

    const insights = unsupportedDivision ? [] : generateInsights(analysisJson, input.athleteContext);
    const emailReport = assembleReport({ raceResult: input.race, analysisJson, insights, athleteContext: input.athleteContext, outputType: "email_report", calculatorMode: body.calculatorMode ?? "target" });
    const webReport = assembleReport({
      raceResult: input.race,
      analysisJson,
      insights,
      athleteContext: input.athleteContext,
      outputType: "web_report",
      calculatorMode: body.calculatorMode ?? "target",
    });
    const carouselA = assembleReport({ raceResult: input.race, analysisJson, insights, athleteContext: input.athleteContext, outputType: "carousel_a", calculatorMode: body.calculatorMode ?? "target" });
    const carouselB = assembleReport({ raceResult: input.race, analysisJson, insights, athleteContext: input.athleteContext, outputType: "carousel_b" });

    await persistAnalysis({ submissionId: submission.id, analysisJson, insights, emailReport, carouselA, carouselB });

    const emailLogId = await createEmailLogEntry(submission.id, pool).catch(() => null);
    sendHyroxEmail(submission, emailReport, pool, req.log ?? console, emailLogId)
      .catch((err) => (req.log ?? console).warn?.({ event: "hyrox.email_unhandled", err: err?.message }, "HYROX email dispatch failed"));

    const status = unsupportedDivision ? "limited" : statusFromAnalysis(analysisJson, normalised);
    return res.status(200).json({
      submissionId: submission.id,
      status,
      reason: unsupportedDivision ? "doubles_relay_not_supported_v1" : undefined,
      analysisScope: analysisJson.analysisScope,
      reportSentTo: submission.email,
      browserSummary: webReport.browserSummary,
      benchmarkContext: analysisJson.benchmarkContext,
      calculatorMode: body.calculatorMode ?? "target",
      muscleGroupProfile: analysisJson.muscleGroupProfile,
      carouselDataAvailable: Boolean(carouselA.carousel || carouselA.slides),
      analysisVersion: analysisJson.analysisVersion,
    });
  } catch (err) {
    (req.log ?? console).error?.({ event: "hyrox.analysis_failed", err: err?.message, stack: err?.stack }, "HYROX analysis failed");
    return res.status(500).json({ error: "analysis_failed", message: "Unable to analyse this HYROX result right now." });
  }
}

export async function health(req, res) {
  try {
    const result = await pool.query("SELECT COUNT(*)::int AS count, MAX(created_at) AS last_built, MAX(dataset_version) AS dataset_version FROM hyrox_benchmark_groups");
    const row = result.rows[0] ?? {};
    const count = Number(row.count ?? 0);
    if (count <= 0) {
      return res.status(200).json({ status: "degraded", reason: "no_benchmark_data", benchmarkDataVersion: null, benchmarkGroupCount: 0, lastBuiltAt: null });
    }
    return res.status(200).json({
      status: "ok",
      benchmarkDataVersion: row.dataset_version ?? null,
      benchmarkGroupCount: count,
      lastBuiltAt: row.last_built ? new Date(row.last_built).toISOString() : null,
    });
  } catch (err) {
    return res.status(200).json({ status: "degraded", reason: err?.message ?? "benchmark_health_unavailable", benchmarkDataVersion: null, benchmarkGroupCount: 0, lastBuiltAt: null });
  }
}
