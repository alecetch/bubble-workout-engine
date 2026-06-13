import { Routes, Route, Navigate } from "react-router-dom";
import { RaceDetailsPage } from "./pages/RaceDetailsPage";
import { SplitEntryPage } from "./pages/SplitEntryPage";
import { AthleteContextPage } from "./pages/AthleteContextPage";
import { ReviewPage } from "./pages/ReviewPage";
import { ResultPage } from "./pages/ResultPage";
import { SampleReportPage } from "./pages/SampleReportPage";
import { RunningProfilerLandingPage } from "./pages/running/RunningProfilerLandingPage";
import { RunningProfilerFormPage } from "./pages/running/RunningProfilerFormPage";
import { RunningProfilerResultsPage } from "./pages/running/RunningProfilerResultsPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/hyrox-calculator" replace />} />
      <Route path="/hyrox-calculator" element={<RaceDetailsPage />} />
      <Route path="/hyrox-calculator/splits" element={<SplitEntryPage />} />
      <Route path="/hyrox-calculator/context" element={<AthleteContextPage />} />
      <Route path="/hyrox-calculator/review" element={<ReviewPage />} />
      <Route path="/hyrox-calculator/result" element={<ResultPage />} />
      <Route path="/hyrox-calculator/sample-report" element={<SampleReportPage />} />
      <Route path="/running-profiler" element={<RunningProfilerLandingPage />} />
      <Route path="/running-profiler/profile" element={<RunningProfilerFormPage />} />
      <Route path="/running-profiler/results" element={<RunningProfilerResultsPage />} />
    </Routes>
  );
}
