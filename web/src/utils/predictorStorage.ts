import type { HyroxPredictorDraft } from "../types";

const DRAFT_KEY = "forma.hyroxPredictorDraft";

const EMPTY_DRAFT: HyroxPredictorDraft = {
  athlete: { sex: "male", division: "open" },
  benchmarks: {},
  context: {},
  race: {},
  marketingConsent: false,
};

export function loadPredictorDraft(): HyroxPredictorDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    return { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<HyroxPredictorDraft>) };
  } catch {
    return EMPTY_DRAFT;
  }
}

export function savePredictorDraft(draft: Partial<HyroxPredictorDraft>): void {
  try {
    const existing = loadPredictorDraft();
    const merged = {
      ...existing,
      ...draft,
      athlete: { ...existing.athlete, ...draft.athlete },
      benchmarks: { ...existing.benchmarks, ...draft.benchmarks },
      context: { ...existing.context, ...draft.context },
      race: { ...existing.race, ...draft.race },
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(merged));
  } catch {
    // storage unavailable - best-effort
  }
}

export function clearPredictorDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}
