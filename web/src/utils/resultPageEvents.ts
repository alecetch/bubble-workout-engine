const PREVIEWED_KEY_PREFIX = "forma.raceCardPreviewed.";

export function hasTrackedRaceCardPreview(submissionId: string): boolean {
  try {
    return sessionStorage.getItem(`${PREVIEWED_KEY_PREFIX}${submissionId}`) === "1";
  } catch {
    return true;
  }
}

export function markRaceCardPreviewTracked(submissionId: string): void {
  try {
    sessionStorage.setItem(`${PREVIEWED_KEY_PREFIX}${submissionId}`, "1");
  } catch {
    // ignore
  }
}
