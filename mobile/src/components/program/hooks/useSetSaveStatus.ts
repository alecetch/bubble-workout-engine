import { useRef, useState, useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import type { SaveSegmentLogPayload, SaveSegmentLogResult } from "../../../api/segmentLog";
import { logger } from "../../../utils/logger";

type Row = SaveSegmentLogPayload["rows"][number];
export type SetSaveStatus = "saving" | "waiting" | "failed";
type Entry = { payload: SaveSegmentLogPayload; row: Row; status: "saving" | "failed"; confirm: boolean };
export const setSaveKey = (row: Row): string => `${row.programExerciseId}:${row.orderIndex - 1}`;

export function useSetSaveStatus({ save, onSaved, getCurrentRow }: {
  save: (payload: SaveSegmentLogPayload) => Promise<SaveSegmentLogResult>;
  onSaved?: (keys: string[]) => void;
  getCurrentRow?: (row: Row) => Row;
}) {
  const entries = useRef<Record<string, Entry>>({});
  const [, refresh] = useState(0);
  const callbacks = useRef({ save, onSaved, getCurrentRow });
  callbacks.current = { save, onSaved, getCurrentRow };
  const online = useSyncExternalStore(
    listener => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => true,
  );
  const isPending = (key: string): boolean => entries.current[key]?.status === "saving";

  async function saveRows(payload: SaveSegmentLogPayload, { confirm = true } = {}): Promise<SaveSegmentLogResult | null> {
    const keys = payload.rows.map(setSaveKey);
    if (keys.some(isPending)) return null;
    for (const row of payload.rows) entries.current[setSaveKey(row)] = { payload, row, status: "saving", confirm };
    refresh(value => value + 1);
    try {
      const result = await callbacks.current.save(payload);
      keys.forEach(key => { delete entries.current[key]; });
      if (confirm) callbacks.current.onSaved?.(keys);
      refresh(value => value + 1);
      return result;
    } catch (error) {
      const subscriptionRequired = error instanceof ApiError && error.status === 402;
      for (const key of keys) {
        if (subscriptionRequired) delete entries.current[key];
        else entries.current[key].status = "failed";
      }
      refresh(value => value + 1);
      logger.api("segment-save-failed", {
        errorType: error instanceof Error ? error.name : typeof error,
        status: error instanceof ApiError ? error.status : undefined,
        rowCount: payload.rows.length,
      });
      throw error;
    }
  }

  async function retryFailed(retryRow?: (key: string) => Promise<void>): Promise<void> {
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
  return { statuses, unsavedCount: Object.keys(statuses).length, isPending, saveRows, retryFailed };
}
