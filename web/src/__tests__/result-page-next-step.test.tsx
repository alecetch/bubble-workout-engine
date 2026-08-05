import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ResultPage } from "../pages/ResultPage";
import type { HyroxAnalysisResponse } from "../types";

vi.mock("../utils/api", () => ({
  trackEvent: vi.fn(),
  trackServerEvent: vi.fn(),
}));
import { trackEvent, trackServerEvent } from "../utils/api";

const baseResponse: HyroxAnalysisResponse = {
  submissionId: "11111111-1111-4111-8111-111111111111",
  status: "complete",
  analysisScope: "full",
  reportSentTo: "alex@example.com",
  carouselDataAvailable: false,
  analysisVersion: "hyrox_engine_v1.0.0",
  calculatorMode: "analyse",
  browserSummary: {},
};

function renderResult(response?: HyroxAnalysisResponse) {
  return render(
    <MemoryRouter
      initialEntries={[
        response
          ? { pathname: "/hyrox-calculator/result", state: { response } }
          : { pathname: "/hyrox-calculator/result" },
      ]}
    >
      <ResultPage />
    </MemoryRouter>,
  );
}

describe("ResultPage next-step panel", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  test("tracks race-card preview once per submission per browser session", () => {
    const { unmount } = renderResult(baseResponse);
    unmount();
    renderResult(baseResponse);

    expect(trackServerEvent).toHaveBeenCalledTimes(1);
    expect(trackServerEvent).toHaveBeenCalledWith("race_card_previewed", {
      submissionId: baseResponse.submissionId,
      metadata: { source: "result_page" },
    });
  });

  test("shows Hit a target time CTA when submissionId present and mode is analyse", () => {
    renderResult(baseResponse);

    expect(screen.getByRole("button", { name: /hit a target time using this race/i })).toBeInTheDocument();
  });

  test("primary CTA href contains source=analysis_complete and submissionId", () => {
    renderResult(baseResponse);

    expect(screen.getByRole("link", { name: /hit a target time using this race/i })).toHaveAttribute(
      "href",
      `/hyrox-calculator/race-details?mode=target&source=analysis_complete&submissionId=${baseResponse.submissionId}`,
    );
  });

  test("does not show primary target CTA when calculatorMode is target", () => {
    renderResult({ ...baseResponse, calculatorMode: "target" });

    expect(screen.queryByRole("button", { name: /hit a target time using this race/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyse another race/i })).toBeInTheDocument();
  });

  test("does not show next-step panel when response is absent", () => {
    renderResult();

    expect(screen.queryByText("Your analysis is ready.")).not.toBeInTheDocument();
  });

  test("Analyse another race CTA points to race details without source params", () => {
    renderResult(baseResponse);

    expect(screen.getByRole("link", { name: /analyse another race/i })).toHaveAttribute(
      "href",
      "/hyrox-calculator/race-details",
    );
  });

  test("app download card links to download page with submissionId", () => {
    renderResult(baseResponse);

    expect(screen.getByText(/Get a HYROX training plan/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue in the app/i })).toHaveAttribute(
      "href",
      `/download?submissionId=${baseResponse.submissionId}`,
    );
  });

  test("app download card is hidden when submissionId is absent", () => {
    renderResult({ ...baseResponse, submissionId: "" });

    expect(screen.queryByText(/Get a HYROX training plan/i)).not.toBeInTheDocument();
  });

  test("app download click fires browser and server events", () => {
    renderResult(baseResponse);
    vi.clearAllMocks();

    fireEvent.click(screen.getByRole("link", { name: /continue in the app/i }));

    expect(trackEvent).toHaveBeenCalledWith("post_analysis_app_download_clicked", {
      submissionId: baseResponse.submissionId,
      source: "result_page",
    });
    expect(trackServerEvent).toHaveBeenCalledWith("app_download_clicked", {
      submissionId: baseResponse.submissionId,
      metadata: { touchpoint: "result_page" },
    });
  });

  test("existing next-step card click tracking is unchanged", () => {
    const { unmount } = renderResult(baseResponse);
    vi.clearAllMocks();

    fireEvent.click(screen.getByRole("link", { name: /hit a target time using this race/i }));
    expect(trackEvent).toHaveBeenCalledWith("post_analysis_target_clicked", {
      submissionId: baseResponse.submissionId,
      source: "analysis_complete",
      journeyVariant: "target-post-analysis",
    });

    unmount();
    renderResult(baseResponse);
    vi.clearAllMocks();
    fireEvent.click(screen.getByRole("link", { name: /analyse another race/i }));

    expect(trackEvent).toHaveBeenCalledWith("post_analysis_analyse_another_clicked", {
      submissionId: baseResponse.submissionId,
      source: "analysis_complete",
    });
  });

  test("Back to calculator home link points to home", () => {
    renderResult(baseResponse);

    expect(screen.getByRole("link", { name: /back to calculator home/i })).toHaveAttribute(
      "href",
      "/hyrox-calculator",
    );
  });
});
