import type { AppEntryRoute, AppInitialTab } from "./sessionStore";

type OnboardingStatus = {
  onboardingCompletedAt?: string | null;
  onboardingStepCompleted?: number | null;
};

export function isOnboardingComplete(profile: OnboardingStatus): boolean {
  return Boolean(profile.onboardingCompletedAt) || Number(profile.onboardingStepCompleted ?? 0) >= 3;
}

export function entryFor(profile: OnboardingStatus): { entryRoute: AppEntryRoute; initialTab: AppInitialTab } {
  return isOnboardingComplete(profile)
    ? { entryRoute: "ProgramReview", initialTab: "TodayTab" }
    : { entryRoute: "OnboardingEntry", initialTab: "HomeTab" };
}
