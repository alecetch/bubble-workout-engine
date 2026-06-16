import type { HyroxCalculatorDraft, HyroxPenalty, HyroxSplit } from "../types";
import type { HyroxParseResult } from "./hyroxResultsParser";
import { loadDraft, saveDraft } from "./storage";

export function normalizeName(raw: string | null): string | null {
  if (!raw) return null;
  // HYROX exports names as "Last, First" — convert to "First Last"
  if (raw.includes(",")) {
    const [last, first] = raw.split(",").map((s) => s.trim());
    if (first && last) return `${first} ${last}`;
    return first || last || null;
  }
  return raw;
}

export function saveImportedHyroxResult(result: HyroxParseResult): HyroxCalculatorDraft {
  const existing = loadDraft();
  const splits: HyroxSplit[] = result.splits.map((split) => ({
    index: split.index,
    segmentKey: split.segmentKey,
    label: split.label,
    type: split.type,
    timeSeconds: split.timeSeconds,
  }));
  const penalties: HyroxPenalty[] = result.penalties.map((penalty) => ({
    station: penalty.segmentKey,
    penaltySeconds: penalty.penaltySeconds,
  }));

  const normalizedName = normalizeName(result.athleteName);
  const merged = {
    ...existing,
    athlete: {
      ...existing?.athlete,
      ...(normalizedName ? { name: normalizedName } : {}),
      ...(result.ageGroup ? { ageGroup: result.ageGroup } : {}),
    },
    race: {
      ...existing?.race,
      ...(result.raceName ? { raceName: result.raceName } : {}),
      ...(result.division ? { division: result.division } : {}),
      ...(result.finishTimeSeconds ? { finishTimeSeconds: result.finishTimeSeconds } : {}),
    },
    splits,
    penalties,
    roxzoneTimeSeconds: result.roxzoneSeconds ?? undefined,
  } as HyroxCalculatorDraft;

  saveDraft(merged);
  return merged;
}

export function nextRouteAfterImport(_draft: Partial<HyroxCalculatorDraft>): string {
  return "/hyrox-calculator";
}
