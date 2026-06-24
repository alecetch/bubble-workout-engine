import { describe, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PredictorResultPage } from "../pages/predictor/PredictorResultPage";
import type { HyroxPredictionResponse } from "../types";

const prediction: HyroxPredictionResponse = {
  predictionId: "pred-1",
  predictedFinishSeconds: 5400,
  predictedFinishFormatted: "1:30:00",
  rangeLowSeconds: 4860,
  rangeLowFormatted: "1:21:00",
  rangeHighSeconds: 5940,
  rangeHighFormatted: "1:39:00",
  confidenceScore: 0.72,
  confidenceLabel: "good",
  predictionMode: "best",
  segments: [
    { segmentKey: "run_1", label: "Run 1 (1 km)", type: "run", predictedSeconds: 300, predictedFormatted: "5:00", limiterScore: 0.01, opportunityGainSeconds: 0 },
    { segmentKey: "skierg", label: "SkiErg (1000 m)", type: "station", predictedSeconds: 330, predictedFormatted: "5:30", limiterScore: 0.1, opportunityGainSeconds: 30 },
    { segmentKey: "wall_balls", label: "Wall Balls (100 reps)", type: "station", predictedSeconds: 420, predictedFormatted: "7:00", limiterScore: 0.31, opportunityGainSeconds: 100 },
  ],
  topLimiters: [
    { segmentKey: "wall_balls", label: "Wall Balls (100 reps)", type: "station", predictedSeconds: 420, predictedFormatted: "7:00", limiterScore: 0.31, opportunityGainSeconds: 100 },
  ],
  topOpportunities: [
    { segmentKey: "wall_balls", label: "Wall Balls (100 reps)", type: "station", predictedSeconds: 420, predictedFormatted: "7:00", limiterScore: 0.31, opportunityGainSeconds: 100 },
  ],
  targetComparison: {
    targetSeconds: 5100,
    targetFormatted: "1:25:00",
    gapSeconds: -300,
    gapFormatted: "-5:00",
  },
  keyAssumptions: ["Running pace estimated from your 5k personal best"],
  predictionVersion: "v1.0",
};

function renderResult(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/hyrox-predictor/result", state }]}>
      <Routes>
        <Route path="/hyrox-predictor/result" element={<PredictorResultPage />} />
        <Route path="/hyrox-predictor" element={<div>Predictor start</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PredictorResultPage", () => {
  test("renders the predicted time, range, confidence, limiters, and target comparison", () => {
    renderResult({ prediction });

    expect(screen.getAllByText("1:30:00").length).toBeGreaterThan(0);
    expect(screen.getByText(/Likely range: 1:21:00 - 1:39:00/i)).toBeInTheDocument();
    expect(screen.getByText(/Good .* 72%/i)).toBeInTheDocument();
    expect(screen.getByText(/Your biggest limiters/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Wall Balls/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Your goal/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/5:00 behind your goal/i)).toBeInTheDocument();
  });

  test("get another prediction navigates to the predictor start", () => {
    renderResult({ prediction });

    fireEvent.click(screen.getByRole("button", { name: /get another prediction/i }));

    expect(screen.getByText("Predictor start")).toBeInTheDocument();
  });

  test("redirects to predictor start when route state is missing", () => {
    renderResult();

    expect(screen.getByText("Predictor start")).toBeInTheDocument();
  });
});
