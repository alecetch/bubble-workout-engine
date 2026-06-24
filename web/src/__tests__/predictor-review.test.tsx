import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PredictorReviewPage } from "../pages/predictor/PredictorReviewPage";
import { PredictorResultPage } from "../pages/predictor/PredictorResultPage";
import { clearPredictorDraft, savePredictorDraft } from "../utils/predictorStorage";
import { submitHyroxPrediction, ValidationError } from "../utils/api";

vi.mock("../utils/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/api")>();
  return {
    ...actual,
    submitHyroxPrediction: vi.fn(),
  };
});

const mockSubmit = vi.mocked(submitHyroxPrediction);

function seedDraft() {
  savePredictorDraft({
    athlete: { name: "Alex", sex: "male", ageGroup: "30-34", division: "open" },
    benchmarks: { run5kSeconds: 1350, backSquat3RM: 120, deadlift3RM: 160 },
    context: { trainingFrequency: "4-5", primaryBackground: "crossfit", weeklyRunningKm: "15-30" },
    race: {},
  });
}

describe("PredictorReviewPage", () => {
  beforeEach(() => {
    clearPredictorDraft();
    seedDraft();
    mockSubmit.mockReset();
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/hyrox-predictor/review"]}>
        <Routes>
          <Route path="/hyrox-predictor/review" element={<PredictorReviewPage />} />
          <Route path="/hyrox-predictor/result" element={<PredictorResultPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  test("disables get prediction without valid email", () => {
    renderPage();

    expect(screen.getByRole("button", { name: /get prediction/i })).toBeDisabled();
  });

  test("submits the correct request shape and navigates on success", async () => {
    mockSubmit.mockResolvedValue({
      predictionId: "stub-1",
      predictedFinishSeconds: 5400,
      predictedFinishFormatted: "1:30:00",
      rangeLowSeconds: 4860,
      rangeLowFormatted: "1:21:00",
      rangeHighSeconds: 5940,
      rangeHighFormatted: "1:39:00",
      confidenceScore: 0.45,
      confidenceLabel: "moderate",
      predictionMode: "minimum",
      segments: [],
      topLimiters: [],
      topOpportunities: [],
      keyAssumptions: [],
      predictionVersion: "stub-1.0",
    });
    renderPage();

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "alex@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /get prediction/i }));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({
      athlete: expect.objectContaining({ email: "alex@example.com", sex: "male", division: "open" }),
      benchmarks: expect.objectContaining({ run5kSeconds: 1350, backSquat3RM: 120, deadlift3RM: 160 }),
      context: expect.objectContaining({ trainingFrequency: "4-5" }),
      marketingConsent: false,
      website: "",
    }));
    expect(await screen.findByText("Your HYROX Prediction")).toBeInTheDocument();
  });

  test("renders validation errors from a 400 response", async () => {
    mockSubmit.mockRejectedValue(new ValidationError([{ field: "athlete.email", message: "Email is required" }]));
    renderPage();

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "alex@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /get prediction/i }));

    expect(await screen.findByText(/Email is required/i)).toBeInTheDocument();
  });
});
