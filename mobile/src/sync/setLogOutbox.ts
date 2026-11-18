import { getPersistentStorage, isPersistentStorageAvailable } from "../utils/persistentStorage";
import { logger } from "../utils/logger";
import type { SaveSegmentLogPayload } from "../api/segmentLog";

export type OutboxEntry = {
  key: string;
  programId: string;
  programDayId: string;
  workoutSegmentId: string;
  row: SaveSegmentLogPayload["rows"][number];
  localDate: string;
  timeZone: string;
  enqueuedAt: number;
  updatedAt: number;
  attempts: number;
  lastError?: { status?: number; type: string };
};
let available = true;
let lastRevision = 0;
export function nextRevision() {
  lastRevision = Math.max(Date.now(), lastRevision + 1);
  return lastRevision;
}
const chains = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<() => void>>();
const clearListeners = new Set<(userId: string) => void>();
export const outboxKey = (day: string, segment: string, row: OutboxEntry["row"]) =>
  `${day}:${segment}:${row.programExerciseId}:${row.orderIndex}`;
export const isOutboxAvailable = () => available && isPersistentStorageAvailable();
function failed() {
  if (!available) return;
  available = false;
  logger.api("set-outbox-storage-failed", {});
  listeners.forEach(set => set.forEach(listener => listener()));
}
export function subscribe(userId: string, listener: () => void) {
  const set = listeners.get(userId) ?? new Set();
  listeners.set(userId, set); set.add(listener);
  return () => { set.delete(listener); };
}
export function onClear(listener: (userId: string) => void) {
  clearListeners.add(listener); return () => { clearListeners.delete(listener); };
}
function operation<T>(userId: string, fallback: T, mutate?: (data: Record<string, OutboxEntry>) => T): Promise<T> {
  const task = (chains.get(userId) ?? Promise.resolve()).then(async () => {
    try {
      if (!isOutboxAvailable()) { failed(); return fallback; }
      const storage = getPersistentStorage();
      const key = `set-log-outbox:v1:${userId}`;
      const raw = await storage.getItem(key);
      const data: Record<string, OutboxEntry> = raw ? JSON.parse(raw) : {};
      if (!data || Array.isArray(data) || typeof data !== "object") throw new Error("Invalid outbox");
      if (!mutate) return Object.values(data) as T;
      const result = mutate(data);
      await storage.setItem(key, JSON.stringify(data));
      listeners.get(userId)?.forEach(listener => listener());
      return result;
    } catch { failed(); return fallback; }
  });
  chains.set(userId, task);
  return task;
}
export const list = (userId: string) => operation<OutboxEntry[]>(userId, []);
export async function listForSegment(userId: string, day: string, segment: string) {
  return (await list(userId)).filter(e => e.programDayId === day && e.workoutSegmentId === segment);
}
export async function listForDay(userId: string, day: string) {
  return (await list(userId)).filter(e => e.programDayId === day);
}
export function enqueue(userId: string, entries: OutboxEntry[]) {
  return operation<OutboxEntry[]>(userId, [], data => {
    for (const entry of entries) {
      const old = data[entry.key];
      if (old && old.updatedAt > entry.updatedAt) continue;
      data[entry.key] = { ...entry, enqueuedAt: old?.enqueuedAt ?? entry.enqueuedAt,
        updatedAt: Math.max(entry.updatedAt, (old?.updatedAt ?? -1) + 1), attempts: 0, lastError: undefined };
    }
    return entries.map(entry => data[entry.key]);
  });
}
export function remove(userId: string, keys: string[], options?: { ifUpdatedAt: Record<string, number> }) {
  return operation(userId, undefined, data => {
    for (const key of keys) if (!options || data[key]?.updatedAt === options.ifUpdatedAt[key]) delete data[key];
  });
}
export function markAttempt(userId: string, keys: string[], error: OutboxEntry["lastError"]) {
  return operation(userId, undefined, data => {
    for (const key of keys) if (data[key]) { data[key].attempts++; data[key].lastError = error; }
  });
}
export function pruneExpired(userId: string, now = Date.now()) {
  return operation(userId, undefined, data => {
    const expired = Object.values(data).filter(e => now - e.enqueuedAt > 14 * 86400000);
    expired.forEach(e => { delete data[e.key]; });
    if (expired.length) logger.api("set-outbox-expired", { count: expired.length });
  });
}
export function clear(userId: string): Promise<void> {
  clearListeners.forEach(listener => listener(userId));
  // Deletion must still be attempted after a previous write/read failure.
  const task = (chains.get(userId) ?? Promise.resolve()).then(async () => {
    try {
      await getPersistentStorage().removeItem(`set-log-outbox:v1:${userId}`);
      listeners.get(userId)?.forEach(listener => listener());
    } catch { failed(); }
  });
  chains.set(userId, task); return task;
}
export function _resetForTest() { available = true; lastRevision = 0; chains.clear(); listeners.clear(); }
