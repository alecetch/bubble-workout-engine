import type { HyroxCalculatorDraft } from "../types";

const DRAFT_KEY = "forma.hyroxCalculatorDraft";

export function loadDraft(): HyroxCalculatorDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HyroxCalculatorDraft;
  } catch {
    return null;
  }
}

export function saveDraft(draft: Partial<HyroxCalculatorDraft>): void {
  try {
    const existing = loadDraft() ?? {};
    const merged = { ...existing, ...draft };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(merged));
  } catch {
    // storage unavailable — best-effort
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}
