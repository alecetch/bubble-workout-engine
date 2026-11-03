import React, { useRef, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLogOutsideSession } from "../../api/hooks/trainingSessionHooks";
import { OUTSIDE_ACTIVITIES, type OutsideActivity } from "../../api/trainingSessions";
import { deviceTimeZone, toLocalIsoDate } from "../../utils/localDate";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

// Mounted only while open so every new log starts with fresh defaults.
export function LogOutsideSessionSheet({ onClose }: { onClose: () => void }): React.JSX.Element {
  const mutation = useLogOutsideSession();
  const [activity, setActivity] = useState<OutsideActivity>();
  const [duration, setDuration] = useState(45);
  const [yesterday, setYesterday] = useState(false);
  const [error, setError] = useState<string>();
  const [count, setCount] = useState<number>();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (submitting.current) return;
    if (!activity) { setError("Choose an activity first."); return; }
    submitting.current = true;
    setBusy(true);
    setError(undefined);
    const date = new Date();
    if (yesterday) date.setDate(date.getDate() - 1);
    try {
      const result = await mutation.mutateAsync({ activity_type: activity, duration_min: duration,
        local_date: toLocalIsoDate(date), timezone: deviceTimeZone() });
      setCount(result.year_progress.count);
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't log your session. Try again."); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <Modal visible transparent animationType="slide" onRequestClose={busy ? undefined : onClose}>
    <View style={styles.overlay}>
      <ScrollView style={styles.sheet} contentContainerStyle={styles.content} accessibilityViewIsModal>
        <Text style={styles.title}>Log outside session</Text>
        {count !== undefined ? <>
          <Text style={styles.title} accessibilityLiveRegion="polite">Day {count} is in.</Text>
          <PressableScale style={styles.button} onPress={onClose}><Text style={styles.label}>Done</Text></PressableScale>
        </> : <>
          <Text style={styles.body}>What did you do?</Text>
          <View style={styles.chips}>
            {OUTSIDE_ACTIVITIES.map(item => <PressableScale key={item.value}
              accessibilityState={{ selected: activity === item.value }} disabled={busy}
              style={[styles.chip, activity === item.value && styles.selected]} onPress={() => { setActivity(item.value); setError(undefined); }}>
              <Text style={styles.label}>{item.label}</Text>
            </PressableScale>)}
          </View>
          <Text style={styles.body}>Duration: {duration} minutes</Text>
          <View style={styles.chips}>
            <PressableScale style={styles.chip} accessibilityLabel="Decrease duration" disabled={busy || duration <= 20} onPress={() => setDuration(value => Math.max(20, value - 5))}><Text style={styles.label}>-5</Text></PressableScale>
            <PressableScale style={styles.chip} accessibilityLabel="Increase duration" disabled={busy || duration >= 300} onPress={() => setDuration(value => Math.min(300, value + 5))}><Text style={styles.label}>+5</Text></PressableScale>
          </View>
          <View style={styles.chips}>{[false, true].map(value => <PressableScale key={String(value)} style={[styles.chip, yesterday === value && styles.selected]}
            accessibilityState={{ selected: yesterday === value }} disabled={busy} onPress={() => setYesterday(value)}>
            <Text style={styles.label}>{value ? "Yesterday" : "Today"}</Text>
          </PressableScale>)}</View>
          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          <PressableScale style={styles.button} disabled={busy} onPress={() => void submit()}><Text style={styles.label}>{busy ? "Logging..." : "Log it"}</Text></PressableScale>
          <PressableScale style={styles.chip} disabled={busy} onPress={onClose}><Text style={styles.label}>Cancel</Text></PressableScale>
        </>}
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { maxHeight: "90%", backgroundColor: colors.surface, borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  title: { ...typography.h2, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { minHeight: 48, padding: spacing.md, borderRadius: radii.pill, borderColor: colors.border, borderWidth: 1, justifyContent: "center" },
  selected: { borderColor: colors.accent, backgroundColor: colors.background },
  button: { minHeight: 48, padding: spacing.md, backgroundColor: colors.accent, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  label: { ...typography.body, color: colors.textPrimary },
  error: { ...typography.body, color: colors.error },
});
