function numericOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function weeklyRunningKmValue(value) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw === "<15" || raw === "under_15_km") return 15;
  if (raw === "15-30" || raw === "15_30_km") return 22.5;
  if (raw === "30-45" || raw === "30_45_km") return 37.5;
  if (raw === "45+" || raw === "45_plus_km") return 45;
  return null;
}

export async function persistPredictorSubmission(request, predictionResult, pool) {
  const { athlete = {}, benchmarks = {}, context = {}, race = {} } = request;
  const submissionResult = await pool.query(
    `INSERT INTO hyrox_predictor_submissions (
      email, display_name, sex, age_group, division,
      run_5k_seconds, run_10k_seconds, back_squat_kg, back_squat_reps, deadlift_kg, deadlift_reps,
      bodyweight_kg, height_cm, row_erg_2k_seconds, ski_erg_1k_seconds, wall_ball_reps_in_2min,
      farmer_carry_seconds, previous_hyrox_seconds, training_frequency, primary_background,
      weekly_running_km, target_finish_time_seconds, marketing_consent, research_consent, app_link_consent,
      client_session_id, request_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
    RETURNING *`,
    [
      athlete.email, athlete.name ?? null, athlete.sex, athlete.ageGroup ?? null, athlete.division,
      benchmarks.run5kSeconds, benchmarks.run10kSeconds ?? null, benchmarks.backSquat3RM,
      benchmarks.backSquatReps ?? 3, benchmarks.deadlift3RM, benchmarks.deadliftReps ?? 3,
      benchmarks.bodyweightKg, benchmarks.heightCm ?? null, benchmarks.rowErg2kSeconds ?? null,
      benchmarks.skiErg1kSeconds ?? null, benchmarks.wallBallRepsIn2Min ?? null,
      benchmarks.farmerCarryTimeSeconds ?? null, benchmarks.previousHyroxSeconds ?? null,
      context.trainingFrequency ?? null, context.primaryBackground ?? null,
      weeklyRunningKmValue(context.weeklyRunningKm), race.targetFinishTimeSeconds ?? null,
      request.marketingConsent === true, request.researchConsent === true, request.appLinkConsent === true,
      request.clientSessionId ?? null, request.requestId ?? null,
    ],
  );
  const submission = submissionResult.rows[0];
  const predictionResultRow = await pool.query(
    `INSERT INTO hyrox_predictions (
      predictor_submission_id, prediction_version, predicted_finish_seconds, range_low_seconds,
      range_high_seconds, confidence_score, confidence_label, prediction_mode, segments_json,
      target_comparison_json, prediction_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb)
    RETURNING *`,
    [
      submission.id, predictionResult.predictionVersion, predictionResult.predictedFinishSeconds,
      predictionResult.rangeLowSeconds ?? null, predictionResult.rangeHighSeconds ?? null,
      numericOrNull(predictionResult.confidenceScore), predictionResult.confidenceLabel ?? null,
      predictionResult.predictionMode ?? null, JSON.stringify(predictionResult.segments ?? []),
      JSON.stringify(predictionResult.targetComparison ?? null), JSON.stringify(predictionResult),
    ],
  );
  return { submission, prediction: predictionResultRow.rows[0] };
}
