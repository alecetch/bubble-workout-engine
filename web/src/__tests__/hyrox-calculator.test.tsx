import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { parseTimeToSeconds, formatSeconds } from "../utils/time";
import { SplitEntryPage } from "../pages/SplitEntryPage";
import { RaceDetailsPage } from "../pages/RaceDetailsPage";
import { AthleteContextPage } from "../pages/AthleteContextPage";
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

  test("screen 2 renders quality-check intro and data reconciliation summary", () => {
    saveDraft({
      roxzoneTimeSeconds: 101,
      raceReplay: [
        { station: "ski_erg", entrySeconds: 5, exitSeconds: 31 },
        { station: "sandbag_lunges", entrySeconds: 49, exitSeconds: 15 },
      ],
      splits: [
        { index: 1, segmentKey: "run_1", label: "Run 1", type: "run", timeSeconds: 300 },
        { index: 2, segmentKey: "ski_erg", label: "SkiErg", type: "station", timeSeconds: 280 },
      ],
    });

    renderSplitPage();

    expect(screen.getByText(/Check your imported splits/i)).toBeInTheDocument();
    expect(screen.getByText(/quality check, not a test/i)).toBeInTheDocument();
    expect(screen.getByText(/Imported from HYROX/i)).toBeInTheDocument();
    expect(screen.getByText(/Data check/i)).toBeInTheDocument();
    expect(screen.getByText(/Imported result looks coherent/i)).toBeInTheDocument();
    expect(screen.getByText(/Splits and RoxZone replay agree closely enough to continue/i)).toBeInTheDocument();
    expect(screen.getByTestId("workout-summary-card")).toHaveTextContent(/Finish/i);
    expect(screen.getByTestId("workout-summary-card")).toHaveTextContent(/Splits Total/i);
    expect(screen.getByTestId("workout-summary-card")).toHaveTextContent(/Official RoxZone/i);
    expect(screen.getByTestId("workout-summary-card")).toHaveTextContent(/Replay RoxZone/i);
    expect(screen.getByTestId("workout-summary-card")).toHaveTextContent(/Difference/i);
    expect(screen.getByTestId("workout-summary-card")).toHaveTextContent(/1:40/i);
    expect(screen.getByTestId("workout-summary-card")).toHaveTextContent(/1:41/i);
    expect(screen.getByTestId("workout-summary-card")).toHaveTextContent(/\+0:01/i);
    expect(screen.getByTestId("race-replay-summary-card")).toHaveTextContent(/Small differences are expected/i);
    expect(screen.getByText(/Screen 3 asks for training background/i)).toBeInTheDocument();
  });

  test("race replay detail is expandable", () => {
    saveDraft({
      roxzoneTimeSeconds: 273,
      raceReplay: [
        { station: "ski_erg", entrySeconds: 5, exitSeconds: 31 },
        { station: "sandbag_lunges", entrySeconds: 49, exitSeconds: 15 },
      ],
    });

    renderSplitPage();

    expect(screen.getByTestId("race-replay-summary-card")).not.toHaveTextContent(/StationInOutRoxZone/i);
    fireEvent.click(screen.getByRole("button", { name: /show roxzone detail/i }));
    expect(screen.getByTestId("race-replay-summary-card")).toHaveTextContent(/Station/i);
    expect(screen.getByTestId("race-replay-summary-card")).toHaveTextContent(/In/i);
    expect(screen.getByTestId("race-replay-summary-card")).toHaveTextContent(/Out/i);
    expect(screen.getByTestId("race-replay-summary-card")).toHaveTextContent(/Sandbag Lunges/i);
    expect(screen.getByTestId("race-replay-summary-card")).toHaveTextContent(/1:04/i);
  });

  test("race replay summary rejects imported clock values", () => {
    saveDraft({
      raceReplay: [
        { station: "ski_erg", entrySeconds: 32121, exitSeconds: 32403 },
        { station: "sandbag_lunges", entrySeconds: 35597, exitSeconds: 35973 },
      ],
    });

    renderSplitPage();

    expect(screen.getByTestId("race-replay-summary-card")).toHaveTextContent(/Reimport/i);
    expect(screen.getByTestId("race-replay-summary-card")).toHaveTextContent(/old RoxZone replay clock values/i);
    expect(screen.getByRole("button", { name: /back to import/i })).toBeInTheDocument();
    expect(screen.getByTestId("race-replay-summary-card")).not.toHaveTextContent(/17:55:24/i);
  });

  test("race replay summary marks incomplete station rows as not applicable", () => {
    saveDraft({
      raceReplay: [
        { station: "sandbag_lunges", entrySeconds: 49, exitSeconds: 15 },
        { station: "wall_balls", entrySeconds: 278, exitSeconds: null },
      ],
    });

    renderSplitPage();

    expect(screen.getByTestId("race-replay-summary-card")).toHaveTextContent(/Sandbag Lunges/i);
    fireEvent.click(screen.getByRole("button", { name: /show roxzone detail/i }));
    expect(screen.getByTestId("race-replay-summary-card")).toHaveTextContent(/Wall Balls/i);
    expect(screen.getByTestId("race-replay-summary-card")).toHaveTextContent(/N\/A/i);
    expect(screen.getByTestId("race-replay-summary-card")).not.toHaveTextContent(/4:38/i);
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

  test("target finish time is required before continuing past Page 1", async () => {
    renderRacePage();

    fireEvent.change(screen.getByLabelText(/age group/i), {
      target: { value: "35-39" },
    });
    fireEvent.change(screen.getByLabelText(/^finish time/i), {
      target: { value: "59:08" },
    });

    const nextBtn = screen.getAllByText(/next: check splits/i)[0];
    expect(nextBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/target finish time/i), {
      target: { value: "1:00:00" },
    });
    expect(screen.getByText(/target time should be faster/i)).toBeInTheDocument();
    expect(nextBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/target finish time/i), {
      target: { value: "55:00" },
    });
    expect(nextBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(nextBtn);
    });

    expect(loadDraft()?.athleteContext?.targetFinishTimeSeconds).toBe(3300);
  });
});

// ─── Result page ──────────────────────────────────────────────────────────────

describe("AthleteContextPage", () => {
  beforeEach(() => {
    clearDraft();
    saveDraft({
      athlete: { email: "test@test.com", gender: "male", ageOnRaceDay: 35 },
      race: { division: "open", finishTimeSeconds: 5117 },
      athleteContext: { targetFinishTimeSeconds: 4800 },
      splits: [
        { index: 1, segmentKey: "run_1", label: "Run 1", type: "run", timeSeconds: 300 },
        { index: 2, segmentKey: "ski_erg", label: "SkiErg", type: "station", timeSeconds: 280 },
      ],
      roxzoneTimeSeconds: 101,
      raceReplay: [
        { station: "ski_erg", entrySeconds: 5, exitSeconds: 31 },
        { station: "sandbag_lunges", entrySeconds: 49, exitSeconds: 15 },
      ],
    });
  });

  function renderContextPage() {
    return render(
      <MemoryRouter initialEntries={["/hyrox-calculator/context"]}>
        <AthleteContextPage />
      </MemoryRouter>,
    );
  }

  test("renders Screen 3 coaching context copy and side panels", () => {
    renderContextPage();

    expect(screen.getByText(/Add training context/i)).toBeInTheDocument();
    expect(screen.getByText(/Your splits show what happened; context helps explain why/i)).toBeInTheDocument();
    expect(screen.getByText(/STEP 3 OF 4/i)).toBeInTheDocument();
    expect(screen.getByText(/Takes 60 seconds/i)).toBeInTheDocument();
    expect(screen.getByText(/Optional notes/i)).toBeInTheDocument();
    expect(screen.getByText(/0\/3 required sections complete/i)).toBeInTheDocument();
    expect(screen.getByText(/Optional · 0\/500/i)).toBeInTheDocument();
    expect(screen.getByText(/How often do you currently train/i)).toBeInTheDocument();
    expect(screen.getByText(/What is your current running volume/i)).toBeInTheDocument();
    expect(screen.getByText(/What best describes your strength background/i)).toBeInTheDocument();
    expect(screen.getByText(/Anything we should account for/i)).toBeInTheDocument();
    expect(screen.getByText(/WHY THIS MATTERS/i)).toBeInTheDocument();
    expect(screen.getByText(/Context changes the advice/i)).toBeInTheDocument();
    expect(screen.getByText(/DATA ALREADY CAPTURED/i)).toBeInTheDocument();
    expect(screen.getByText(/Target/i)).toBeInTheDocument();
    expect(screen.getByText(/1:20:00/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Review My Inputs/i).length).toBeGreaterThan(0);
  });

  test("requires the first three questions but keeps notes optional", async () => {
    renderContextPage();

    await act(async () => {
      fireEvent.click(screen.getAllByText(/Review My Inputs/i)[0]);
    });
    expect(screen.getAllByText(/Please select an option/i)).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: /4-5 days\/week/i }));
    fireEvent.click(screen.getByRole("button", { name: /15-30 km/i }));
    fireEvent.click(screen.getByRole("button", { name: /CrossFit \/ hybrid/i }));

    await act(async () => {
      fireEvent.click(screen.getAllByText(/Review My Inputs/i)[0]);
    });

    expect(loadDraft()?.athleteContext?.weeklyStrengthSessions).toBe("4_5_days_week");
    expect(loadDraft()?.athleteContext?.weeklyRunningVolume).toBe("15_30_km");
    expect(loadDraft()?.athleteContext?.primaryBackground).toBe("crossfit_hybrid");
    expect(loadDraft()?.athleteContext?.additionalContext).toBeUndefined();
    expect(loadDraft()?.athleteContext?.targetFinishTimeSeconds).toBe(4800);
  });
});

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
