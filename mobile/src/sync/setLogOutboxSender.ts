import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { ApiError, NetworkTimeoutError } from "../api/client";
import { saveSegmentExerciseLogs } from "../api/segmentLog";
import { queryKeys } from "../api/hooks/shared";
import { toLocalIsoDate } from "../utils/localDate";
import { logger } from "../utils/logger";
import * as outbox from "./setLogOutbox";

type Session = { userId: string | null; isAuthenticated: boolean };
let config: { queryClient: Pick<QueryClient, "invalidateQueries">; getSession: () => Session } | undefined;
type State = { running?: Promise<void>; again: boolean; timer?: ReturnType<typeof setTimeout>; backoff: number; stopped: boolean };
const states = new Map<string, State>();
const sends = new Map<string, Promise<unknown>>();
const savedListeners = new Map<string, Set<(entries: outbox.OutboxEntry[]) => void>>();
export function subscribeToSaved(userId: string, listener: (entries: outbox.OutboxEntry[]) => void) {
  const set = savedListeners.get(userId) ?? new Set(); savedListeners.set(userId, set); set.add(listener);
  return () => { set.delete(listener); };
}
const listeners = new Set<() => void>();
export function subscribeToFlush(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export const isFlushing = (userId?: string) => Boolean(userId && states.get(userId)?.running);
const notify = () => listeners.forEach(listener => listener());
// Both first sends and background sends share this queue. A later edit cannot be
// posted before an older request finishes, even when reconnect triggers both paths.
export function serializeSetSend<T>(userId: string, send: () => Promise<T>): Promise<T> {
  const task = (sends.get(userId) ?? Promise.resolve()).catch(() => {}).then(send);
  sends.set(userId, task); return task;
}
export function initOutboxSender(options: NonNullable<typeof config>) { config = options; }
function allowed(userId: string, state: State) {
  const session = config?.getSession();
  return !state.stopped && onlineManager.isOnline() && session?.isAuthenticated && session.userId === userId;
}
export function stopOutboxSender(userId: string) {
  const state = states.get(userId);
  if (state) { clearTimeout(state.timer); state.timer = undefined; state.stopped = true; state.again = false; }
}
outbox.onClear(stopOutboxSender);
async function run(userId: string, state: State) {
  if (!allowed(userId, state)) return;
  const entries = await outbox.list(userId);
  const groups = new Map<string, outbox.OutboxEntry[]>();
  entries.sort((a, b) => a.enqueuedAt - b.enqueuedAt).forEach(entry => {
    const key = JSON.stringify([entry.programId, entry.programDayId, entry.workoutSegmentId, entry.localDate, entry.timeZone]);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  });
  let transient = false;
  for (const original of groups.values()) {
    if (!allowed(userId, state)) break;
    await serializeSetSend(userId, async () => {
      if (!allowed(userId, state)) return;
      // A foreground edit may have superseded this snapshot while we waited.
      const current = await outbox.list(userId);
      const group = original.filter(e => current.some(c => c.key === e.key && c.updatedAt === e.updatedAt));
      if (!group.length || !allowed(userId, state)) return;
      const first = group[0];
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const date = [toLocalIsoDate(), toLocalIsoDate(yesterday)].includes(first.localDate) ? first.localDate : null;
      const payload = { userId, programId: first.programId, programDayId: first.programDayId,
        workoutSegmentId: first.workoutSegmentId, rows: group.map(e => e.row), timeZone: first.timeZone, localDate: date };
      const keys = group.map(e => e.key);
      const options = { ifUpdatedAt: Object.fromEntries(group.map(e => [e.key, e.updatedAt])) };
      try {
        try { await saveSegmentExerciseLogs(payload); }
        catch (error) {
          if (!(error instanceof ApiError && error.status === 400) || !allowed(userId, state)) throw error;
          await saveSegmentExerciseLogs({ ...payload, localDate: null });
        }
        await outbox.remove(userId, keys, options);
        savedListeners.get(userId)?.forEach(listener => listener(group));
        if (allowed(userId, state)) for (const queryKey of [queryKeys.yearProgress, queryKeys.historyOverview,
          queryKeys.segmentExerciseLogs(first.workoutSegmentId, first.programDayId)]) {
          void config?.queryClient.invalidateQueries({ queryKey });
        }
      } catch (error) {
        const status = error instanceof ApiError ? error.status : undefined;
        const reason = status === 402 ? "subscription" : status === 404 ? "not_found" : status === 400 ? "invalid" : undefined;
        if (reason) {
          await outbox.remove(userId, keys, options);
          logger.api("set-outbox-dropped", { reason, count: keys.length });
        } else {
          await outbox.markAttempt(userId, keys, { status, type: error instanceof Error ? error.name : "unknown" });
          transient ||= error instanceof TypeError || error instanceof NetworkTimeoutError || status === 429 || (status !== undefined && status >= 500);
        }
      }
    });
  }
  if (transient && allowed(userId, state) && !state.again) {
    const delay = [2000, 10000, 30000, 120000][Math.min(state.backoff++, 3)];
    state.timer = setTimeout(() => { state.timer = undefined; void start(userId, false); }, delay);
  }
}
function start(userId: string, external: boolean): Promise<void> {
  let state = states.get(userId);
  if (!state) { state = { again: false, backoff: 0, stopped: false }; states.set(userId, state); }
  if (external) { clearTimeout(state.timer); state.timer = undefined; state.backoff = 0; state.stopped = false; }
  if (state.running) { state.again = true; return state.running; }
  const active = state;
  active.running = (async () => {
    do { active.again = false; await run(userId, active); } while (active.again && !active.stopped);
  })().finally(() => { active.running = undefined; notify(); });
  notify();
  return active.running;
}
export const flush = (userId: string) => start(userId, true);
export function _resetForTest() {
  states.forEach((_s, userId) => stopOutboxSender(userId)); states.clear(); sends.clear(); config = undefined;
}
