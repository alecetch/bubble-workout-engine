import type { OutboxEntry } from "./setLogOutbox";
export function entry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return { key: "d:s:e:1", programId: "p", programDayId: "d", workoutSegmentId: "s",
    row: { programExerciseId: "e", orderIndex: 1, weightKg: 50, repsCompleted: 8, rirActual: 2 },
    localDate: "2026-11-18", timeZone: "Europe/London", enqueuedAt: 1, updatedAt: 1, attempts: 0, ...overrides };
}
