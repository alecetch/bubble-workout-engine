import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RaceDetailsPage } from "../pages/RaceDetailsPage";
import { clearDraft, loadDraft } from "../utils/storage";
import { fetchHyroxSubmissionDraft, trackEvent } from "../utils/api";

vi.mock("../utils/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/api")>();
  return {
    ...actual,
    fetchHyroxSubmissionDraft: vi.fn(),
    trackEvent: vi.fn(),
  };
});

describe("RaceDetailsPage calculator mode selector", () => {
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

  function fillRequiredRaceDetails() {
    fireEvent.change(screen.getByLabelText(/age group/i), {
      target: { value: "30-34" },
    });
    fireEvent.change(screen.getByLabelText(/^finish time/i), {
      target: { value: "1:32:00" },
    });
  }

  test("target query param selects target mode and requires target finish time", () => {
    renderPage("/hyrox-calculator/race-details?mode=target");

    expect(screen.getByRole("button", { name: /hit a target time/i }).className).toMatch(/selected/i);
    fillRequiredRaceDetails();

    expect(screen.getAllByText(/next: check splits/i)[0]).toBeDisabled();
  });

  test("analyse query param selects analyse mode", () => {
    renderPage("/hyrox-calculator/race-details?mode=analyse");

    expect(screen.getByRole("button", { name: /analyse my race/i }).className).toMatch(/selected/i);
  });

  test("default mode is analyse and only requires age group and finish time", () => {
    renderPage();

    expect(screen.getByRole("button", { name: /analyse my race/i }).className).toMatch(/selected/i);
    fillRequiredRaceDetails();

    expect(screen.getAllByText(/next: check splits/i)[0]).not.toBeDisabled();
  });

  test("mode change persists calculatorMode in the draft", () => {
    renderPage("/hyrox-calculator/race-details?mode=target");

    fireEvent.click(screen.getByRole("button", { name: /analyse my race/i }));

    expect(loadDraft()?.calculatorMode).toBe("analyse");
  });

  test("analyse mode with slower optional goal shows warning and disables Next", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /analyse my race/i }));
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

    expect(screen.getByRole("button", { name: /hit a target time/i }).className).toMatch(/selected/i);
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

