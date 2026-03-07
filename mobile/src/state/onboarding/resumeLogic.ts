import type { OnboardingDraft, OnboardingStep } from "./types";
import { validateAll } from "./validators";

export function getResumeStep(draft: OnboardingDraft): OnboardingStep | "done" {
  const validation = validateAll(draft);

  if (!validation.step1Valid) return 1;
  if (!validation.step2Valid) return 2;
  if (!validation.step3Valid) return 3;

  return "done";
}
