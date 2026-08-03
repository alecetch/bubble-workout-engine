import { pool } from "../db.js";
import { runPredictionEngine } from "./hyroxPredictorEngine.js";
import { createPredictorEmailLogEntry, sendPredictorEmail } from "./hyroxPredictorEmailService.js";
import { persistPredictorSubmission } from "./hyroxPredictorPersistence.js";
import { validatePredictionRequest } from "./hyroxPredictorValidation.js";
import { buildPredictorEmailContent } from "./reports/predictorEmailTemplate.js";

export async function predict(req, res) {
  if (req.body?.website) {
    return res.status(200).json({
      predictionId: `hp-${Date.now().toString(16)}`,
      predictedFinishSeconds: 5400,
      predictedFinishFormatted: "1:30:00",
      rangeLowSeconds: 4860,
      rangeLowFormatted: "1:21:00",
      rangeHighSeconds: 5940,
      rangeHighFormatted: "1:39:00",
      confidenceScore: 0.5,
      confidenceLabel: "moderate",
      predictionMode: "minimum",
      segments: [],
      topLimiters: [],
      topOpportunities: [],
      keyAssumptions: [],
      predictionVersion: "v1.0",
    });
  }

  const errors = validatePredictionRequest(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const predictionResult = runPredictionEngine(req.body);
  const db = req.app?.locals?.hyroxPredictorPool ?? pool;
  const sender = req.app?.locals?.hyroxPredictorEmailSender;
  const { submission } = await persistPredictorSubmission(req.body, predictionResult, db);
  const emailLogId = await createPredictorEmailLogEntry(submission.id, db).catch(() => null);
  const emailContent = buildPredictorEmailContent(predictionResult, req.body.athlete);
  sendPredictorEmail(submission, emailContent, db, req.log ?? console, emailLogId, sender)
    .catch((err) => (req.log ?? console).warn?.({ event: "hyrox_predictor.email_unhandled", err: err?.message }, "HYROX predictor email dispatch failed"));

  return res.status(200).json(predictionResult);
}
