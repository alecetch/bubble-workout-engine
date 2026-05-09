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

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const inMemoryStore = new Map<string, string>();

export function _resetForTest(): void {
  inMemoryStore.clear();
}

function getStorage(): AsyncStorageLike {
  const requireFn = (globalThis as { require?: (id: string) => unknown }).require;
  if (!requireFn) {
    return {
      getItem: async (key) => inMemoryStore.get(key) ?? null,
      setItem: async (key, value) => {
        inMemoryStore.set(key, value);
      },
    };
  }

  try {
    const loaded = requireFn("@react-native-async-storage/async-storage") as {
      default?: Partial<AsyncStorageLike>;
    };
    if (typeof loaded?.default?.getItem === "function" && typeof loaded.default.setItem === "function") {
      return loaded.default as AsyncStorageLike;
    }
  } catch {
    // Fall through to in-memory store in environments without AsyncStorage installed.
  }

  return {
    getItem: async (key) => inMemoryStore.get(key) ?? null,
    setItem: async (key, value) => {
      inMemoryStore.set(key, value);
    },
  };
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
