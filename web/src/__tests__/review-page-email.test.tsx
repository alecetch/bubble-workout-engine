import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function seedDraft(calculatorMode: "analyse" | "target" = "target") {
  saveDraft({
    calculatorMode,
    athlete: {
      name: "Alex Smith",
      gender: "male",
      ageOnRaceDay: 35,
    },
    race: {
      raceName: "HYROX Manchester",
      division: "open",
      finishTimeSeconds: 5400,
    },
    splits: Array.from({ length: 16 }, (_, index) => ({
      index: index + 1,
      segmentKey: `segment_${index + 1}`,
      label: `Segment ${index + 1}`,
      type: index % 2 === 0 ? "run" as const : "station" as const,
      timeSeconds: 300,
    })),
    roxzoneTimeSeconds: 600,
    athleteContext: {
      targetFinishTimeSeconds: 3300,
      trainingAge: "one_to_three_years",
      weeklyStrengthSessions: "4_5_days_week",
      weeklyRunningVolume: "30_45_km",
      primaryBackground: "crossfit_hybrid",
    },
    marketingConsent: false,
    appLinkConsent: false,
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
    expect(screen.getByText(/Review and receive your analysis/i)).toBeInTheDocument();
    expect(screen.getByText(/ANALYSIS SUMMARY/i)).toBeInTheDocument();
    expect(screen.getByText(/WHERE SHOULD WE SEND IT/i)).toBeInTheDocument();
    expect(screen.getByText(/REPORT WILL INCLUDE/i)).toBeInTheDocument();
    expect(screen.getByText(/WHAT HAPPENS NEXT/i)).toBeInTheDocument();
    expect(screen.getByText(/QUALITY CHECKS/i)).toBeInTheDocument();
    expect(screen.getByText(/All core data complete/i)).toBeInTheDocument();
    expect(screen.getByText(/Target finish time/i)).toBeInTheDocument();
    expect(screen.getAllByText(/55:00/i).length).toBeGreaterThan(0);
  });

  test.each(["analyse", "target"] as const)("privacy note includes aggregate predictor-use disclosure in %s mode", (calculatorMode) => {
    clearDraft();
    seedDraft(calculatorMode);
    renderPage();

    expect(screen.getByText(/may be used, in aggregate, to improve future HYROX predictions/i)).toBeInTheDocument();
  });

  test.each(["analyse", "target"] as const)("privacy note includes app link disclosure in %s mode", (calculatorMode) => {
    clearDraft();
    seedDraft(calculatorMode);
    renderPage();

    expect(screen.getByText(/later create a Forma app account with the same email/i)).toBeInTheDocument();
    expect(screen.getByText(/You can unlink it at any time from the app/i)).toBeInTheDocument();
  });

  test("Submit blocked when email is empty", async () => {
    renderPage();
    await act(async () => {
      fireEvent.click(screen.getAllByText("Generate My Report")[0]);
    });
    expect(screen.getByTestId("email-error")).toBeInTheDocument();
    expect(screen.getByTestId("email-error")).toHaveTextContent(/Enter an email address to generate your report/i);
    expect(submitHyroxAnalysis).not.toHaveBeenCalled();
  });

  test("Submit blocked when email is malformed", async () => {
    renderPage();
    fireEvent.change(screen.getByTestId("email-input"), { target: { value: "notanemail" } });
    await act(async () => {
      fireEvent.click(screen.getAllByText("Generate My Report")[0]);
    });
    expect(screen.getByTestId("email-error")).toBeInTheDocument();
    expect(screen.getByTestId("email-error")).toHaveTextContent(/Enter a valid email address/i);
    expect(submitHyroxAnalysis).not.toHaveBeenCalled();
  });

  test("Valid email is included in the submission payload", async () => {
    vi.mocked(submitHyroxAnalysis).mockResolvedValue(mockResponse);
    renderPage();
    fireEvent.change(screen.getByTestId("email-input"), { target: { value: "test@example.com" } });

    await act(async () => {
      fireEvent.click(screen.getAllByText("Generate My Report")[0]);
    });

    expect(submitHyroxAnalysis).toHaveBeenCalled();
    expect(vi.mocked(submitHyroxAnalysis).mock.calls[0][0].athlete.email).toBe("test@example.com");
    expect(vi.mocked(submitHyroxAnalysis).mock.calls[0][0].athleteContext?.targetFinishTimeSeconds).toBe(3300);
  });

  test.each(["analyse", "target"] as const)("app link consent defaults unchecked and is included in the %s payload", async (calculatorMode) => {
    clearDraft();
    seedDraft(calculatorMode);
    vi.mocked(submitHyroxAnalysis).mockResolvedValue(mockResponse);
    renderPage();

    const appLink = screen.getByRole("checkbox", { name: /link this result to my forma account/i });
    expect(appLink).not.toBeChecked();
    fireEvent.click(appLink);
    fireEvent.change(screen.getByTestId("email-input"), { target: { value: "test@example.com" } });

    await act(async () => {
      fireEvent.click(screen.getAllByText("Generate My Report")[0]);
    });

    expect(vi.mocked(submitHyroxAnalysis).mock.calls[0][0]).toEqual(expect.objectContaining({
      calculatorMode,
      appLinkConsent: true,
      marketingConsent: false,
    }));
  });

  test("Submit button shows loading copy while report is generating", async () => {
    let resolveSubmit: (value: HyroxAnalysisResponse) => void = () => undefined;
    vi.mocked(submitHyroxAnalysis).mockImplementation(
      () => new Promise((resolve) => {
        resolveSubmit = resolve;
      }),
    );
    renderPage();
    fireEvent.change(screen.getByTestId("email-input"), { target: { value: "test@example.com" } });

    await act(async () => {
      fireEvent.click(screen.getAllByText("Generate My Report")[0]);
    });

    expect(screen.getAllByText(/Generating your report/i).length).toBeGreaterThan(0);

    await act(async () => {
      resolveSubmit(mockResponse);
    });
  });

  test("Submit failure shows clear retry message", async () => {
    vi.mocked(submitHyroxAnalysis).mockRejectedValue(new Error("network"));
    renderPage();
    fireEvent.change(screen.getByTestId("email-input"), { target: { value: "test@example.com" } });

    await act(async () => {
      fireEvent.click(screen.getAllByText("Generate My Report")[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/We couldn't generate your report just now\. Please try again/i)).toBeInTheDocument();
    });
  });
});
