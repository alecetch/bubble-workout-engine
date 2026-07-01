import type { HyroxCalculatorDraft } from "../types";

export type JourneyVariant = "target-email" | "target-direct" | "analyse";

export function getJourneyVariant(draft: HyroxCalculatorDraft | null | undefined): JourneyVariant {
  if (draft?.meta?.source === "analysis_email") return "target-email";
  if (draft?.calculatorMode === "target") return "target-direct";
  return "analyse";
}
