import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RunningProfilerLandingPage } from "../pages/running/RunningProfilerLandingPage";
import { RunningProfilerFormPage } from "../pages/running/RunningProfilerFormPage";
import { RunningProfilerResultsPage } from "../pages/running/RunningProfilerResultsPage";
import type { RunningAnalysisResponse } from "../utils/runningApi";

const MOCK_RESPONSE: RunningAnalysisResponse = {
  submissionId: "test-uuid",
  confidence: "high",
  emailSent: true,
  analysis: {
    overallPerformanceScore: 65,
    runningCapacityScore: 70,
    strengthPowerScore: 55,
    enduranceDurabilityScore: null,
    runningEconomyScore: null,
    balanceScore: 60,
    keyInsight:
      "Your running capacity is a genuine asset. Prioritise compromised running to transfer it to hybrid performance.",
    limiters: [
      {
        rank: 1,
        title: "Threshold Development",
        impact: "medium",
        why: "Your 5k-to-10k pace ratio suggests limited lactate threshold capacity.",
      },
    ],
    performanceTranslation: {
      projectedHyroxSeconds: 4800,
      projectedHyroxLabel: "1:20:00",
      runningCapacityForGoal: "borderline",
      note: "Projection based on 5k pace.",
      performanceNotes: null,
    },
    tradeOffOutlook:
      "Your training mix is reasonably balanced. Focus on quality sessions.",
    recommendations: [
      {
        rank: 1,
        title: "Threshold Work",
        impact: "high",
        why: "Threshold work is the highest-ROI lever for 5k–10k performance.",
        example: "20–30 min at 10k effort once per week.",
      },
      {
        rank: 2,
        title: "Compromised Running",
        impact: "high",
        why: "Train to run fast after heavy work.",
        example: "Brick sessions after strength workouts.",
      },
      {
        rank: 3,
        title: "Running Economy",
        impact: "medium",
        why: "Strides and drills improve efficiency.",
        example: "6×20s strides twice a week.",
      },
    ],
  },
};

describe("RunningProfilerLandingPage", () => {
  test("landing page renders hero headline and primary CTA", () => {
    render(
      <MemoryRouter initialEntries={["/running-profiler"]}>
        <RunningProfilerLandingPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("landing-headline")).toHaveTextContent(
      /Running is a tool/i,
    );
    expect(screen.getByTestId("start-cta")).toBeInTheDocument();
  });
});

describe("RunningProfilerFormPage", () => {
  test("performance input row renders for 5k, 10k, half marathon, marathon", () => {
    render(
      <MemoryRouter initialEntries={["/running-profiler/profile"]}>
        <RunningProfilerFormPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("perf-row-5k")).toBeInTheDocument();
    expect(screen.getByTestId("perf-row-10k")).toBeInTheDocument();
    expect(screen.getByTestId("perf-row-half_marathon")).toBeInTheDocument();
    expect(screen.getByTestId("perf-row-marathon")).toBeInTheDocument();
  });
});

describe("RunningProfilerResultsPage", () => {
  function renderWithState(response: RunningAnalysisResponse, email?: string) {
    return render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/running-profiler/results",
            state: { response, email },
          },
        ]}
      >
        <RunningProfilerResultsPage />
      </MemoryRouter>,
    );
  }

  test("results dashboard renders key insight and top 3 recommendations", () => {
    renderWithState(MOCK_RESPONSE, "test@example.com");

    expect(screen.getByTestId("key-insight")).toHaveTextContent(
      /running capacity is a genuine asset/i,
    );
    expect(screen.getByTestId("recommendation-1")).toBeInTheDocument();
    expect(screen.getByTestId("recommendation-2")).toBeInTheDocument();
    expect(screen.getByTestId("recommendation-3")).toBeInTheDocument();
  });

  test("email capture panel shown on results page when email not provided", () => {
    renderWithState(MOCK_RESPONSE, undefined);

    expect(screen.getByTestId("email-capture")).toBeInTheDocument();
  });
});
