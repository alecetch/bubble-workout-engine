import { ApiError, authGetJson, authenticatedFetch } from "./client";

export type RegionScore = {
  score: number | null;
  descriptor: string | null;
  confidence: "high" | "medium" | "low" | "not_visible";
};

export type BodyComposition = {
  leanness_rating: number;
  muscle_fullness_rating: number;
  symmetry_rating: number;
  dominant_strength: "upper_body" | "lower_body" | "balanced";
  development_stage: "beginner" | "intermediate" | "advanced" | "elite";
};

export type ComparisonData = {
  score_delta: number;
  narrative: string | null;
  region_deltas: Record<string, number>;
  trend: "improving" | "declining" | "stable";
};

export type ScanResult = {
  ok: boolean;
  scan_id: string;
  submitted_at: string;
  physique_score: number;
  score_delta: number | null;
  region_scores: Record<string, RegionScore>;
  body_composition: BodyComposition;
  observations: string[];
  comparison: ComparisonData | null;
  milestones_achieved: string[];
  ai_coaching_narrative: string | null;
  streak: number;
  disclaimer?: string;
};

export type ScanSummary = {
  id: string;
  submitted_at: string;
  physique_score: number;
  score_delta: number | null;
  photo_url: string | null;
  milestones_achieved: string[];
  streak_at_submission: number;
};

export type TrendResponse = {
  ok: boolean;
  trend: Array<{ submitted_at: string; physique_score: number }>;
  region_trends: Record<string, Array<{ submitted_at: string; score: number }>>;
};

export type MilestoneRecord = {
  milestone_slug: string;
  achieved_at: string;
  scan_id: string;
};

export type ScanDetailResponse = {
  ok: boolean;
  scan: {
    id: string;
    submitted_at: string;
    physique_score: number;
    score_delta: number | null;
    photo_url: string | null;
    region_scores: Record<string, RegionScore>;
    body_composition: BodyComposition;
    observations: string[];
    comparison: ComparisonData | null;
    milestones_achieved: string[];
    ai_coaching_narrative: string | null;
    streak: number;
    emphasis_weights: Record<string, number>;
  };
};

function mapPremiumError(error: unknown): never {
  if (
    error instanceof ApiError &&
    error.details &&
    typeof error.details === "object" &&
    (error.details as { code?: string }).code === "premium_required"
  ) {
    throw Object.assign(new Error("premium_required"), { code: "premium_required" as const });
  }
  throw error;
}

export async function submitScan(photoUri: string): Promise<ScanResult> {
  const formData = new FormData();
  formData.append("photo", {
    uri: photoUri,
    name: "photo.jpg",
    type: "image/jpeg",
  } as unknown as Blob);

  try {
    return await authenticatedFetch<ScanResult>("/api/physique/scan", {
      method: "POST",
      body: formData as unknown as Record<string, unknown>,
    });
  } catch (error) {
    return mapPremiumError(error);
  }
}

export async function getScans(limit = 20): Promise<{ ok: boolean; scans: ScanSummary[] }> {
  try {
    return await authGetJson(`/api/physique/scans?limit=${limit}`);
  } catch (error) {
    return mapPremiumError(error);
  }
}

export async function getScanTrend(): Promise<TrendResponse> {
  try {
    return await authGetJson("/api/physique/scans/trend");
  } catch (error) {
    return mapPremiumError(error);
  }
}

export async function getScan(scanId: string): Promise<ScanDetailResponse> {
  try {
    return await authGetJson(`/api/physique/scans/${scanId}`);
  } catch (error) {
    return mapPremiumError(error);
  }
}

export async function getMilestones(): Promise<{ ok: boolean; milestones: MilestoneRecord[] }> {
  try {
    return await authGetJson("/api/physique/milestones");
  } catch (error) {
    return mapPremiumError(error);
  }
}

export async function getComparison(scanAId: string, scanBId: string) {
  try {
    return await authGetJson(`/api/physique/scans/comparison?scan_a_id=${scanAId}&scan_b_id=${scanBId}`);
  } catch (error) {
    return mapPremiumError(error);
  }
}
