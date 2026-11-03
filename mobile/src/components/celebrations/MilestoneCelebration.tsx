import React, { useEffect, useRef } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import type { MilestoneMoment } from "../../api/yearProgress";
import { shouldReduceMotion } from "../../utils/reduceMotion";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radii } from "../../theme/components";
import { useShareCard } from "../share/useShareCard";

type Props = { milestone: MilestoneMoment | null; onDismiss: () => void; showShare?: boolean; onShare?: () => void; isDismissing?: boolean; error?: string };

export function MilestoneCelebration({ milestone, onDismiss, showShare = true, onShare, isDismissing, error }: Props): React.JSX.Element | null {
  const sharing = useShareCard();
  const scale = useSharedValue(1);
  const played = useRef<string | undefined>(undefined);
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const fullScreen = Boolean(milestone && ["club_200", "club_250", "club_300"].includes(milestone.slug));
  useEffect(() => {
    let active = true;
    if (!milestone || played.current === milestone.id) return;
    played.current = milestone.id;
    scale.value = 1;
    if (milestone) {
      void (async () => { try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* Optional native feedback. */ } })();
      if (fullScreen) void shouldReduceMotion().then(reduced => {
        if (active && !reduced) scale.value = withSequence(withTiming(1.04, { duration: 220 }), withTiming(1, { duration: 300 }));
      });
    }
    return () => { active = false; };
  }, [milestone?.id, fullScreen, scale]);
  if (!milestone) return null;
  const { slug, threshold, year, target } = milestone;
  const title = slug === "club_200" ? `${threshold}. You're in for ${year}.`
    : slug === "club_250" ? "Club 250. Elite consistency."
    : slug === "club_300" ? "Club 300. Almost every day of the year."
    : slug === "club_100" ? "Club 100. The habit is real."
    : threshold === 1 ? "Day 1. The year starts here."
    : threshold === 100 && target === 200 ? "Day 100. Half way to 200."
    : `Day ${threshold}. ${target > threshold ? `${target - threshold} to go for ${target}.` : "Keep building your year."}`;
  const count = milestone.count ?? threshold;
  const busy = isDismissing || sharing.isSharing;
  function share() {
    if (onShare) { onShare(); return; }
    if (slug.startsWith("club_") && slug !== "club_200") {
      void sharing.shareCard({ type: "club", tier: Number(slug.slice(5)), year, count });
    } else {
      void sharing.shareCard({ type: "milestone", year, count: threshold, isTarget: slug === "club_200" });
    }
  }
  return <Modal visible transparent={!fullScreen} animationType="none" onRequestClose={busy ? undefined : onDismiss}>
    <View style={[styles.backdrop, fullScreen && styles.fullScreen]} testID={fullScreen ? "milestone-full-screen" : "milestone-card"}>
      {sharing.shareView}
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View style={[styles.card, fullScreen && styles.fullCard, pulse]} accessibilityViewIsModal>
          <Text style={styles.year}>{year}</Text>
          <Text style={styles.title}>{title}</Text>
          {error ? <Text style={styles.body} accessibilityLiveRegion="polite">{error}</Text> : null}
          {showShare ? <PressableScale style={styles.button} onPress={share} disabled={busy}><Text style={styles.label}>{sharing.isSharing ? "Sharing..." : "Share"}</Text></PressableScale> : null}
          <PressableScale style={styles.button} onPress={onDismiss} disabled={busy}>
            <Text style={styles.label}>{slug === "club_200" ? "Go for Club 250" : "Let's go"}</Text>
          </PressableScale>
        </Animated.View>
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.7)", padding: spacing.lg },
  fullScreen: { backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: "center" },
  card: { backgroundColor: colors.surface, borderRadius: radii.card, padding: spacing.lg, gap: spacing.lg },
  fullCard: { backgroundColor: colors.background },
  year: { ...typography.body, color: colors.textSecondary },
  title: { ...typography.h1, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  button: { minHeight: 48, padding: spacing.md, justifyContent: "center", alignItems: "center", backgroundColor: colors.accent, borderRadius: radii.pill },
  label: { ...typography.body, color: colors.textPrimary },
});
