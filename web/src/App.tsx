import { useEffect } from "react";
import { Routes, Route, useLocation, useParams } from "react-router-dom";
import { RaceDetailsPage } from "./pages/RaceDetailsPage";
import { SplitEntryPage } from "./pages/SplitEntryPage";
import { AthleteContextPage } from "./pages/AthleteContextPage";
import { ReviewPage } from "./pages/ReviewPage";
import { ResultPage } from "./pages/ResultPage";
import { SampleReportPage } from "./pages/SampleReportPage";
import { HyroxLandingPage } from "./pages/HyroxLandingPage";
import { PredictorStep1Page } from "./pages/predictor/PredictorStep1Page";
import { PredictorStep2Page } from "./pages/predictor/PredictorStep2Page";
import { PredictorReviewPage } from "./pages/predictor/PredictorReviewPage";
import { PredictorResultPage } from "./pages/predictor/PredictorResultPage";
import { RunningProfilerLandingPage } from "./pages/running/RunningProfilerLandingPage";
import { RunningProfilerFormPage } from "./pages/running/RunningProfilerFormPage";
import { RunningProfilerResultsPage } from "./pages/running/RunningProfilerResultsPage";
import { ImportResultsPage } from "./pages/ImportResultsPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (import.meta.env.MODE === "test") return;
    try {
      window.scrollTo(0, 0);
    } catch {
      // jsdom does not implement scrollTo.
    }
  }, [pathname]);
  return null;
}

function HyroxCarouselRedirect() {
  const { submissionId = "" } = useParams();
  const target = `/api/hyrox/carousel/${encodeURIComponent(submissionId)}`;

  useEffect(() => {
    if (import.meta.env.MODE !== "test") {
      window.location.replace(target);
    }
  }, [target]);

  return (
    <main>
      <a href={target}>Open your Instagram carousel slides</a>
    </main>
  );
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route path="/" element={<HyroxLandingPage />} />
      <Route path="/hyrox-calculator" element={<RaceDetailsPage />} />
      <Route path="/hyrox-calculator/import" element={<ImportResultsPage />} />
      <Route path="/hyrox-calculator/splits" element={<SplitEntryPage />} />
      <Route path="/hyrox-calculator/context" element={<AthleteContextPage />} />
      <Route path="/hyrox-calculator/review" element={<ReviewPage />} />
      <Route path="/hyrox-calculator/result" element={<ResultPage />} />
      <Route path="/hyrox-calculator/sample-report" element={<SampleReportPage />} />
      <Route path="/hyrox/carousel/:submissionId" element={<HyroxCarouselRedirect />} />
      <Route path="/hyrox-predictor" element={<PredictorStep1Page />} />
      <Route path="/hyrox-predictor/benchmarks" element={<PredictorStep2Page />} />
      <Route path="/hyrox-predictor/review" element={<PredictorReviewPage />} />
      <Route path="/hyrox-predictor/result" element={<PredictorResultPage />} />
      <Route path="/running-profiler" element={<RunningProfilerLandingPage />} />
      <Route path="/running-profiler/profile" element={<RunningProfilerFormPage />} />
      <Route path="/running-profiler/results" element={<RunningProfilerResultsPage />} />
    </Routes>
    </>
  );
}
