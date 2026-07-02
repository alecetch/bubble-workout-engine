import type { HyroxCalculatorDraft } from "../types";

export type JourneyVariant = "target-email" | "target-post-analysis" | "target-direct" | "analyse";

export function getJourneyVariant(draft: HyroxCalculatorDraft | null | undefined): JourneyVariant {
  if (draft?.meta?.source === "analysis_email") return "target-email";
  if (draft?.meta?.source === "analysis_complete") return "target-post-analysis";
  if (draft?.calculatorMode === "target") return "target-direct";
  return "analyse";
}

export function isRestoredTargetBranch(variant: JourneyVariant): boolean {
  return variant === "target-email" || variant === "target-post-analysis";
}
