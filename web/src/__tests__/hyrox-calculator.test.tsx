import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { parseTimeToSeconds, formatSeconds } from "../utils/time";
import { SplitEntryPage } from "../pages/SplitEntryPage";
import { RaceDetailsPage } from "../pages/RaceDetailsPage";
import { ResultPage } from "../pages/ResultPage";
import type { HyroxAnalysisResponse } from "../types";
import { loadDraft, saveDraft, clearDraft } from "../utils/storage";

// ─── Time utility ────────────────────────────────────────────────────────────

describe("parseTimeToSeconds", () => {
  test('parseTimeToSeconds("1:25:17") returns 5117', () => {
    expect(parseTimeToSeconds("1:25:17")).toBe(5117);
  });

  test('parseTimeToSeconds("04:12") returns 252', () => {
    expect(parseTimeToSeconds("04:12")).toBe(252);
  });

  test("parseTimeToSeconds with seconds >= 60 returns null", () => {
    expect(parseTimeToSeconds("04:60")).toBeNull();
    expect(parseTimeToSeconds("1:00:60")).toBeNull();
  });

  test('formatSeconds(5117) returns "1:25:17"', () => {
    expect(formatSeconds(5117, "HH:MM:SS")).toBe("1:25:17");
  });

  test('parseTimeToSeconds("85:17") returns 5117 (MM:SS over-1-hour)', () => {
    expect(parseTimeToSeconds("85:17")).toBe(5117);
  });
});

// ─── Draft persistence ────────────────────────────────────────────────────────

describe("draft persistence", () => {
  beforeEach(() => {
    clearDraft();
  });

  test("draft is saved to localStorage when splits are entered", () => {
    const splits = [
      {
        index: 1,
        segmentKey: "run_1",
        label: "1km Run",
        type: "run" as const,
        timeSeconds: 323,
      },
    ];
    saveDraft({ splits });
    const loaded = loadDraft();
    expect(loaded?.splits?.[0]?.timeSeconds).toBe(323);
  });

  test("draft is cleared on successful submission", () => {
    saveDraft({
      athlete: {
        email: "test@test.com",
        gender: "male",
        ageOnRaceDay: 35,
      },
    });
    clearDraft();
    expect(loadDraft()).toBeNull();
  });
});

// ─── Split entry page ─────────────────────────────────────────────────────────

describe("SplitEntryPage", () => {
  beforeEach(() => {
    clearDraft();
    saveDraft({
      athlete: { email: "test@test.com", gender: "male", ageOnRaceDay: 35 },
      race: {
        division: "open",
        finishTimeSeconds: 5117,
      },
    });
  });

  function renderSplitPage() {
    return render(
      <MemoryRouter initialEntries={["/hyrox-calculator/splits"]}>
        <SplitEntryPage />
      </MemoryRouter>,
    );
  }

  test("split total warning shown when splits exceed finish time", async () => {
    renderSplitPage();

    // Enter a very large value for Run 1 to exceed finish time
    const inputs = screen.getAllByRole("textbox");
    await act(async () => {
      fireEvent.change(inputs[0], { target: { value: "90:00" } });
    });

    // Warning banner should appear
    expect(screen.getByText(/exceeds finish time/i)).toBeInTheDocument();
  });

  test("split total clears warning when corrected below finish time", async () => {
    renderSplitPage();

    const inputs = screen.getAllByRole("textbox");

    // First trigger the over-time warning
    await act(async () => {
      fireEvent.change(inputs[0], { target: { value: "90:00" } });
    });
    expect(screen.getByText(/exceeds finish time/i)).toBeInTheDocument();

    // Now fix it
    await act(async () => {
      fireEvent.change(inputs[0], { target: { value: "5:00" } });
    });
    expect(
      screen.queryByText(/exceeds finish time/i),
    ).not.toBeInTheDocument();
  });
});

// ─── Race details page validation ─────────────────────────────────────────────

describe("RaceDetailsPage validation", () => {
  beforeEach(() => {
    clearDraft();
    // Mock trackEvent to avoid network calls
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  function renderRacePage() {
    return render(
      <MemoryRouter initialEntries={["/hyrox-calculator"]}>
        <RaceDetailsPage />
      </MemoryRouter>,
    );
  }

  test("missing finish time blocks navigation past Page 1", async () => {
    renderRacePage();

    // Fill in age range but leave finish time empty
    fireEvent.change(screen.getByLabelText(/age range/i), {
      target: { value: "35-39" },
    });

    const nextBtn = screen.getByText(/next: enter your splits/i);
    await act(async () => {
      fireEvent.click(nextBtn);
    });

    expect(
      screen.getByText(/enter finish time/i),
    ).toBeInTheDocument();
  });
});

// ─── Result page ──────────────────────────────────────────────────────────────

describe("ResultPage", () => {
  const mockResponse: HyroxAnalysisResponse = {
    submissionId: "abc-123",
    status: "complete",
    analysisScope: "full",
    reportSentTo: "john@example.com",
    carouselDataAvailable: false,
    analysisVersion: "hyrox_engine_v1.0.0",
    browserSummary: {
      heroInsight: {
        label: "Wall Balls",
        timeGapFormatted: "2:30",
      },
      overallPercentile: 60,
      biggestStrength: { label: "Running", percentile: 30 },
      timePotential: {
        projectedGainFormatted: "3:45",
        newProjectedTimeFormatted: "1:21:32",
      },
    },
  };

  function renderResultPage() {
    return render(
      <MemoryRouter
        initialEntries={[
          { pathname: "/hyrox-calculator/result", state: { response: mockResponse } },
        ]}
      >
        <ResultPage />
      </MemoryRouter>,
    );
  }

  test("result page renders hero insight from API response", () => {
    renderResultPage();
    expect(screen.getByTestId("result-headline")).toHaveTextContent(
      /Wall Balls/i,
    );
  });

  test("result page shows email confirmation message", () => {
    renderResultPage();
    expect(screen.getByTestId("email-confirmation")).toHaveTextContent(
      "john@example.com",
    );
  });
});
