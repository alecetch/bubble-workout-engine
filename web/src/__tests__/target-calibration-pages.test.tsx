import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TargetCalibrationStep1Page } from "../pages/TargetCalibrationStep1Page";
import { TargetCalibrationStep2Page } from "../pages/TargetCalibrationStep2Page";
import { clearDraft, loadDraft, saveDraft } from "../utils/storage";
import { trackEvent } from "../utils/api";

vi.mock("../utils/api", () => ({
  trackEvent: vi.fn(),
}));

function seedEmailDraft() {
  saveDraft({
    calculatorMode: "target",
    athlete: { gender: "male", ageGroup: "30-34" },
    race: { division: "open", finishTimeSeconds: 5400 },
    splits: [],
    athleteContext: { targetFinishTimeSeconds: 5100 },
    marketingConsent: false,
    meta: { source: "analysis_email", sourceSubmissionId: "11111111-1111-4111-8111-111111111111" },
  });
}

function seedDirectTargetDraft() {
  saveDraft({
    calculatorMode: "target",
    athlete: { gender: "male", ageGroup: "30-34" },
    race: { division: "open", finishTimeSeconds: 5400 },
    splits: [],
    athleteContext: { targetFinishTimeSeconds: 5100 },
    marketingConsent: false,
  });
}

function seedAnalyseDraft() {
  saveDraft({
    calculatorMode: "analyse",
    athlete: { gender: "male", ageGroup: "30-34" },
    race: { division: "open", finishTimeSeconds: 5400 },
    splits: [],
    marketingConsent: false,
  });
}

function renderStep1(initialPath = "/hyrox-calculator/target-calibration") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/hyrox-calculator" element={<div>Start route</div>} />
        <Route path="/hyrox-calculator/context" element={<div>Context route</div>} />
        <Route path="/hyrox-calculator/race-details" element={<div>Race details route</div>} />
        <Route path="/hyrox-calculator/splits" element={<div>Splits route</div>} />
        <Route path="/hyrox-calculator/target-calibration" element={<TargetCalibrationStep1Page />} />
        <Route path="/hyrox-calculator/target-benchmarks" element={<div>Benchmarks route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderStep2(initialPath = "/hyrox-calculator/target-benchmarks") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/hyrox-calculator" element={<div>Start route</div>} />
        <Route path="/hyrox-calculator/race-details" element={<div>Race details route</div>} />
        <Route path="/hyrox-calculator/target-calibration" element={<div>Calibration route</div>} />
        <Route path="/hyrox-calculator/target-benchmarks" element={<TargetCalibrationStep2Page />} />
        <Route path="/hyrox-calculator/review" element={<div>Review route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("TargetCalibrationStep1Page", () => {
  beforeEach(() => {
    clearDraft();
    vi.clearAllMocks();
  });

  test("redirects to race details for analyse mode", () => {
    seedAnalyseDraft();
    renderStep1();

    expect(screen.getByText("Race details route")).toBeInTheDocument();
  });

  test("renders when calculatorMode is target and meta.source is absent", () => {
    seedDirectTargetDraft();
    renderStep1();

    expect(screen.getByRole("heading", { name: "Fitness markers" })).toBeInTheDocument();
    expect(screen.getByLabelText(/best 5k time/i)).toBeInTheDocument();
  });

  test("with email context renders fitness marker fields and skip link", () => {
    seedEmailDraft();
    renderStep1();

    expect(screen.getByLabelText(/best 5k time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/best 10k time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/back squat 3rm/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/deadlift 3rm/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /skip for now/i })).toBeInTheDocument();
  });

  test("email branch keeps existing current fitness markers heading", () => {
    seedEmailDraft();
    renderStep1();

    expect(screen.getByRole("heading", { name: "Current fitness markers" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Fitness markers" })).not.toBeInTheDocument();
  });

  test("continue with empty 5k shows warning", () => {
    seedEmailDraft();
    renderStep1();

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    expect(screen.getByText(/best 5k time helps/i)).toBeInTheDocument();
  });

  test("skip navigates to benchmarks and fires event", () => {
    seedEmailDraft();
    renderStep1();

    fireEvent.click(screen.getByRole("button", { name: /skip for now/i }));

    expect(trackEvent).toHaveBeenCalledWith("target_calibration_step1_skipped", expect.anything());
    expect(screen.getByText("Benchmarks route")).toBeInTheDocument();
  });

  test("continue with 5k saves context and navigates to benchmarks", () => {
    seedEmailDraft();
    renderStep1();

    fireEvent.change(screen.getByLabelText(/best 5k time/i), { target: { value: "22:00" } });
    fireEvent.change(screen.getByLabelText(/back squat 3rm/i), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    expect(loadDraft()?.athleteContext?.run5kPbSeconds).toBe(1320);
    expect(loadDraft()?.athleteContext?.backSquat3RMKg).toBe(100);
    expect(trackEvent).toHaveBeenCalledWith("target_calibration_step1_completed", expect.objectContaining({ has5kTime: true }));
    expect(screen.getByText("Benchmarks route")).toBeInTheDocument();
  });

  test("back navigates to context for direct-target variant", () => {
    seedDirectTargetDraft();
    renderStep1();

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));

    expect(screen.getByText("Context route")).toBeInTheDocument();
  });

  test("back navigates to splits for email branch", () => {
    seedEmailDraft();
    renderStep1();

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));

    expect(screen.getByText("Splits route")).toBeInTheDocument();
  });
});

describe("TargetCalibrationStep2Page", () => {
  beforeEach(() => {
    clearDraft();
    vi.clearAllMocks();
  });

  test("redirects to race details for analyse mode", () => {
    seedAnalyseDraft();
    renderStep2();

    expect(screen.getByText("Race details route")).toBeInTheDocument();
  });

  test("renders when calculatorMode is target and meta.source is absent", () => {
    seedDirectTargetDraft();
    renderStep2();

    expect(screen.getByRole("heading", { name: "Optional HYROX benchmarks" })).toBeInTheDocument();
    expect(screen.getByLabelText(/2k row time/i)).toBeInTheDocument();
  });

  test("with email context renders all optional benchmark fields", () => {
    seedEmailDraft();
    renderStep2();

    expect(screen.getByLabelText(/2k row time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/1k skierg time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/wall balls in 2 min/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/farmer's carry 200m time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/target race date/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /skip optional benchmarks/i })).toHaveLength(2);
  });

  test("skip fires event and navigates to review", () => {
    seedEmailDraft();
    renderStep2();

    fireEvent.click(screen.getAllByRole("button", { name: /skip optional benchmarks/i })[0]);

    expect(trackEvent).toHaveBeenCalledWith("target_calibration_step2_skipped", expect.anything());
    expect(screen.getByText("Review route")).toBeInTheDocument();
  });

  test("continue with no fields fires zero count and navigates", () => {
    seedEmailDraft();
    renderStep2();

    fireEvent.click(screen.getByRole("button", { name: /continue to target plan/i }));

    expect(trackEvent).toHaveBeenCalledWith(
      "target_calibration_step2_completed",
      expect.objectContaining({ benchmarkFieldsCompleted: 0 }),
    );
    expect(screen.getByText("Review route")).toBeInTheDocument();
  });

  test("continue with some fields includes benchmark count", () => {
    seedEmailDraft();
    renderStep2();

    fireEvent.change(screen.getByLabelText(/2k row time/i), { target: { value: "7:00" } });
    fireEvent.change(screen.getByLabelText(/wall balls in 2 min/i), { target: { value: "55" } });
    fireEvent.click(screen.getByRole("button", { name: /continue to target plan/i }));

    expect(trackEvent).toHaveBeenCalledWith(
      "target_calibration_step2_completed",
      expect.objectContaining({ hasRowTime: true, hasWallBalls: true, benchmarkFieldsCompleted: 2 }),
    );
    expect(loadDraft()?.athleteContext?.rowErg2kSeconds).toBe(420);
    expect(loadDraft()?.athleteContext?.wallBallRepsIn2Min).toBe(55);
  });
});
