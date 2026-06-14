export interface HyroxSplit {
  index: number;
  segmentKey: string;
  label: string;
  type: "run" | "station";
  timeSeconds: number;
}

export interface HyroxCalculatorDraft {
  athlete: {
    name?: string;
    email: string;
    gender: "male" | "female";
    ageOnRaceDay: number;
  };
  race: {
    raceName?: string;
    raceDate?: string;
    division: "open" | "pro" | "doubles" | "relay";
    finishTimeSeconds: number;
  };
  splits: HyroxSplit[];
  athleteContext?: {
    trainingAge?: string;
    primaryBackground?: string;
    weeklyRunningVolume?: string;
    weeklyStrengthSessions?: string;
    targetFinishTimeSeconds?: number;
    additionalContext?: string;
  };
  marketingConsent: boolean;
}

export interface HyroxAnalysisRequest {
  athlete: {
    name?: string;
    email: string;
    sex: "male" | "female";
    ageOnRaceDay: number;
  };
  race: {
    raceName?: string;
    raceDate?: string;
    division: string;
    finishTimeSeconds: number;
  };
  splits: HyroxSplit[];
  athleteContext?: {
    trainingAge?: string;
    primaryBackground?: string;
    weeklyRunningVolume?: string;
    weeklyStrengthSessions?: string;
    targetFinishTimeSeconds?: number;
    additionalContext?: string;
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
}

export interface HyroxAnalysisResponse {
  submissionId: string;
  status: string;
  analysisScope: string;
  reportSentTo: string;
  browserSummary: BrowserSummary;
  carouselDataAvailable: boolean;
  analysisVersion: string;
}

export interface SegmentDefinition {
  index: number;
  segmentKey: string;
  label: string;
  type: "run" | "station";
  distance: string;
}
