import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RaceDetailsPage } from "../pages/RaceDetailsPage";
import { clearDraft, loadDraft, saveDraft } from "../utils/storage";
import { fetchHyroxResultsImport, fetchHyroxSubmissionDraft, trackEvent } from "../utils/api";

vi.mock("../utils/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/api")>();
  return {
    ...actual,
    fetchHyroxResultsImport: vi.fn(),
    fetchHyroxSubmissionDraft: vi.fn(),
    trackEvent: vi.fn(),
  };
});

describe("RaceDetailsPage progressive disclosure", () => {
  beforeEach(() => {
    clearDraft();
    vi.clearAllMocks();
  });

  function renderPage(path = "/hyrox-calculator/race-details") {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <RaceDetailsPage />
      </MemoryRouter>,
    );
  }

  function revealManualFields() {
    fireEvent.click(screen.getByRole("button", { name: /or enter manually/i }));
  }

  function fillRequiredRaceDetails() {
    fireEvent.change(screen.getByLabelText(/age group/i), {
      target: { value: "30-34" },
    });
    fireEvent.change(screen.getByLabelText(/^finish time/i), {
      target: { value: "1:32:00" },
    });
  }

  test("does not render a mode-switcher labelled What do you want to know?", () => {
    renderPage();

    expect(screen.queryByText("What do you want to know?")).not.toBeInTheDocument();
  });

  test("race detail fields are hidden on initial load with no draft", () => {
    renderPage();

    expect(screen.queryByLabelText(/age group/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^finish time/i)).not.toBeInTheDocument();
  });

  test("race detail fields are revealed after clicking Or enter manually", () => {
    renderPage();
    revealManualFields();

    expect(screen.getByLabelText(/age group/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^finish time/i)).toBeInTheDocument();
  });

  test("race detail fields are revealed when import succeeds", async () => {
    vi.mocked(fetchHyroxResultsImport).mockResolvedValue({
      success: true,
      parsed: {
        success: true,
        confidence: "high",
        athleteName: "Smith, Alice",
        athleteAge: null,
        ageGroup: "35-39",
        raceName: "HYROX Birmingham",
        division: "open",
        finishTimeSeconds: 4800,
        roxzoneSeconds: 240,
        penalties: [],
        raceReplay: [],
        warnings: [],
        splits: [],
      },
    });
    renderPage();
    fireEvent.change(screen.getByTestId("inline-url-input"), {
      target: { value: "https://results.hyrox.com/season-9/?event=birmingham" },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("inline-url-fetch"));
    });

    expect(screen.getByLabelText(/age group/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^finish time/i)).toHaveValue("1:20:00");
  });

  test("mobile sticky CTA is not rendered before showRaceFields", () => {
    renderPage();

    expect(screen.queryByTestId("mobile-sticky-cta")).not.toBeInTheDocument();
  });

  test("mobile sticky CTA appears after fields revealed", () => {
    renderPage();
    revealManualFields();

    expect(screen.getByTestId("mobile-sticky-cta")).toBeInTheDocument();
  });

  test("form title is Analyse your race in analyse mode", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Analyse your race" })).toBeInTheDocument();
  });

  test("form title is Hit a target time in target mode", () => {
    renderPage("/hyrox-calculator/race-details?mode=target");

    expect(screen.getByRole("heading", { name: "Hit a target time", level: 2 })).toBeInTheDocument();
  });

  test("section heading is Confirm your race details in analyse mode after reveal", () => {
    renderPage();
    revealManualFields();

    expect(screen.getByText("Confirm your race details")).toBeInTheDocument();
  });

  test("section heading is Confirm your race details and target in target mode after reveal", () => {
    renderPage("/hyrox-calculator/race-details?mode=target");
    revealManualFields();

    expect(screen.getByText("Confirm your race details and target")).toBeInTheDocument();
  });

  test("left-column headline is Analyse your HYROX result in analyse mode", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Analyse your HYROX result" })).toBeInTheDocument();
  });

  test("left-column headline is Hit a target time in target mode", () => {
    renderPage("/hyrox-calculator/race-details?mode=target");

    expect(screen.getByRole("heading", { name: "Hit a target time", level: 1 })).toBeInTheDocument();
  });

  test("fields are immediately visible when draft has finishTimeSeconds", () => {
    saveDraft({
      race: { finishTimeSeconds: 5000, division: "open" },
      athlete: { gender: "male", ageGroup: "30-34" },
    });

    renderPage();

    expect(screen.getByLabelText(/age group/i)).toBeInTheDocument();
  });

  test("target query param keeps target validation without rendering a mode switcher", () => {
    renderPage("/hyrox-calculator/race-details?mode=target");
    revealManualFields();
    fillRequiredRaceDetails();

    expect(screen.getAllByText(/next: check splits/i)[0]).toBeDisabled();
    expect(screen.queryByText("What do you want to know?")).not.toBeInTheDocument();
  });

  test("target mode rejects ambiguous implausible target time but accepts compact digit entry", () => {
    renderPage("/hyrox-calculator/race-details?mode=target");
    revealManualFields();
    fillRequiredRaceDetails();

    fireEvent.change(screen.getByLabelText(/target finish time/i), {
      target: { value: "1:30" },
    });

    expect(screen.getByText(/realistic HYROX target time/i)).toBeInTheDocument();
    expect(screen.getAllByText(/next: check splits/i)[0]).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/target finish time/i), {
      target: { value: "9000" },
    });

    expect(screen.queryByText(/realistic HYROX target time/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/next: check splits/i)[0]).not.toBeDisabled();
  });

  test("default mode is analyse and only requires age group and finish time after reveal", () => {
    renderPage();
    revealManualFields();
    fillRequiredRaceDetails();

    expect(screen.getAllByText(/next: check splits/i)[0]).not.toBeDisabled();
  });

  test("analyse mode with slower optional goal shows warning and disables Next", () => {
    renderPage();
    revealManualFields();
    fillRequiredRaceDetails();
    fireEvent.change(screen.getByLabelText(/goal time/i), {
      target: { value: "1:40:00" },
    });

    expect(screen.getByText(/goal time must be faster/i)).toBeInTheDocument();
    expect(screen.getAllByText(/next: check splits/i)[0]).toBeDisabled();
  });

  test("submissionId query restores the previous race draft and keeps target mode from email link", async () => {
    vi.mocked(fetchHyroxSubmissionDraft).mockResolvedValue({
      submissionId: "11111111-1111-4111-8111-111111111111",
      draft: {
        calculatorMode: "analyse",
        athlete: { name: "Alex Runner", email: "alex@example.com", gender: "male", ageGroup: "35-39" },
        race: {
          raceName: "HYROX Manchester",
          raceDate: "2026-01-24",
          division: "open",
          finishTimeSeconds: 5400,
        },
        splits: [{ index: 1, segmentKey: "run_1", label: "Run 1", type: "run", timeSeconds: 300 }],
        penalties: [{ station: "run_5", penaltySeconds: 60 }],
        raceReplay: [{ station: "ski_erg", entrySeconds: 12, exitSeconds: 18 }],
        athleteContext: { targetFinishTimeSeconds: 5100 },
        marketingConsent: false,
      },
    });

    renderPage("/hyrox-calculator/race-details?mode=target&source=email&submissionId=11111111-1111-4111-8111-111111111111");

    await waitFor(() => {
      expect(screen.getByTestId("submission-restore-message")).toHaveTextContent(/restored/i);
    });

    expect(screen.getByRole("heading", { name: "Hit a target time", level: 2 })).toBeInTheDocument();
    expect(screen.getByLabelText(/athlete name/i)).toHaveValue("Alex Runner");
    expect(screen.getByLabelText(/^finish time/i)).toHaveValue("1:30:00");
    expect(screen.getByLabelText(/target finish time/i)).toHaveValue("1:25:00");
    expect(loadDraft()?.splits?.[0]?.segmentKey).toBe("run_1");
    expect(loadDraft()?.raceReplay?.[0]?.station).toBe("ski_erg");
    expect(loadDraft()?.meta?.source).toBe("analysis_email");
    expect(loadDraft()?.meta?.sourceSubmissionId).toBe("11111111-1111-4111-8111-111111111111");
    expect(trackEvent).toHaveBeenCalledWith("analysis_email_target_clicked", {
      source: "analysis_email",
      sourceSubmissionId: "11111111-1111-4111-8111-111111111111",
      mode: "target",
    });
  });

  test("analysis_complete link restores the race draft and keeps post-analysis meta", async () => {
    vi.mocked(fetchHyroxSubmissionDraft).mockResolvedValue({
      submissionId: "11111111-1111-4111-8111-111111111111",
      draft: {
        calculatorMode: "analyse",
        athlete: { name: "Alex Runner", email: "alex@example.com", gender: "male", ageGroup: "35-39" },
        race: {
          raceName: "HYROX Manchester",
          raceDate: "2026-01-24",
          division: "open",
          finishTimeSeconds: 5400,
        },
        splits: [{ index: 1, segmentKey: "run_1", label: "Run 1", type: "run", timeSeconds: 300 }],
        penalties: [],
        raceReplay: [{ station: "ski_erg", entrySeconds: 12, exitSeconds: 18 }],
        athleteContext: {},
        marketingConsent: false,
      },
    });

    renderPage(
      "/hyrox-calculator/race-details?mode=target&source=analysis_complete&submissionId=11111111-1111-4111-8111-111111111111",
    );

    await waitFor(() => {
      expect(screen.getByTestId("submission-restore-message")).toHaveTextContent(
        /race data from this analysis has been loaded/i,
      );
    });

    expect(screen.getByRole("heading", { name: "Hit a target time", level: 2 })).toBeInTheDocument();
    expect(screen.getByLabelText(/athlete name/i)).toHaveValue("Alex Runner");
    expect(loadDraft()?.meta?.source).toBe("analysis_complete");
    expect(loadDraft()?.meta?.sourceSubmissionId).toBe("11111111-1111-4111-8111-111111111111");
    expect(trackEvent).toHaveBeenCalledWith("target_started_from_analysis_complete", {
      source: "analysis_complete",
      sourceSubmissionId: "11111111-1111-4111-8111-111111111111",
      journeyVariant: "target-post-analysis",
    });
  });

  test("source=email without submissionId does not activate the email target branch", () => {
    renderPage("/hyrox-calculator/race-details?mode=target&source=email");

    expect(loadDraft()?.meta?.source).toBeUndefined();
    expect(trackEvent).not.toHaveBeenCalledWith("analysis_email_target_clicked", expect.anything());
  });

  test("submissionId without source=email does not activate the email target branch", async () => {
    vi.mocked(fetchHyroxSubmissionDraft).mockRejectedValue(new Error("not found"));
    renderPage("/hyrox-calculator/race-details?mode=target&submissionId=11111111-1111-4111-8111-111111111111");

    await waitFor(() => {
      expect(screen.getByTestId("submission-restore-message")).toHaveTextContent(/couldn't restore/i);
    });

    expect(loadDraft()?.meta?.source).toBeUndefined();
    expect(trackEvent).not.toHaveBeenCalledWith("analysis_email_target_clicked", expect.anything());
  });
});
