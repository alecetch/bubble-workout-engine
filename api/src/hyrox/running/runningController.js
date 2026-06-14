import { createHash } from "node:crypto";
import { pool } from "../../db.js";
import { analyseRunningProfile } from "./runningProfilerAnalysisService.js";
import { sendRunningProfilerEmail } from "./runningProfilerEmailService.js";

function ipHash(req) {
  const ip = req.ip ?? req.socket?.remoteAddress ?? "";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

async function persistSubmission(body) {
  const athlete = body.athlete ?? {};
  const tp = body.trainingProfile ?? {};
  const ctx = body.context ?? {};
  const result = await pool.query(
    `INSERT INTO running_profiler_submissions (
      email, display_name, age, gender, height_cm, weight_kg,
      backgrounds, years_training, weekly_running_volume, runs_per_week,
      strength_sessions_per_week, hybrid_sessions_per_week, primary_goals, current_concern,
      typical_terrain, injury_limitations, body_composition_goal, running_limiter,
      main_competition_goal, target_5k_seconds, target_10k_seconds, target_hyrox_seconds,
      additional_context, marketing_consent
    ) VALUES (
      $1,$2,$3,$4,$5,$6,
      $7::jsonb,$8,$9,$10,
      $11,$12,$13::jsonb,$14,
      $15,$16,$17,$18,
      $19,$20,$21,$22,
      $23,$24
    ) RETURNING *`,
    [
      athlete.email ?? null,
      athlete.name ?? null,
      athlete.age ?? null,
      athlete.gender ?? null,
      athlete.heightCm ?? null,
      athlete.weightKg ?? null,
      JSON.stringify(tp.backgrounds ?? []),
      tp.yearsTraining ?? null,
      tp.weeklyRunningVolume ?? null,
      tp.runsPerWeek ?? null,
      tp.strengthSessionsPerWeek ?? null,
      tp.hybridSessionsPerWeek ?? null,
      JSON.stringify(tp.primaryGoals ?? []),
      tp.currentConcern ?? null,
      ctx.typicalTerrain ?? null,
      ctx.injuryLimitations ?? null,
      ctx.bodyCompositionGoal ?? null,
      ctx.runningLimiter ?? null,
      ctx.mainCompetitionGoal ?? null,
      ctx.target5kSeconds ?? null,
      ctx.target10kSeconds ?? null,
      ctx.targetHyroxSeconds ?? null,
      ctx.additionalContext ?? null,
      body.marketingConsent === true,
    ],
  );
  return result.rows[0];
}

async function persistPerformances(submissionId, performances) {
  for (const p of performances) {
    await pool.query(
      `INSERT INTO running_profiler_performances (submission_id, distance, time_seconds, approx_date, recency)
       VALUES ($1, $2, $3, $4, $5)`,
      [submissionId, p.distance, p.timeSeconds, p.approxDate ?? null, p.recency],
    );
  }
}

async function persistAnalysis(submissionId, analysisResult) {
  const { confidence, analysis } = analysisResult;
  await pool.query(
    `INSERT INTO running_profiler_analyses (submission_id, confidence, overall_performance_score, running_capacity_score, analysis_json)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      submissionId,
      confidence,
      analysis.overallPerformanceScore,
      analysis.runningCapacityScore,
      JSON.stringify(analysisResult),
    ],
  );
}

export async function analyse(req, res) {
  try {
    const body = req.body ?? {};
    const performances = Array.isArray(body.performances) ? body.performances : [];
    const allHistoric = performances.length > 0 && performances.every((p) => p.recency === "historic");

    const result = analyseRunningProfile({
      athlete: body.athlete ?? {},
      trainingProfile: body.trainingProfile ?? {},
      performances,
      context: body.context ?? {},
    });

    const submission = await persistSubmission(body);
    await persistPerformances(submission.id, performances);
    await persistAnalysis(submission.id, result);

    // Attach performances to submission object for email
    const submissionWithPerf = { ...submission, performances };

    sendRunningProfilerEmail(submissionWithPerf, result, pool)
      .catch((err) => (req.log ?? console).warn?.({ event: "running_profiler.email_failed", err: err?.message }, "Running profiler email failed"));

    return res.status(200).json({
      submissionId: submission.id,
      confidence: result.confidence,
      analysis: result.analysis,
      emailSent: true,
      warning: allHistoric ? "All performances are historical. Confidence is low." : undefined,
    });
  } catch (err) {
    (req.log ?? console).error?.({ event: "running_profiler.analysis_failed", err: err?.message, stack: err?.stack }, "Running profiler analysis failed");
    return res.status(500).json({ error: "analysis_failed", message: "Unable to analyse this running profile right now." });
  }
}

export async function health(req, res) {
  return res.status(200).json({ status: "ok", service: "running_profiler" });
}
