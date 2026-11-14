import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { BRAND } from "../config/brand";
import { TopNav } from "../components/TopNav";
import { RaceDetailsPage } from "../pages/RaceDetailsPage";
import { ReviewPage } from "../pages/ReviewPage";
import { ResultPage } from "../pages/ResultPage";
import { AthleteContextPage } from "../pages/AthleteContextPage";
import { HyroxLandingPage } from "../pages/HyroxLandingPage";
import { TargetCalibrationStep1Page } from "../pages/TargetCalibrationStep1Page";
import { TargetCalibrationStep2Page } from "../pages/TargetCalibrationStep2Page";
import { PredictorReviewPage } from "../pages/predictor/PredictorReviewPage";
import { RunningProfilerLandingPage } from "../pages/running/RunningProfilerLandingPage";
import { saveDraft } from "../utils/storage";
import { savePredictorDraft } from "../utils/predictorStorage";

vi.mock("../utils/api", async importOriginal => ({
  ...await importOriginal<typeof import("../utils/api")>(),
  trackEvent: vi.fn(), trackServerEvent: vi.fn(), submitHyroxAnalysis: vi.fn(), submitHyroxPrediction: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  saveDraft({ calculatorMode: "target", athlete: { name: "Alex", gender: "male", ageGroup: "30-34" },
    race: { raceName: "HYROX London", division: "open", finishTimeSeconds: 5400 },
    splits: Array.from({ length: 16 }, (_, index) => ({ index: index + 1, segmentKey: `segment_${index + 1}`, label: `Segment ${index + 1}`, type: index % 2 === 0 ? "run" : "station", timeSeconds: 300 })),
    roxzoneTimeSeconds: 600, athleteContext: { targetFinishTimeSeconds: 5100 }, marketingConsent: false, appLinkConsent: false });
  savePredictorDraft({ athlete: { name: "Alex", sex: "male", ageGroup: "30-34", division: "open" }, benchmarks: { run5kSeconds: 1350 }, context: {}, race: {}, marketingConsent: false, researchConsent: false, appLinkConsent: false });
});
afterEach(cleanup);

function show(component: ReactElement, pathname = "/hyrox-calculator") {
  render(<MemoryRouter initialEntries={[pathname]}>{component}</MemoryRouter>);
  expect(document.body.textContent).not.toMatch(/\bforma\b/i);
}

test("TopNav serves the hosted brand lockup", () => {
  show(<TopNav />);
  expect(screen.getByRole("img", { name: BRAND.name })).toHaveAttribute("src", BRAND.lockupSrc);
});
for (const mode of ["analyse", "target"] as const) {
  test(`race details ${mode} uses the approved first-person copy`, () => {
    saveDraft({ calculatorMode: mode });
    show(<RaceDetailsPage />, `/hyrox-calculator/race-details?mode=${mode}`);
    expect(screen.getByText(mode === "target"
      ? "Start with your latest HYROX result. We'll use your splits as the baseline, then show what needs to change to reach your goal."
      : "Paste your result URL and we'll benchmark your race, find the biggest time gaps, and show what to train next.")).toBeInTheDocument();
    expect(screen.getByText(mode === "target" ? "Paste your HYROX result URL and we'll use your splits as your baseline." : "Paste your HYROX result URL and we'll benchmark your race.")).toBeInTheDocument();
  });
}

test("review consent names the current brand", () => {
  show(<ReviewPage />, "/hyrox-calculator/review");
  expect(screen.getByRole("checkbox", { name: `Link this result to my ${BRAND.name} account if I create one, so my training can use it.` })).not.toBeChecked();
  expect(screen.getByText("Check the details below, add your email, and we'll generate your personalised HYROX performance report.")).toBeInTheDocument();
});
test("predictor marketing and app-link consents name the current brand", () => {
  show(<PredictorReviewPage />, "/hyrox-predictor/review");
  expect(screen.getByRole("checkbox", { name: `Send me HYROX training updates and other emails from ${BRAND.name}.` })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: `Link this result to my ${BRAND.name} account if I create one, so my training can use it.` })).not.toBeChecked();
});
test("result app CTA uses current brand and preserves the destination", () => {
  render(<MemoryRouter initialEntries={[{ pathname: "/hyrox-calculator/result", state: { response: { submissionId: "brand-test", status: "complete", analysisScope: "full", reportSentTo: "alex@example.com", carouselDataAvailable: false, analysisVersion: "test", calculatorMode: "analyse", browserSummary: {} } } }]}><ResultPage /></MemoryRouter>);
  expect(document.body.textContent).not.toMatch(/\bforma\b/i);
  expect(screen.getByText(`Continue in the ${BRAND.name} app and start training for your next result.`)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /continue in the app/i })).toHaveAttribute("href", "/download?submissionId=brand-test");
});
for (const [name, component, pathname, expected] of [
  ["athlete context", <AthleteContextPage />, "/hyrox-calculator/context", "This step helps us tell the difference."],
  ["landing", <HyroxLandingPage />, "/hyrox-calculator", "Works best once we have your latest race data."],
  ["fitness markers", <TargetCalibrationStep1Page />, "/hyrox-calculator/target-calibration", "so we can estimate"],
  ["HYROX benchmarks", <TargetCalibrationStep2Page />, "/hyrox-calculator/target-benchmarks", "These markers help us understand"],
  ["running profiler", <RunningProfilerLandingPage />, "/running-profiler", `${BRAND.wordmark} — ${BRAND.toolTagline.toUpperCase()}`],
] as const) {
  test(`${name} renders current copy`, () => {
    show(component, pathname);
    expect(document.body.textContent).toContain(expected);
  });
}
