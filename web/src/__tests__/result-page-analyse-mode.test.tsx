import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ResultPage } from "../pages/ResultPage";
import type { HyroxAnalysisResponse } from "../types";

const baseResponse: HyroxAnalysisResponse = {
  submissionId: "sub-123",
  status: "complete",
  analysisScope: "full",
  reportSentTo: "alex@example.com",
  carouselDataAvailable: false,
  analysisVersion: "hyrox_engine_v1.0.0",
  browserSummary: {
    heroInsight: { label: "Wall Balls", timeGapFormatted: "5:30" },
    overallPercentile: 60,
    benchmarkGroupLabel: "Open Men 30-34",
    biggestStrength: { label: "Run 6", percentile: 20 },
    timePotential: {
      projectedGainFormatted: "+5:30",
      newProjectedTimeFormatted: "1:26:30",
    },
  },
};

function renderResult(response: HyroxAnalysisResponse) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/hyrox-calculator/result", state: { response } }]}>
      <ResultPage />
    </MemoryRouter>,
  );
}

describe("ResultPage analyse mode", () => {
  test("analyse mode renders archetype card and headline", () => {
    renderResult({
      ...baseResponse,
      calculatorMode: "analyse",
      browserSummary: {
        ...baseResponse.browserSummary,
        athleteArchetype: {
          key: "strong_runner_station_limited",
          label: "Strong runner, station limited",
        },
      },
    });

    expect(screen.getByTestId("result-headline")).toHaveTextContent(
      /Your race profile: Strong runner, station limited/i,
    );
    expect(screen.getByText("Athlete Archetype")).toBeInTheDocument();
    expect(screen.getByText("Strong runner, station limited")).toBeInTheDocument();
  });

  test("analyse mode renders run and station balance card", () => {
    renderResult({
      ...baseResponse,
      calculatorMode: "analyse",
      browserSummary: {
        ...baseResponse.browserSummary,
        workRunBalance: { runSharePct: 55, workSharePct: 35, profileType: "runner_dominant" },
      },
    });

    expect(screen.getByText("Run vs Station")).toBeInTheDocument();
    expect(screen.getByText("Runner dominant")).toBeInTheDocument();
    expect(screen.getByText(/55% running - 35% stations/i)).toBeInTheDocument();
  });

  test("analyse mode does not render Time Potential card", () => {
    renderResult({
      ...baseResponse,
      calculatorMode: "analyse",
      browserSummary: {
        ...baseResponse.browserSummary,
        athleteArchetype: {
          key: "strong_runner_station_limited",
          label: "Strong runner, station limited",
        },
      },
    });

    expect(screen.queryByText("Time Potential")).not.toBeInTheDocument();
  });

  test("target mode renders existing target cards", () => {
    renderResult({ ...baseResponse, calculatorMode: "target" });

    expect(screen.getByText("Biggest Limiter")).toBeInTheDocument();
    expect(screen.getByText("Overall Benchmark")).toBeInTheDocument();
    expect(screen.getByText("Biggest Strength")).toBeInTheDocument();
    expect(screen.getByText("Time Potential")).toBeInTheDocument();
  });

  test("target mode also renders athlete archetype when available", () => {
    renderResult({
      ...baseResponse,
      calculatorMode: "target",
      browserSummary: {
        ...baseResponse.browserSummary,
        athleteArchetype: {
          key: "strong_runner_station_limited",
          label: "Strong runner, station limited",
        },
      },
    });

    expect(screen.getByTestId("result-headline")).toHaveTextContent(/Your biggest limiter: Wall Balls/i);
    expect(screen.getByText("Athlete Archetype")).toBeInTheDocument();
    expect(screen.getByText("Strong runner, station limited")).toBeInTheDocument();
    expect(screen.getByText("Time Potential")).toBeInTheDocument();
  });

  test("missing calculatorMode defaults to target display", () => {
    renderResult(baseResponse);

    expect(screen.getByTestId("result-headline")).toHaveTextContent(/Your biggest limiter: Wall Balls/i);
    expect(screen.getByText("Time Potential")).toBeInTheDocument();
  });
});

