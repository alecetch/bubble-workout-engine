import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { useSessionStore } from "../state/session/sessionStore";
import { list, pruneExpired, subscribe, type OutboxEntry } from "./setLogOutbox";
import { flush, initOutboxSender, stopOutboxSender } from "./setLogOutboxSender";

export function useSetLogOutboxSync(isAuthenticated: boolean, userId: string | null, queryClient: QueryClient) {
  useEffect(() => {
    initOutboxSender({ queryClient, getSession: useSessionStore.getState });
    if (!isAuthenticated || !userId) return;
    void pruneExpired(userId).then(() => flush(userId));
    const unsubscribe = onlineManager.subscribe(online => { if (online) void flush(userId); });
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void flush(userId); });
    return () => { unsubscribe(); subscription.remove(); stopOutboxSender(userId); };
  }, [isAuthenticated, userId, queryClient]);
}

const emptyEntries: OutboxEntry[] = [];
export function useSetLogOutbox(userId?: string, day?: string, segment?: string) {
  const [snapshot, setSnapshot] = useState<{ scope: string; entries: OutboxEntry[]; loaded: boolean }>({ scope: "", entries: [], loaded: false });
  const scope = JSON.stringify([userId, day, segment]);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const read = async () => {
      const entries = userId ? await list(userId) : [];
      if (alive) setSnapshot({ scope, entries: entries.filter(e => (!day || e.programDayId === day) && (!segment || e.workoutSegmentId === segment)), loaded: true });
    };
    void read();
    const unsubscribe = userId ? subscribe(userId, () => { void read(); }) : () => {};
    return () => { alive = false; unsubscribe(); };
  }, [userId, day, segment, scope]);
  if (!userId) return { entries: emptyEntries, loaded: true };
  return snapshot.scope === scope ? snapshot : { entries: [], loaded: false };
}
