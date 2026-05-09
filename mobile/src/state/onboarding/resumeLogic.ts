import type { OnboardingDraft, OnboardingStep } from "./types";
import { validateAll } from "./validators.js";

function isNonBeginner(draft: OnboardingDraft): boolean {
  const level = String(draft.fitnessLevel ?? "").toLowerCase();
  return level === "intermediate" || level === "advanced" || level === "elite";
}

export function getResumeStep(draft: OnboardingDraft): OnboardingStep | "done" {
  const validation = validateAll(draft);

  if (!validation.step1Valid) return 1;
  if (!validation.step2Valid) return 2;
  if (isNonBeginner(draft) && !draft.anchorLiftsSkipped && draft.anchorLifts.length === 0) return "2b";
  if (!validation.step3Valid) return 3;

  return "done";
}
