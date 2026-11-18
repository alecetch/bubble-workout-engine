import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as outbox from "../../../sync/setLogOutbox";
import { flush, serializeSetSend, isFlushing, subscribeToFlush, subscribeToSaved } from "../../../sync/setLogOutboxSender";
import { useSetLogOutbox } from "../../../sync/useSetLogOutboxSync";
import { localTrainingFields } from "../../../utils/localDate";
import { onlineManager } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import type { SaveSegmentLogPayload, SaveSegmentLogResult } from "../../../api/segmentLog";
import { logger } from "../../../utils/logger";

type Row = SaveSegmentLogPayload["rows"][number];
export type SetSaveStatus = "saving" | "waiting" | "failed";
type Entry = { payload: SaveSegmentLogPayload; row: Row; status: "saving" | "failed"; confirm: boolean };
export const setSaveKey = (row: Row): string => `${row.programExerciseId}:${row.orderIndex - 1}`;

export function useSetSaveStatus({ save, onSaved, getCurrentRow, userId, programDayId, workoutSegmentId }: {
  userId?: string;
  programDayId?: string;
  workoutSegmentId?: string;
  save: (payload: SaveSegmentLogPayload) => Promise<SaveSegmentLogResult>;
  onSaved?: (keys: string[]) => void;
  getCurrentRow?: (row: Row) => Row;
}) {
  const entries = useRef<Record<string, Entry>>({});
  const persisted = useSetLogOutbox(userId, programDayId, workoutSegmentId);
  const previousKeys = useRef<string[]>([]);
  const [, refresh] = useState(0);
  const callbacks = useRef({ save, onSaved, getCurrentRow });
  callbacks.current = { save, onSaved, getCurrentRow };
  useEffect(() => userId ? subscribeToSaved(userId, saved => {
    const keys = saved.filter(e => e.programDayId === programDayId && e.workoutSegmentId === workoutSegmentId)
      .map(e => setSaveKey(e.row));
    if (keys.length) callbacks.current.onSaved?.(keys);
  }) : undefined, [userId, programDayId, workoutSegmentId]);
  useEffect(() => {
    if (!persisted.loaded || !outbox.isOutboxAvailable()) return;
    const keys = persisted.entries.map(e => setSaveKey(e.row));
    let changed = false;
    for (const key of previousKeys.current) if (!keys.includes(key) && entries.current[key]) { delete entries.current[key]; changed = true; }
    previousKeys.current = keys;
    if (changed) refresh(value => value + 1);
  }, [persisted.entries, persisted.loaded]);
  const online = useSyncExternalStore(
    listener => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => true,
  );
  const flushing = useSyncExternalStore(subscribeToFlush, () => isFlushing(userId), () => false);
  const isPending = (key: string): boolean => entries.current[key]?.status === "saving";

  async function saveRows(payload: SaveSegmentLogPayload, { confirm = true } = {}): Promise<SaveSegmentLogResult | null> {
    const keys = payload.rows.map(setSaveKey);
    if (confirm && keys.some(isPending)) return null;
    for (const row of payload.rows) entries.current[setSaveKey(row)] = { payload, row, status: "saving", confirm };
    const ownedEntries = Object.fromEntries(keys.map(key => [key, entries.current[key]]));
    refresh(value => value + 1);
    const owner = payload.userId ?? userId;
    let queued: outbox.OutboxEntry[] = [];
    try {
      if (owner && outbox.isOutboxAvailable()) {
        const fields = localTrainingFields();
        payload = { ...payload, userId: owner, localDate: payload.localDate ?? fields.local_date, timeZone: payload.timeZone ?? fields.timezone };
        const now = Date.now();
        const revision = outbox.nextRevision();
        queued = await outbox.enqueue(owner, payload.rows.map(row => ({ key: outbox.outboxKey(payload.programDayId, payload.workoutSegmentId, row),
          programId: payload.programId, programDayId: payload.programDayId, workoutSegmentId: payload.workoutSegmentId,
          row, localDate: payload.localDate!, timeZone: payload.timeZone!, enqueuedAt: now, updatedAt: revision, attempts: 0 })));
      }
      const send = async () => {
        if (queued.length && !onlineManager.isOnline()) throw new TypeError("Offline");
        if (owner && queued.length) {
          const current = await outbox.list(owner);
          if (queued.some(e => !current.some(c => c.key === e.key && c.updatedAt === e.updatedAt))) return { saved: 0, prs: [] };
        }
        return callbacks.current.save(queued.length ? { ...payload, rows: queued.map(e => e.row),
          localDate: queued[0].localDate, timeZone: queued[0].timeZone } : payload);
      };
      const result = owner && queued.length ? await serializeSetSend(owner, send) : await send();
      if (owner && queued.length) await outbox.remove(owner, queued.map(e => e.key), {
        ifUpdatedAt: Object.fromEntries(queued.map(e => [e.key, e.updatedAt])),
      });
      keys.forEach(key => { if (entries.current[key] === ownedEntries[key]) delete entries.current[key]; });
      if (confirm) callbacks.current.onSaved?.(keys);
      refresh(value => value + 1);
      return result;
    } catch (error) {
      const subscriptionRequired = error instanceof ApiError && error.status === 402;
      for (const key of keys) {
        if (entries.current[key] !== ownedEntries[key]) continue;
        if (subscriptionRequired) delete entries.current[key];
        else if (entries.current[key]) entries.current[key].status = "failed";
      }
      refresh(value => value + 1);
      logger.api("segment-save-failed", {
        errorType: error instanceof Error ? error.name : typeof error,
        status: error instanceof ApiError ? error.status : undefined,
        rowCount: payload.rows.length,
      });
      throw error;
    } finally {
      if (owner && queued.length) void flush(owner);
    }
  }

  async function retryFailed(retryRow?: (key: string) => Promise<void>): Promise<void> {
    if (userId && outbox.isOutboxAvailable()) { await flush(userId); return; }
    const failed = Object.entries(entries.current).filter(([, entry]) => entry.status === "failed");
    if (retryRow) {
      await Promise.allSettled(failed.map(([key]) => retryRow(key)));
      return;
    }
    // Retain failed payloads in memory; rebuild only rows that are still failed.
    const payloads = new Set(failed.map(([, entry]) => entry.payload));
    await Promise.allSettled([...payloads].map(payload => {
      const rows = failed.filter(([, entry]) => entry.payload === payload)
        .map(([, entry]) => callbacks.current.getCurrentRow?.(entry.row) ?? entry.row);
      const confirm = failed.find(([, entry]) => entry.payload === payload)![1].confirm;
      return saveRows({ ...payload, rows }, { confirm });
    }));
  }

  const statuses: Record<string, SetSaveStatus> = Object.fromEntries(
    Object.entries(entries.current).map(([key, entry]) => [key, entry.status === "saving" && !online ? "waiting" : entry.status]),
  );
  if (outbox.isOutboxAvailable()) for (const entry of persisted.entries) {
    const key = setSaveKey(entry.row);
    statuses[key] = !online ? "waiting" : flushing ? "saving" : entries.current[key]?.status === "failed" || entry.attempts > 0 ? "failed" : "saving";
  }
  return { statuses, unsavedCount: Object.keys(statuses).length, isPending, saveRows, retryFailed };
}
