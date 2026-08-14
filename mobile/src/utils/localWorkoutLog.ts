import {
  _resetForTest as resetPersistentStorageForTest,
  getPersistentStorage,
  type StorageLike,
} from "./persistentStorage";

type SegmentLogPayload = {
  rounds?: number;
  load?: number;
  notes?: string;
  exerciseSetCounts?: Record<string, number>;
};

export type SegmentLogEntry = SegmentLogPayload & {
  updatedAt: string;
};

export type DayStatus = "scheduled" | "started" | "complete";

export function _resetForTest(): void {
  resetPersistentStorageForTest();
}

function getStorage(): StorageLike {
  return getPersistentStorage();
}

function segmentLogKey(programDayId: string, segmentId: string): string {
  return `workout:segment-log:${programDayId}:${segmentId}`;
}

function workoutCompleteKey(programDayId: string): string {
  return `workout:complete:${programDayId}`;
}

function workoutDayStartedKey(programDayId: string): string {
  return `workout:day-started:${programDayId}`;
}

function workoutDayCompleteKey(programDayId: string): string {
  return `workout:day-complete:${programDayId}`;
}

function exerciseCompleteKey(programDayId: string, programExerciseId: string): string {
  return `workout:exercise-complete:${programDayId}:${programExerciseId}`;
}

export async function getSegmentLog(
  programDayId: string,
  segmentId: string,
): Promise<SegmentLogEntry | null> {
  const storage = getStorage();
  const raw = await storage.getItem(segmentLogKey(programDayId, segmentId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SegmentLogEntry;
    if (!parsed?.updatedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setSegmentLog(
  programDayId: string,
  segmentId: string,
  payload: SegmentLogPayload,
): Promise<SegmentLogEntry> {
  const storage = getStorage();
  const entry: SegmentLogEntry = {
    rounds: payload.rounds,
    load: payload.load,
    notes: payload.notes,
    updatedAt: new Date().toISOString(),
  };
  await Promise.all([
    storage.setItem(segmentLogKey(programDayId, segmentId), JSON.stringify(entry)),
    storage.setItem(workoutDayStartedKey(programDayId), "1"),
  ]);
  return entry;
}

export async function getWorkoutComplete(programDayId: string): Promise<boolean> {
  const storage = getStorage();
  const raw = await storage.getItem(workoutCompleteKey(programDayId));
  return raw === "1";
}

export async function setWorkoutComplete(programDayId: string, value: boolean): Promise<void> {
  const storage = getStorage();
  await Promise.all([
    storage.setItem(workoutCompleteKey(programDayId), value ? "1" : "0"),
    storage.setItem(workoutDayCompleteKey(programDayId), value ? "1" : "0"),
    value ? storage.setItem(workoutDayStartedKey(programDayId), "1") : Promise.resolve(),
  ]);
}

export async function getExerciseComplete(
  programDayId: string,
  programExerciseId: string,
): Promise<boolean> {
  const storage = getStorage();
  const raw = await storage.getItem(exerciseCompleteKey(programDayId, programExerciseId));
  return raw === "1";
}

export async function setExerciseComplete(
  programDayId: string,
  programExerciseId: string,
  value: boolean,
): Promise<void> {
  const storage = getStorage();
  await Promise.all([
    storage.setItem(exerciseCompleteKey(programDayId, programExerciseId), value ? "1" : "0"),
    value ? storage.setItem(workoutDayStartedKey(programDayId), "1") : Promise.resolve(),
  ]);
}

export async function allExercisesComplete(
  programDayId: string,
  programExerciseIds: string[],
): Promise<boolean> {
  const complete = await Promise.all(
    programExerciseIds.map((programExerciseId) => getExerciseComplete(programDayId, programExerciseId)),
  );
  return complete.every(Boolean);
}

export async function hasAnySegmentLog(
  programDayId: string,
  segmentIds: string[],
): Promise<boolean> {
  if (segmentIds.length === 0) return false;
  const logs = await Promise.all(segmentIds.map((segmentId) => getSegmentLog(programDayId, segmentId)));
  return logs.some(Boolean);
}

export async function getDayStarted(programDayId: string): Promise<boolean> {
  const storage = getStorage();
  const marker = await storage.getItem(workoutDayStartedKey(programDayId));
  return marker === "1";
}

export async function getDayComplete(programDayId: string): Promise<boolean> {
  const storage = getStorage();
  const [complete, marker] = await Promise.all([
    storage.getItem(workoutCompleteKey(programDayId)),
    storage.getItem(workoutDayCompleteKey(programDayId)),
  ]);
  return complete === "1" || marker === "1";
}

export async function getDayStatus(
  programDayId: string,
  segmentIds: string[],
): Promise<DayStatus> {
  if (await getDayComplete(programDayId)) return "complete";
  if (await getDayStarted(programDayId)) return "started";
  if (await hasAnySegmentLog(programDayId, segmentIds)) return "started";
  return "scheduled";
}
