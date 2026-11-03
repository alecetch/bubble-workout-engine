import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { claimYearMilestone, markYearMilestoneSeen, type MilestoneMoment } from "../api/yearProgress";

export function useMilestoneCelebration(candidate: MilestoneMoment | undefined, userId: string | undefined, onSeen: () => void) {
  const [moment, setMoment] = useState<MilestoneMoment | null>(null);
  const [focused, setFocused] = useState(true);
  const [settledKey, setSettledKey] = useState("");
  const [isDismissing, setIsDismissing] = useState(false);
  const [error, setError] = useState<string>();
  const claimedIds = useRef<string[]>([]);
  const attempts = useRef(new Set<string>());
  const mounted = useRef(true);
  const dismissing = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const year = candidate?.year;
  const target = candidate?.target;
  const count = candidate?.count;
  const key = candidate && userId ? `${userId}:${candidate.year}:${candidate.id}` : "";

  useFocusEffect(useCallback(() => {
    setFocused(true);
    if (key && year && target !== undefined && !attempts.current.has(key)) {
      attempts.current.add(key);
      setSettledKey("");
      void claimYearMilestone(year).then(result => {
        if (!mounted.current) return;
        if (result.milestone) {
          claimedIds.current = [result.milestone.id, ...result.coalesced_ids];
          setMoment({ ...result.milestone, target, count: Math.max(count ?? 0, result.milestone.threshold) });
        }
      }).catch(() => { attempts.current.delete(key); }).finally(() => { if (mounted.current) setSettledKey(key); });
    }
    return () => { setFocused(false); };
  }, [key, year, target, count]));

  const dismiss = useCallback(async () => {
    if (!moment || dismissing.current) return;
    dismissing.current = true;
    setIsDismissing(true);
    setError(undefined);
    try {
      await Promise.all(claimedIds.current.map(id => markYearMilestoneSeen(id)));
      setMoment(null);
      onSeen();
    } catch { setError("Couldn't save this celebration. Try again."); }
    finally { dismissing.current = false; if (mounted.current) setIsDismissing(false); }
  }, [moment, onSeen]);

  return { moment: focused ? moment : null, isPending: Boolean(key && key !== settledKey),
    isBlocking: Boolean(moment || (key && key !== settledKey)), isDismissing, error, dismiss };
}
