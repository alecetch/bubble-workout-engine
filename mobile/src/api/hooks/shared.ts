import type { ViewerIdentityOptions } from "../programViewer";

export const queryKeys = {
  me: ["me"] as const,
  referenceData: ["referenceData"] as const,
  clientProfile: (profileId: string) => ["clientProfile", profileId] as const,
  equipmentItems: (presetCode: string | null) => ["equipmentItems", presetCode] as const,
  // selectedProgramDayId intentionally excluded - overview is static per program/user.
  // Selection state belongs to the UI layer only, not the cache key.
  programOverview: (programId: string, opts: { userId?: string | null }) =>
    ["programOverview", programId, opts.userId ?? null] as const,
  // Per-day preview: independent cache entry per selected day.
  dayPreview: (programId: string, programDayId: string, opts: { userId?: string | null }) =>
    ["dayPreview", programId, programDayId, opts.userId ?? null] as const,
  programDayFull: (programDayId: string, opts: ViewerIdentityOptions) =>
    ["programDayFull", programDayId, opts.userId ?? null] as const,
  historyOverview: ["historyOverview"] as const,
  historyPrograms: ["historyPrograms"] as const,
  activePrograms: ["activePrograms"] as const,
  combinedCalendar: ["combinedCalendar"] as const,
  historyTimeline: ["historyTimeline"] as const,
  historyPersonalRecords: ["historyPersonalRecords"] as const,
  exerciseSearch: (q: string) => ["exerciseSearch", q] as const,
  exerciseHistory: (exerciseId: string) => ["exerciseHistory", exerciseId] as const,
  segmentExerciseLogs: (workoutSegmentId: string, programDayId: string) =>
    ["segmentExerciseLogs", workoutSegmentId, programDayId] as const,
  exerciseSwapOptions: (programExerciseId: string) =>
    ["exerciseSwapOptions", programExerciseId] as const,
  programCompletionSummary: (programId: string) =>
    ["programCompletionSummary", programId] as const,
  programEndCheck: (programId: string) =>
    ["programEndCheck", programId] as const,
  exerciseGuidance: (exerciseId: string) => ["exerciseGuidance", exerciseId] as const,
  notificationPreferences: ["notificationPreferences"] as const,
  entitlement: ["entitlement"] as const,
  physiqueCheckIns: ["physiqueCheckIns"] as const,
  physiqueScans: ["physiqueScans"] as const,
  physiqueScanTrend: ["physiqueScanTrend"] as const,
  physiqueMilestones: ["physiqueMilestones"] as const,
  programEquipment: (programId: string | null) => ["programEquipment", programId] as const,
  referralInfo: ["referralInfo"] as const,
  referralStats: ["referralStats"] as const,
  splitRecommendation: ["splitRecommendation"] as const,
};

export const HISTORY_STALE_MS = 5 * 60 * 1000;
