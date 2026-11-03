import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radii } from "../../theme/components";

export const yearMomentStorageKey = (userId: string, year: number, moment: "recap-dismissed" | "reset-seen") => `yearMoment:${userId}:${year}:${moment}`;
type Props = { userId?: string; todayLocal: string; previousCount: number; onOpenRecap: (year: number) => void };
type State = { key: string; recap: boolean; reset: boolean; error?: string };
export function YearMomentCards({ userId, todayLocal, previousCount, onOpenRecap }: Props): React.JSX.Element | null {
  const year = Number(todayLocal.slice(0, 4));
  const key = `${userId}:${todayLocal}`;
  const recapEligible = todayLocal >= `${year}-12-28`;
  const resetEligible = todayLocal >= `${year}-01-01` && todayLocal <= `${year}-01-14` && previousCount > 0;
  const [state, setState] = useState<State>();
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const currentKey = useRef(key); currentKey.current = key;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (userId && (recapEligible || resetEligible)) void (async () => {
      try {
        const [dismissed, seen] = await Promise.all([
          AsyncStorage.getItem(yearMomentStorageKey(userId, year, "recap-dismissed")),
          AsyncStorage.getItem(yearMomentStorageKey(userId, year, "reset-seen")),
        ]);
        if (!active) return;
        const reset = resetEligible && !seen;
        setState({ key, recap: recapEligible && !dismissed, reset });
        // Mark first display, rather than requiring dismissal to suppress the next open.
        if (reset) await AsyncStorage.setItem(yearMomentStorageKey(userId, year, "reset-seen"), "1");
      } catch {
        if (active) setState(previous => ({ key, recap: previous?.key === key && previous.recap || false,
          reset: previous?.key === key && previous.reset || false, error: "Couldn't save your year moment. Try again." }));
      }
    })();
    return () => { active = false; if (mounted.current) setState(undefined); };
  }, [key, userId, year, recapEligible, resetEligible, retry]));

  async function dismiss(moment: "recap-dismissed" | "reset-seen") {
    if (!userId || saving) return;
    setSaving(true);
    try {
      await AsyncStorage.setItem(yearMomentStorageKey(userId, year, moment), "1");
      if (mounted.current && currentKey.current === key) setState(previous => previous ? { ...previous, error: undefined, [moment === "reset-seen" ? "reset" : "recap"]: false } : previous);
    } catch {
      if (mounted.current && currentKey.current === key) setState(previous => previous ? { ...previous, error: "Couldn't save your year moment. Try again." } : previous);
    } finally { if (mounted.current) setSaving(false); }
  }
  if (!userId || state?.key !== key || (!state.recap && !state.reset && !state.error)) return null;
  return <View style={styles.stack}>
    {state.recap ? <View style={styles.card}>
      <PressableScale disabled={saving} onPress={() => onOpenRecap(year)}><Text style={styles.title}>Your {year} recap is ready</Text></PressableScale>
      <PressableScale disabled={saving} accessibilityLabel={`Dismiss ${year} recap banner`} onPress={() => void dismiss("recap-dismissed")}><Text style={styles.action}>Dismiss</Text></PressableScale>
    </View> : null}
    {state.reset ? <View style={styles.card}>
      <Text style={styles.title}>{year} starts now. Last year: {previousCount}. Day 1 is today.</Text>
      <PressableScale disabled={saving} onPress={() => onOpenRecap(year - 1)}><Text style={styles.action}>See your {year - 1} recap</Text></PressableScale>
      <PressableScale disabled={saving} accessibilityLabel={`Dismiss ${year} reset card`} onPress={() => void dismiss("reset-seen")}><Text style={styles.action}>Dismiss</Text></PressableScale>
    </View> : null}
    {state.error ? <View style={styles.card}><Text style={styles.action} accessibilityLiveRegion="polite">{state.error}</Text>
      <PressableScale disabled={saving} onPress={() => setRetry(value => value + 1)}><Text style={styles.action}>Retry year moment</Text></PressableScale>
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  card: { padding: spacing.lg, borderRadius: radii.card, backgroundColor: colors.surface, gap: spacing.md },
  title: { ...typography.h3, color: colors.textPrimary },
  action: { ...typography.body, color: colors.textPrimary, paddingVertical: spacing.sm },
});
