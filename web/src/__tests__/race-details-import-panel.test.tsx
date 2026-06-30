import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RaceDetailsPage } from "../pages/RaceDetailsPage";
import { clearDraft, loadDraft, saveDraft } from "../utils/storage";
import { normalizeAgeGroup } from "../utils/hyroxImportDraft";
import { fetchHyroxResultsImport } from "../utils/api";
import { FULL_PAGE_TEXT } from "./hyrox-results-parser.test";

vi.mock("../utils/api", () => ({
  fetchHyroxResultsImport: vi.fn(),
  fetchHyroxSubmissionDraft: vi.fn(),
  trackEvent: vi.fn(),
}));

describe("RaceDetailsPage inline import panel", () => {
  beforeEach(() => {
    clearDraft();
    vi.clearAllMocks();
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/hyrox-calculator/race-details"]}>
        <RaceDetailsPage />
      </MemoryRouter>,
    );
  }

  test("URL import is the preferred Screen 1 import path", () => {
    renderPage();
    expect(screen.getByTestId("inline-import-panel")).toBeInTheDocument();
    expect(screen.getByTestId("inline-url-input")).toBeInTheDocument();
    expect(screen.getByText(/FREE HYROX ANALYSIS/i)).toBeInTheDocument();
    expect(screen.getByText(/Paste your HYROX result URL or enter your race manually/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/HYROX result URL/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Next: Check Splits/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/No account needed\. Email capture happens at review/i)).toBeInTheDocument();
    expect(screen.getByText(/WHAT YOU'LL GET/i)).toBeInTheDocument();
    expect(screen.getByText(/A race report that tells you what to train next/i)).toBeInTheDocument();
    expect(screen.getByText(/Benchmark comparison/i)).toBeInTheDocument();
    expect(screen.queryByText(/Projected insight/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Wall Balls cost you the most time/i)).not.toBeInTheDocument();
  });

  test("Or enter manually separator is visible before import", () => {
    renderPage();
    expect(screen.getByTestId("manual-entry-separator")).toBeInTheDocument();
  });

  test("Successful paste import pre-fills fields and hides separator", async () => {
    renderPage();

    fireEvent.click(screen.getByText("Manual"));
    fireEvent.change(screen.getByTestId("paste-area"), { target: { value: FULL_PAGE_TEXT } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("parse-btn"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-btn"));
    });

    expect(screen.getByTestId("import-success-badge")).toBeInTheDocument();
    expect(screen.getByText(/Result imported/i)).toBeInTheDocument();
    expect(screen.queryByTestId("manual-entry-separator")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/athlete name/i)).toHaveValue("Gaston Vanadia");
    expect(screen.getByLabelText(/age group/i)).toHaveValue("45-49");
    expect(screen.getByLabelText(/^finish time/i)).toHaveValue("1:35:38");
    expect(loadDraft()?.athlete?.name).toBe("Gaston Vanadia");
    expect(loadDraft()?.athlete?.ageGroup).toBe("45-49");
    expect(loadDraft()?.splits?.length).toBeGreaterThan(0);
    expect(screen.queryByText(/Projected insight/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Wall Balls cost you the most time/i)).not.toBeInTheDocument();
  });

  test("Existing draft athlete name renders in title case", () => {
    saveDraft({
      athlete: { name: "gaston vanadia", gender: "male", ageGroup: "35-39" },
      race: { division: "open", finishTimeSeconds: 5738 },
      splits: [],
      marketingConsent: false,
    });

    renderPage();

    expect(screen.getByLabelText(/athlete name/i)).toHaveValue("Gaston Vanadia");
  });

  test("normalizeAgeGroup maps imported HYROX age bands into selector values", () => {
    expect(normalizeAgeGroup("45-49")).toBe("45-49");
    expect(normalizeAgeGroup("M40")).toBe("40-44");
    expect(normalizeAgeGroup("F35")).toBe("35-39");
  });

  test("HYROX event dropdown is not shown on Screen 1", () => {
    renderPage();
    expect(screen.queryByLabelText(/hyrox event/i)).not.toBeInTheDocument();
  });

  test("Typed known race name pre-fills race date on blur", () => {
    renderPage();

    const raceName = screen.getByLabelText(/race name/i);
    fireEvent.change(raceName, { target: { value: "Birmingham" } });
    fireEvent.blur(raceName);

    expect(screen.getByLabelText(/race date/i)).toHaveValue("2026-10-27");
  });

  test("URL tab renders on Screen 1", () => {
    renderPage();
    expect(screen.getByTestId("inline-url-input")).toBeInTheDocument();
  });

  test("URL tab rejects non-HYROX URLs", async () => {
    renderPage();
    fireEvent.change(screen.getByTestId("inline-url-input"), { target: { value: "https://google.com" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("inline-url-fetch"));
    });

    expect(screen.getByTestId("inline-url-error")).toBeInTheDocument();
    expect(fetchHyroxResultsImport).not.toHaveBeenCalled();
  });

  test("Successful URL import pre-fills known event date", async () => {
    vi.mocked(fetchHyroxResultsImport).mockResolvedValue({
      success: true,
      parsed: {
        success: true,
        confidence: "high",
        athleteName: "test, athlete",
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

    expect(screen.getByLabelText(/race name/i)).toHaveValue("HYROX Birmingham");
    expect(screen.getByLabelText(/race date/i)).toHaveValue("2026-10-27");
  });

  test("Successful URL import applies server event date over static fallback", async () => {
    vi.mocked(fetchHyroxResultsImport).mockResolvedValue({
      success: true,
      eventDate: "2025-12-04",
      eventName: "HYROX London Excel",
      parsed: {
        success: true,
        confidence: "high",
        athleteName: "test, athlete",
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
      target: { value: "https://results.hyrox.com/season-8/?event_main_group=2025+London+Excel" },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("inline-url-fetch"));
    });

    expect(screen.getByLabelText(/race date/i)).toHaveValue("2025-12-04");
  });
});
