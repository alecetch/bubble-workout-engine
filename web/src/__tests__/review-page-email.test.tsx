import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReviewPage } from "../pages/ReviewPage";
import { clearDraft, saveDraft } from "../utils/storage";
import { submitHyroxAnalysis } from "../utils/api";
import type { HyroxAnalysisResponse } from "../types";

vi.mock("../utils/api", () => {
  class ValidationError extends Error {
    constructor(public readonly errors: Array<{ field: string; message: string }>) {
      super("validation_failed");
      this.name = "ValidationError";
    }
  }
  class RateLimitError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "RateLimitError";
    }
  }
  return {
    submitHyroxAnalysis: vi.fn(),
    trackEvent: vi.fn(),
    ValidationError,
    RateLimitError,
  };
});

const mockResponse: HyroxAnalysisResponse = {
  submissionId: "sub-123",
  status: "complete",
  analysisScope: "full",
  reportSentTo: "test@example.com",
  carouselDataAvailable: false,
  analysisVersion: "hyrox_engine_v1.0.0",
  browserSummary: {},
};

function seedDraft() {
  saveDraft({
    athlete: {
      name: "Alex Smith",
      gender: "male",
      ageOnRaceDay: 35,
    },
    race: {
      division: "open",
      finishTimeSeconds: 5400,
    },
    splits: [
      { index: 1, segmentKey: "run_1", label: "Run 1", type: "run", timeSeconds: 300 },
    ],
    athleteContext: {
      trainingAge: "one_to_three_years",
    },
    marketingConsent: false,
  });
}

describe("ReviewPage email collection", () => {
  beforeEach(() => {
    clearDraft();
    seedDraft();
    vi.clearAllMocks();
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/hyrox-calculator/review"]}>
        <ReviewPage />
      </MemoryRouter>,
    );
  }

  test("Email field renders on ReviewPage", () => {
    renderPage();
    expect(screen.getByTestId("email-input")).toBeInTheDocument();
  });

  test("Submit blocked when email is empty", async () => {
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getByText("Send My Performance Report"));
    });
    expect(screen.getByTestId("email-error")).toBeInTheDocument();
    expect(submitHyroxAnalysis).not.toHaveBeenCalled();
  });

  test("Submit blocked when email is malformed", async () => {
    renderPage();
    fireEvent.change(screen.getByTestId("email-input"), { target: { value: "notanemail" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Send My Performance Report"));
    });
    expect(screen.getByTestId("email-error")).toBeInTheDocument();
    expect(submitHyroxAnalysis).not.toHaveBeenCalled();
  });

  test("Valid email is included in the submission payload", async () => {
    vi.mocked(submitHyroxAnalysis).mockResolvedValue(mockResponse);
    renderPage();
    fireEvent.change(screen.getByTestId("email-input"), { target: { value: "test@example.com" } });

    await act(async () => {
      fireEvent.click(screen.getByText("Send My Performance Report"));
    });

    expect(submitHyroxAnalysis).toHaveBeenCalled();
    expect(vi.mocked(submitHyroxAnalysis).mock.calls[0][0].athlete.email).toBe("test@example.com");
  });
});
