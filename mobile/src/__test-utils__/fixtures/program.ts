import type { AdaptationDecision, ProgramDayFullResponse } from "../../api/programViewer";

export type ProgramDay = ProgramDayFullResponse;
export type { AdaptationDecision };

export function buildAdaptationDecision(overrides?: Partial<AdaptationDecision>): AdaptationDecision {
  return {
    outcome: "increase_load",
    primaryLever: "load",
    confidence: "high",
    recommendedLoadKg: 80,
    recommendedLoadDeltaKg: 5,
    recommendedRepsTarget: null,
    recommendedRepDelta: null,
    displayChip: "Load increased ↑",
    displayDetail: "You hit all sets at the top of your rep range.",
    decidedAt: "2026-04-10T18:32:00.000Z",
    ...overrides,
  };
}
export type Segment = ProgramDayFullResponse["segments"][number];
export type Exercise = Segment["exercises"][number];

export function buildExercise(overrides?: Partial<Exercise>): Exercise {
  return {
    id: "ex-1",
    exerciseId: "bb-squat",
    name: "Barbell Squat",
    sets: 3,
    reps: "5-8",
    repsUnit: "reps",
    intensity: null,
    tempo: null,
    restSeconds: 90,
    notes: null,
    equipment: null,
    isLoadable: true,
    guidelineLoad: null,
    progressionRecommendation: null,
    adaptationDecision: null,
    coachingCuesJson: [],
    isNewExercise: false,
    ...overrides,
  };
}

export function buildSegment(
  overrides: Partial<Omit<Segment, "exercises">> = {},
  exercises: Exercise[] = [buildExercise()],
): Segment {
  return {
    id: "seg-1",
    purpose: "main",
    segmentType: "single",
    segmentTypeLabel: null,
    segmentName: "Main Work",
    orderInDay: 1,
    rounds: 1,
    segmentDurationSeconds: null,
    segmentDurationMmss: null,
    notes: null,
    postSegmentRestSec: 0,
    exercises,
    ...overrides,
  };
}

export function buildProgramDay(
  overrides: Partial<Omit<ProgramDay, "segments">> = {},
  segments: Segment[] = [buildSegment()],
): ProgramDay {
  return {
    day: {
      id: "day-1",
      programId: "program-1",
      label: "Lower Body",
      type: "strength",
      sessionDuration: 45,
      equipmentOverridePresetSlug: null,
      equipmentOverrideItemSlugs: [],
      scheduledWeekday: "Mon",
      weekNumber: 1,
    },
    segments,
    ...overrides,
  };
}
