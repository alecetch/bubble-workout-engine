import React, { useEffect } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { hapticMedium } from "../interaction/haptics";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { streakCopy } from "../../utils/streakCopy";

type SessionSummaryModalProps = {
  visible: boolean;
  totalVolumeKg: number;
  totalSets: number;
  exerciseCount: number;
  prHits: string[];
  streakDays: number;
  onDismiss: () => void;
};

export function SessionSummaryModal({
  visible,
  totalVolumeKg,
  totalSets,
  exerciseCount,
  prHits,
  streakDays,
  onDismiss,
}: SessionSummaryModalProps): React.JSX.Element {
  const roundedVolume = Math.round(totalVolumeKg);
  const volumeDisplay =
    roundedVolume >= 1000
      ? `${(roundedVolume / 1000).toFixed(1)}t`
      : `${roundedVolume.toLocaleString()} kg`;
  const prScale = useSharedValue(0.5);
  const prOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible && prHits.length > 0) {
      prScale.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.back(1.6)) });
      prOpacity.value = withTiming(1, { duration: 300 });
      void hapticMedium();
    } else if (!visible) {
      prScale.value = 0.5;
      prOpacity.value = 0;
    }
  }, [prHits.length, prOpacity, prScale, visible]);

  const animatedPrBannerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: prScale.value }],
    opacity: prOpacity.value,
  }));

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.title}>Session complete</Text>
            <View style={styles.divider} />

            {prHits.length > 0 ? (
              <Animated.View style={[styles.prBanner, animatedPrBannerStyle]}>
                <Text style={styles.prEmoji}>PR</Text>
                <Text style={styles.prText} numberOfLines={2}>
                  {prHits.length === 1
                    ? `New PR on ${prHits[0]}!`
                    : `New PRs on ${prHits.slice(0, 2).join(" & ")}!`}
                </Text>
              </Animated.View>
            ) : null}

            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{volumeDisplay}</Text>
                <Text style={styles.statLabel}>Volume lifted</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{totalSets}</Text>
                <Text style={styles.statLabel}>Sets completed</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{exerciseCount}</Text>
                <Text style={styles.statLabel}>Exercises</Text>
              </View>
            </View>

            <Text style={styles.streakText}>{streakCopy(streakDays)}</Text>

            <PressableScale style={styles.doneButton} onPress={onDismiss}>
              <Text style={styles.doneLabel}>Done</Text>
            </PressableScale>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.72)",
    justifyContent: "center",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h2,
    textAlign: "center",
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  prBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.sm,
  },
  prEmoji: {
    color: colors.accent,
    ...typography.displaySub,
    fontWeight: "700",
  },
  prText: {
    flex: 1,
    color: colors.accent,
    ...typography.body,
    fontWeight: "700",
  },
  statsGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.card,
    borderRadius: radii.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  statValue: {
    color: colors.textPrimary,
    ...typography.display,
    fontWeight: "700",
    textAlign: "center",
  },
  statLabel: {
    color: colors.textSecondary,
    ...typography.small,
    textAlign: "center",
  },
  streakText: {
    color: colors.textSecondary,
    ...typography.small,
    textAlign: "center",
  },
  doneButton: {
    minHeight: 50,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  doneLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
});
