import { runPredictionEngine } from "./hyroxPredictorEngine.js";
import { validatePredictionRequest } from "./hyroxPredictorValidation.js";

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

  return res.status(200).json(runPredictionEngine(req.body));
}
