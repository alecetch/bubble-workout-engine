import { describe, expect, it } from "vitest";
import { entryFor, isOnboardingComplete } from "./onboardingStatus";
describe("onboarding completion and entry", () => {
  it.each([
    [{ onboardingCompletedAt: "2026-11-14", onboardingStepCompleted: 0 }, true],
    [{ onboardingStepCompleted: 3 }, true],
    [{ onboardingStepCompleted: 4 }, true],
    [{ onboardingCompletedAt: null, onboardingStepCompleted: 2 }, false],
    [{ onboardingStepCompleted: null }, false],
    [{}, false],
  ] as const)("uses the existing completion rule for %j", (profile, complete) => {
    expect(isOnboardingComplete(profile)).toBe(complete);
    expect(entryFor(profile)).toEqual(complete
      ? { entryRoute: "ProgramReview", initialTab: "TodayTab" }
      : { entryRoute: "OnboardingEntry", initialTab: "HomeTab" });
  });
});
