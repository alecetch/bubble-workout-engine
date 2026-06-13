const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export interface RunningPerformance {
  distance: string;
  timeSeconds: number;
  approxDate?: string;
  recency: string;
}

export interface RunningAnalysisRequest {
  athlete: {
    name?: string;
    email: string;
    age: number;
    gender: "male" | "female";
    heightCm?: number;
    weightKg?: number;
  };
  trainingProfile: {
    backgrounds: string[];
    yearsTraining?: string;
    weeklyRunningVolume?: string;
    runsPerWeek?: string;
    strengthSessionsPerWeek?: string;
    hybridSessionsPerWeek?: string;
    primaryGoals: string[];
    currentConcern?: string;
  };
  performances: RunningPerformance[];
  context: {
    typicalTerrain?: string;
    injuryLimitations?: string;
    bodyCompositionGoal?: string;
    runningLimiter?: string;
    mainCompetitionGoal?: string;
    target5kSeconds?: number;
    target10kSeconds?: number;
    targetHyroxSeconds?: number;
    additionalContext?: string;
  };
  marketingConsent: boolean;
}

export interface RunningLimiter {
  rank: number;
  title: string;
  impact: string;
  why: string;
}

export interface RunningRecommendation {
  rank: number;
  title: string;
  impact: string;
  why: string;
  example: string;
}

export interface RunningAnalysisResult {
  overallPerformanceScore: number;
  runningCapacityScore: number;
  strengthPowerScore: number | null;
  enduranceDurabilityScore: number | null;
  runningEconomyScore: number | null;
  balanceScore: number;
  keyInsight: string;
  limiters: RunningLimiter[];
  performanceTranslation: {
    projectedHyroxSeconds: number | null;
    projectedHyroxLabel: string | null;
    runningCapacityForGoal: string | null;
    note: string;
    performanceNotes: string | null;
  };
  tradeOffOutlook: string;
  recommendations: RunningRecommendation[];
}

export interface RunningAnalysisResponse {
  submissionId: string;
  confidence: "high" | "medium" | "low";
  analysis: RunningAnalysisResult;
  emailSent: boolean;
  warning?: string;
}

export async function submitRunningAnalysis(
  payload: RunningAnalysisRequest,
): Promise<RunningAnalysisResponse> {
  const url = `${BASE_URL}/api/running/analyse`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const body = await res.json();
      message = body.message ?? body.errors?.[0]?.message ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<RunningAnalysisResponse>;
}
