export type SegmentPresentationInput = {
  segmentType?: string | null;
  rounds?: number | null;
  notes?: string | null;
  exercises?: unknown[] | null;
};

export type SegmentPresentation = {
  isWarmupOrCooldown: boolean;
  segmentHasExercises: boolean;
  showLogButton: boolean;
  showRoundsIndicator: boolean;
  roundsValue: number;
  notesText: string;
};

export function normalizeSegmentType(segmentType?: string | null): string {
  return String(segmentType ?? "").trim().toLowerCase();
}

export function isWarmupOrCooldownSegment(segmentType?: string | null): boolean {
  const normalized = normalizeSegmentType(segmentType);
  return normalized === "warmup" || normalized === "cooldown";
}

export function coerceRounds(rounds?: number | null): number {
  const parsed = Number(rounds);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

export function getSegmentPresentation(input: SegmentPresentationInput): SegmentPresentation {
  const isWarmupOrCooldown = isWarmupOrCooldownSegment(input.segmentType);
  const exercises = Array.isArray(input.exercises) ? input.exercises : [];
  const segmentHasExercises = exercises.length > 0;
  const roundsValue = coerceRounds(input.rounds);
  const notesText = String(input.notes ?? "").trim() || "No notes provided.";
  const showLogButton = !isWarmupOrCooldown && segmentHasExercises;
  const showRoundsIndicator = !isWarmupOrCooldown && segmentHasExercises && roundsValue > 1;

  return {
    isWarmupOrCooldown,
    segmentHasExercises,
    showLogButton,
    showRoundsIndicator,
    roundsValue,
    notesText,
  };
}

