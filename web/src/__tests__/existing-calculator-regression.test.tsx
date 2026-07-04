import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RaceDetailsPage } from "../pages/RaceDetailsPage";
import { ResultPage } from "../pages/ResultPage";
import { ReviewPage } from "../pages/ReviewPage";
import type { HyroxAnalysisResponse } from "../types";
import { clearDraft, saveDraft } from "../utils/storage";
import { submitHyroxAnalysis, submitHyroxPrediction } from "../utils/api";

vi.mock("../utils/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/api")>();
  return {
    ...actual,
    submitHyroxAnalysis: vi.fn(),
    submitHyroxPrediction: vi.fn(),
  };
});

const mockAnalysis = vi.mocked(submitHyroxAnalysis);
const mockPrediction = vi.mocked(submitHyroxPrediction);

function seedReviewDraft() {
  saveDraft({
    athlete: { name: "Alex", email: "alex@example.com", gender: "male", ageGroup: "30-34" },
    race: { division: "open", finishTimeSeconds: 5400 },
    splits: [
      { index: 1, segmentKey: "run_1", label: "Run 1", type: "run", timeSeconds: 300 },
      { index: 2, segmentKey: "skierg", label: "SkiErg", type: "station", timeSeconds: 300 },
    ],
    athleteContext: { targetFinishTimeSeconds: 5100 },
    marketingConsent: false,
  });
}

describe("existing HYROX calculator regression", () => {
  beforeEach(() => {
    clearDraft();
    mockAnalysis.mockReset();
    mockPrediction.mockReset();
  });

  test("RaceDetailsPage renders without crashing", () => {
    render(
      <MemoryRouter initialEntries={["/hyrox-calculator/race-details"]}>
        <RaceDetailsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /Analyse your race/i })).toBeInTheDocument();
  });

  test("target mode still requires target finish time before Next is enabled", () => {
    render(
      <MemoryRouter initialEntries={["/hyrox-calculator/race-details?mode=target"]}>
        <RaceDetailsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /or enter manually/i }));
    fireEvent.change(screen.getByLabelText(/age group/i), {
      target: { value: "30-34" },
    });
    fireEvent.change(screen.getByLabelText(/^finish time/i), {
      target: { value: "1:25:00" },
    });

    expect(screen.getAllByText(/next: check splits/i)[0]).toBeDisabled();
  });

  test("ReviewPage submits through submitHyroxAnalysis, not submitHyroxPrediction", async () => {
    seedReviewDraft();
    mockAnalysis.mockResolvedValue({
      submissionId: "sub-1",
      status: "complete",
      analysisScope: "full",
      reportSentTo: "alex@example.com",
      browserSummary: {},
      carouselDataAvailable: false,
      analysisVersion: "hyrox_engine_v1.0.0",
    });
    render(
      <MemoryRouter initialEntries={["/hyrox-calculator/review"]}>
        <ReviewPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /generate my report/i })[0]);

    await waitFor(() => expect(mockAnalysis).toHaveBeenCalled());
    expect(mockPrediction).not.toHaveBeenCalled();
  });

  test("ResultPage renders with a mock analysis response", () => {
    const response: HyroxAnalysisResponse = {
      submissionId: "sub-1",
      status: "complete",
      analysisScope: "full",
      reportSentTo: "alex@example.com",
      browserSummary: { heroInsight: { label: "Wall Balls" } },
      carouselDataAvailable: false,
      analysisVersion: "hyrox_engine_v1.0.0",
    };

    render(
      <MemoryRouter initialEntries={[{ pathname: "/hyrox-calculator/result", state: { response } }]}>
        <ResultPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("result-headline")).toHaveTextContent(/Wall Balls/i);
  });

  test("ResultPage with calculatorMode absent keeps target-mode card layout", () => {
    const response: HyroxAnalysisResponse = {
      submissionId: "sub-1",
      status: "complete",
      analysisScope: "full",
      reportSentTo: "alex@example.com",
      browserSummary: {
        heroInsight: { label: "Wall Balls", timeGapFormatted: "2:30" },
        overallPercentile: 60,
        biggestStrength: { label: "Run 6" },
        timePotential: { projectedGainFormatted: "3:45" },
      },
      carouselDataAvailable: false,
      analysisVersion: "hyrox_engine_v1.0.0",
    };

    render(
      <MemoryRouter initialEntries={[{ pathname: "/hyrox-calculator/result", state: { response } }]}>
        <ResultPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Biggest Limiter")).toBeInTheDocument();
    expect(screen.getByText("Time Potential")).toBeInTheDocument();
  });
});
