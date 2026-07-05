export interface HyroxSplit {
  index: number;
  segmentKey: string;
  label: string;
  type: "run" | "station";
  timeSeconds: number;
}

export interface HyroxPenalty {
  station: string;
  penaltySeconds: number;
}

export interface HyroxRaceReplaySplit {
  station: string;
  entrySeconds: number | null;
  exitSeconds: number | null;
}

export interface HyroxCalculatorDraft {
  calculatorMode?: "target" | "analyse";
  athlete: {
    name?: string;
    email?: string;
    gender: "male" | "female" | "mixed";
    ageOnRaceDay?: number;
    ageGroup?: string;
  };
  race: {
    raceName?: string;
    raceDate?: string;
    division: "open" | "pro" | "doubles" | "relay";
    finishTimeSeconds: number;
  };
  splits: HyroxSplit[];
  penalties?: HyroxPenalty[];
  raceReplay?: HyroxRaceReplaySplit[];
  roxzoneTimeSeconds?: number;
  athleteContext?: {
    trainingAge?: string;
    primaryBackground?: string;
    weeklyRunningVolume?: string;
    weeklyStrengthSessions?: string;
    targetFinishTimeSeconds?: number;
    additionalContext?: string;
    run5kPbSeconds?: number;
    run10kPbSeconds?: number;
    backSquat3RMKg?: number;
    deadlift3RMKg?: number;
    rowErg2kSeconds?: number;
    skiErg1kSeconds?: number;
    wallBallRepsIn2Min?: number;
    farmerCarry200mSeconds?: number;
    targetRaceDate?: string;
  };
  marketingConsent: boolean;
  meta?: {
    source?: "analysis_email" | "analysis_complete";
    sourceSubmissionId?: string;
    calibrationCompleted?: boolean;
    calibrationSkipped?: boolean;
  };
}

export interface HyroxAnalysisRequest {
  calculatorMode?: "target" | "analyse";
  athlete: {
    name?: string;
    email: string;
    sex: "male" | "female" | "mixed";
    ageOnRaceDay?: number;
    ageGroup?: string;
  };
  race: {
    raceName?: string;
    raceDate?: string;
    division: string;
    finishTimeSeconds: number;
  };
  splits: HyroxSplit[];
  penalties?: HyroxPenalty[];
  raceReplay?: HyroxRaceReplaySplit[];
  athleteContext?: {
    trainingAge?: string;
    primaryBackground?: string;
    weeklyRunningVolume?: string;
    weeklyStrengthSessions?: string;
    targetFinishTimeSeconds?: number;
    additionalContext?: string;
    run5kPbSeconds?: number;
    run10kPbSeconds?: number;
    backSquat3RMKg?: number;
    deadlift3RMKg?: number;
    rowErg2kSeconds?: number;
    skiErg1kSeconds?: number;
    wallBallRepsIn2Min?: number;
    farmerCarry200mSeconds?: number;
    targetRaceDate?: string;
  };
  marketingConsent: boolean;
  website?: string;
}

export interface BrowserSummary {
  heroInsight?: {
    label: string;
    timeGapSeconds?: number;
    timeGapFormatted?: string;
  };
  overallPercentile?: number;
  benchmarkGroupLabel?: string;
  biggestStrength?: {
    label: string;
    percentile?: number;
  };
  timePotential?: {
    projectedGainSeconds?: number;
    projectedGainFormatted?: string;
    newProjectedTimeFormatted?: string;
  };
  dataQualityNote?: string;
  calculatorMode?: "target" | "analyse";
  athleteArchetype?: {
    key: string;
    label: string;
    confidence?: string | null;
  } | null;
  workRunBalance?: {
    runSharePct?: number | null;
    workSharePct?: number | null;
    profileType?: string | null;
  } | null;
}

export interface HyroxAnalysisResponse {
  submissionId: string;
  status: string;
  analysisScope: string;
  reportSentTo: string;
  browserSummary: BrowserSummary;
  carouselDataAvailable: boolean;
  analysisVersion: string;
  calculatorMode?: "target" | "analyse";
}

export interface HyroxSubmissionDraftResponse {
  submissionId: string;
  draft: HyroxCalculatorDraft;
}

export interface SegmentDefinition {
  index: number;
  segmentKey: string;
  label: string;
  type: "run" | "station";
  distance: string;
}

// HYROX Predictor

export type HyroxDivision = "open" | "pro" | "doubles" | "relay";
export type HyroxSex = "male" | "female";
export type HyroxAgeGroup =
  | "18-24" | "25-29" | "30-34" | "35-39" | "40-44"
  | "45-49" | "50-54" | "55-59" | "60-64" | "65-69" | "prefer-not-to-say";

export interface HyroxPredictorDraft {
  athlete: {
    name?: string;
    email?: string;
    sex: HyroxSex;
    ageGroup?: HyroxAgeGroup;
    division: HyroxDivision;
  };
  benchmarks: {
    run5kSeconds?: number;
    run10kSeconds?: number;
    backSquat3RM?: number;
    deadlift3RM?: number;
    rowErg2kSeconds?: number;
    skiErg1kSeconds?: number;
    wallBallRepsIn2Min?: number;
    farmerCarryTimeSeconds?: number;
    sledPushNote?: string;
    previousHyroxSeconds?: number;
  };
  context: {
    trainingFrequency?: "2-3" | "4-5" | "6+";
    primaryBackground?: "endurance" | "strength" | "crossfit" | "general";
    weeklyRunningKm?: "<15" | "15-30" | "30-45" | "45+";
  };
  race: {
    raceDate?: string;
    targetFinishTimeSeconds?: number;
  };
  marketingConsent: boolean;
}

export interface HyroxPredictionRequest {
  athlete: {
    name?: string;
    email: string;
    sex: HyroxSex;
    ageGroup?: HyroxAgeGroup;
    division: HyroxDivision;
  };
  benchmarks: HyroxPredictorDraft["benchmarks"];
  context: HyroxPredictorDraft["context"];
  race: HyroxPredictorDraft["race"];
  marketingConsent: boolean;
  website?: string;
}

export interface PredictedSegment {
  segmentKey: string;
  label: string;
  type: "run" | "station";
  predictedSeconds: number;
  predictedFormatted: string;
  limiterScore: number;
  opportunityGainSeconds?: number;
}

export interface HyroxPredictionResponse {
  predictionId: string;
  predictedFinishSeconds: number;
  predictedFinishFormatted: string;
  rangeLowSeconds: number;
  rangeLowFormatted: string;
  rangeHighSeconds: number;
  rangeHighFormatted: string;
  confidenceScore: number;
  confidenceLabel: "low" | "moderate" | "good" | "high";
  predictionMode: "minimum" | "better" | "best";
  segments: PredictedSegment[];
  topLimiters: PredictedSegment[];
  topOpportunities: PredictedSegment[];
  targetComparison?: {
    targetSeconds: number;
    targetFormatted: string;
    gapSeconds: number;
    gapFormatted: string;
  };
  keyAssumptions: string[];
  predictionVersion: string;
}
