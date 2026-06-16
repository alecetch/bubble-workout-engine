import type { HyroxCalculatorDraft, HyroxPenalty, HyroxRaceReplaySplit, HyroxSplit } from "../types";
import type { HyroxParseResult } from "./hyroxResultsParser";
import { loadDraft, saveDraft } from "./storage";

export function normalizeName(raw: string | null): string | null {
  if (!raw) return null;
  function titleCase(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/\S+/g, (word) => word.replace(/(^|[-'])(\w)/g, (_, prefix: string, char: string) => `${prefix}${char.toUpperCase()}`));
  }
  // HYROX exports names as "Last, First" — convert to "First Last"
  if (raw.includes(",")) {
    const [last, first] = raw.split(",").map((s) => s.trim());
    if (first && last) return titleCase(`${first} ${last}`);
    return first || last ? titleCase(first || last) : null;
  }
  return titleCase(raw);
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
  const raceReplay: HyroxRaceReplaySplit[] = (result.raceReplay ?? []).map((item) => ({
    station: item.station,
    entrySeconds: item.entrySeconds,
    exitSeconds: item.exitSeconds,
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
    raceReplay,
    roxzoneTimeSeconds: result.roxzoneSeconds ?? undefined,
  } as HyroxCalculatorDraft;

  saveDraft(merged);
  return merged;
}

export function nextRouteAfterImport(_draft: Partial<HyroxCalculatorDraft>): string {
  return "/hyrox-calculator";
}
