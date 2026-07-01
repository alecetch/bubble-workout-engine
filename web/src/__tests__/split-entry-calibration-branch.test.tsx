import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AthleteContextPage } from "../pages/AthleteContextPage";
import { SplitEntryPage } from "../pages/SplitEntryPage";
import { SEGMENTS } from "../data/segments";
import { clearDraft, loadDraft, saveDraft } from "../utils/storage";

vi.mock("../utils/api", () => ({
  trackEvent: vi.fn(),
}));

function seedDraft(withEmailMeta = false) {
  saveDraft({
    calculatorMode: "target",
    athlete: { gender: "male", ageGroup: "30-34" },
    race: { division: "open", finishTimeSeconds: 5400 },
    splits: SEGMENTS.map((segment) => ({ ...segment, timeSeconds: 300 })),
    marketingConsent: false,
    ...(withEmailMeta
      ? { meta: { source: "analysis_email" as const, sourceSubmissionId: "11111111-1111-4111-8111-111111111111" } }
      : {}),
  });
}

function renderFlow() {
  return render(
    <MemoryRouter initialEntries={["/hyrox-calculator/splits"]}>
      <Routes>
        <Route path="/hyrox-calculator/splits" element={<SplitEntryPage />} />
        <Route path="/hyrox-calculator/context" element={<div>Context route</div>} />
        <Route path="/hyrox-calculator/target-calibration" element={<div>Calibration route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function seedContextDraft(calculatorMode: "target" | "analyse") {
  saveDraft({
    calculatorMode,
    athlete: { gender: "male", ageGroup: "30-34" },
    race: { division: "open", finishTimeSeconds: 5400 },
    splits: SEGMENTS.map((segment) => ({ ...segment, timeSeconds: 300 })),
    athleteContext: { targetFinishTimeSeconds: calculatorMode === "target" ? 5100 : undefined },
    marketingConsent: false,
  });
}

function renderContextFlow() {
  return render(
    <MemoryRouter initialEntries={["/hyrox-calculator/context"]}>
      <Routes>
        <Route path="/hyrox-calculator/context" element={<AthleteContextPage />} />
        <Route path="/hyrox-calculator/target-calibration" element={<div>Calibration route</div>} />
        <Route path="/hyrox-calculator/review" element={<div>Review route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function completeContextForm() {
  fireEvent.click(screen.getByRole("button", { name: /4-5 days\/week/i }));
  fireEvent.click(screen.getByRole("button", { name: /30-45 km/i }));
  fireEvent.click(screen.getByRole("button", { name: /crossfit \/ hybrid/i }));
  fireEvent.click(screen.getAllByRole("button", { name: /review my inputs/i })[0]);
}

describe("SplitEntryPage calibration branch", () => {
  beforeEach(() => {
    clearDraft();
    vi.clearAllMocks();
  });

  test("email branch continues to target calibration", () => {
    seedDraft(true);
    renderFlow();

    fireEvent.click(screen.getAllByRole("button", { name: /continue: add context/i })[0]);

    expect(screen.getByText("Calibration route")).toBeInTheDocument();
  });

  test("normal branch continues to context", () => {
    seedDraft(false);
    renderFlow();

    fireEvent.click(screen.getAllByRole("button", { name: /continue: add context/i })[0]);

    expect(screen.getByText("Context route")).toBeInTheDocument();
  });

  test("AthleteContextPage navigates to target calibration for target-direct", () => {
    seedContextDraft("target");
    renderContextFlow();

    completeContextForm();

    expect(screen.getByText("Calibration route")).toBeInTheDocument();
    expect(loadDraft()?.athleteContext?.targetFinishTimeSeconds).toBe(5100);
  });

  test("AthleteContextPage navigates to review for analyse mode", () => {
    seedContextDraft("analyse");
    renderContextFlow();

    completeContextForm();

    expect(screen.getByText("Review route")).toBeInTheDocument();
  });
});
