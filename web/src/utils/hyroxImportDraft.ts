import type { HyroxCalculatorDraft, HyroxPenalty, HyroxRaceReplaySplit, HyroxSplit } from "../types";
import type { HyroxParseResult } from "./hyroxResultsParser";
import { findHyroxEventByName } from "../data/hyroxEvents";
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

export function ageGroupFromAge(age: number | null | undefined): string | null {
  if (!Number.isFinite(age)) return null;
  const n = Number(age);
  if (n < 18) return null;
  if (n < 25) return "18-24";
  if (n >= 65) return "65-69";
  const lower = Math.floor(n / 5) * 5;
  const start = Math.max(18, lower);
  const end = start === 18 ? 24 : start + 4;
  return `${start}-${end}`;
}

export function normalizeAgeGroup(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = String(raw).trim().toUpperCase();
  const direct = text.match(/(\d{2})\s*[-–]\s*(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}`;
  const hyroxBand = text.match(/[MF]\s*(\d{2})/);
  if (hyroxBand) {
    const lower = Number(hyroxBand[1]);
    if (lower >= 65) return "65-69";
    return `${lower}-${lower + 4}`;
  }
  return null;
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
  const knownEvent = findHyroxEventByName(result.raceName);
  const importedAgeGroup = normalizeAgeGroup(result.ageGroup) ?? ageGroupFromAge(result.athleteAge);
  const merged = {
    ...existing,
    athlete: {
      ...existing?.athlete,
      ...(normalizedName ? { name: normalizedName } : {}),
      ...(importedAgeGroup ? { ageGroup: importedAgeGroup } : {}),
    },
    race: {
      ...existing?.race,
      ...(result.raceName ? { raceName: result.raceName } : {}),
      ...(knownEvent ? { raceDate: knownEvent.startDate } : {}),
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
