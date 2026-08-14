import * as hooks from "../../hooks";

vi.mock("../../client", () => ({
  authGetJson: vi.fn(),
  authPatchJson: vi.fn(),
}));

vi.mock("../../clientProfiles", () => ({
  createClientProfile: vi.fn(),
  getClientProfile: vi.fn(),
  updateClientProfile: vi.fn(),
}));

vi.mock("../../equipmentPresets", () => ({
  getEquipmentItemsForPreset: vi.fn(),
}));

vi.mock("../../me", () => ({
  getMe: vi.fn(),
  linkClientProfileToMe: vi.fn(),
}));

vi.mock("../../activePrograms", () => ({
  fetchActivePrograms: vi.fn(),
  fetchCombinedCalendar: vi.fn(),
  fetchSessionsByDate: vi.fn(),
  setPrimaryProgram: vi.fn(),
}));

vi.mock("../../programViewer", () => ({
  getProgramDayFull: vi.fn(),
  getProgramOverview: vi.fn(),
  markProgramDayComplete: vi.fn(),
}));

vi.mock("../../exerciseGuidance", () => ({
  fetchExerciseGuidance: vi.fn(),
}));

vi.mock("../../equipmentRegen", () => ({
  getProgramEquipment: vi.fn(),
  regenerateProgramDays: vi.fn(),
}));

vi.mock("../../programCompletion", () => ({
  completeProgram: vi.fn(),
  getProgramCompletionSummary: vi.fn(),
  getProgramEndCheck: vi.fn(),
}));

vi.mock("../../segmentLog", () => ({
  getSegmentExerciseLogs: vi.fn(),
  saveSegmentExerciseLogs: vi.fn(),
}));

vi.mock("../../programExercise", () => ({
  applyExerciseSwap: vi.fn(),
  getExerciseSwapOptions: vi.fn(),
}));

vi.mock("../../referenceData", () => ({
  getReferenceData: vi.fn(),
}));

vi.mock("../../history", () => ({
  fetchExerciseHistory: vi.fn(),
  getExerciseSummary: vi.fn(),
  getHistoryOverview: vi.fn(),
  getHistoryPersonalRecords: vi.fn(),
  getHistoryPrograms: vi.fn(),
  getHistoryTimeline: vi.fn(),
  getPrsFeed: vi.fn(),
  getSessionHistoryMetrics: vi.fn(),
  searchExercises: vi.fn(),
  searchLoggedExercises: vi.fn(),
}));

vi.mock("../../notifications", () => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));

vi.mock("../../referral", () => ({
  fetchReferralInfo: vi.fn(),
  fetchReferralStats: vi.fn(),
}));

vi.mock("../../entitlement", () => ({
  getEntitlement: vi.fn(),
}));

vi.mock("../../physique", () => ({
  deleteCheckIn: vi.fn(),
  getCheckIns: vi.fn(),
}));

vi.mock("../../physiqueScan", () => ({
  getMilestones: vi.fn(),
  getScans: vi.fn(),
  getScanTrend: vi.fn(),
}));

describe("api/hooks barrel", () => {
  it("re-exports all hooks from every domain module", () => {
    const expectedNames = [
      "useMe",
      "useReferenceData",
      "useSplitRecommendation",
      "useClientProfile",
      "useCreateClientProfile",
      "useLinkClientProfileToUser",
      "useUpdateClientProfile",
      "useEquipmentItems",
      "useProgramOverview",
      "useDayPreview",
      "useProgramDayFull",
      "useProgramEquipment",
      "useExerciseGuidance",
      "useProgramCompletionSummary",
      "useProgramEndCheck",
      "useActivePrograms",
      "useCombinedCalendar",
      "useSessionsByDate",
      "useSetPrimaryProgram",
      "useRegenerateDays",
      "useMarkDayComplete",
      "useCompleteProgram",
      "useExerciseSwapOptions",
      "useApplyExerciseSwap",
      "useSaveSegmentLogs",
      "useSegmentExerciseLogs",
      "useHistoryOverview",
      "useHistoryPrograms",
      "useHistoryTimeline",
      "useHistoryPersonalRecords",
      "useSessionHistoryMetrics",
      "usePrsFeed",
      "useLoggedExercisesSearch",
      "useExerciseSummary",
      "useExerciseSearch",
      "useExerciseHistory",
      "useNotificationPreferences",
      "useUpdateNotificationPreferences",
      "useEntitlement",
      "useReferralInfo",
      "useReferralStats",
      "usePhysiqueCheckIns",
      "useDeleteCheckIn",
      "usePhysiqueScans",
      "usePhysiqueScanTrend",
      "usePhysiqueMilestones",
    ];
    for (const name of expectedNames) {
      expect(typeof (hooks as Record<string, unknown>)[name]).toBe("function");
    }
  });
});
