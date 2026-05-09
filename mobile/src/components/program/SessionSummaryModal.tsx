import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { hapticMedium } from "../interaction/haptics";
import { PRShareCard } from "../sharing/PRShareCard";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { captureAndShare } from "../../utils/shareCard";
import { streakCopy } from "../../utils/streakCopy";

type SessionSummaryModalProps = {
  visible: boolean;
  totalVolumeKg: number;
  totalSets: number;
  exerciseCount: number;
  prHits: string[];
  prE1rmKg?: number | null;
  streakDays: number;
  adaptedExercises?: Array<{ name: string; displayChip: string }>;
  onDismiss: () => void;
};

export function SessionSummaryModal({
  visible,
  totalVolumeKg,
  totalSets,
  exerciseCount,
  prHits,
  prE1rmKg,
  streakDays,
  adaptedExercises = [],
  onDismiss,
}: SessionSummaryModalProps): React.JSX.Element {
  const prCardRef = useRef<View>(null);
  const [isSharing, setIsSharing] = useState(false);
  const roundedVolume = Math.round(totalVolumeKg);
  const volumeDisplay =
    roundedVolume >= 1000
      ? `${(roundedVolume / 1000).toFixed(1)}t`
      : `${roundedVolume.toLocaleString()} kg`;

  useEffect(() => {
    if (visible && prHits.length > 0) {
      void hapticMedium();
    }
  }, [prHits.length, visible]);

  async function handleSharePR(): Promise<void> {
    if (isSharing) return;
    setIsSharing(true);
    try {
      await captureAndShare(prCardRef);
    } finally {
      setIsSharing(false);
    }
  }

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
              <>
                <View style={styles.prBanner}>
                  <Text style={styles.prEmoji}>PR</Text>
                  <Text style={styles.prText} numberOfLines={2}>
                    {prHits.length === 1
                      ? `New PR on ${prHits[0]}!`
                      : `New PRs on ${prHits.slice(0, 2).join(" & ")}!`}
                  </Text>
                </View>
                <PressableScale
                  style={styles.shareButton}
                  onPress={() => void handleSharePR()}
                  disabled={isSharing}
                >
                  <Text style={styles.shareButtonLabel}>
                    {isSharing ? "Preparing..." : "Share this PR"}
                  </Text>
                </PressableScale>
              </>
            ) : null}

            {adaptedExercises.length > 0 ? (
              <View style={styles.adaptSection}>
                <Text style={styles.adaptSectionTitle}>Adapted this session</Text>
                {adaptedExercises.map((item, index) => (
                  <View key={index} style={styles.adaptRow}>
                    <Text style={styles.adaptExName}>{item.name}</Text>
                    <Text style={styles.adaptSep}>{" — "}</Text>
                    <Text style={styles.adaptChipLabel}>{item.displayChip}</Text>
                  </View>
                ))}
              </View>
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
        {prHits.length > 0 && (prE1rmKg ?? 0) > 0 ? (
          <PRShareCard
            exerciseName={prHits[0] ?? ""}
            e1rmKg={prE1rmKg ?? 0}
            dateLabel={new Date().toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
            cardRef={prCardRef}
          />
        ) : null}
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
  shareButton: {
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  shareButtonLabel: {
    color: colors.accent,
    ...typography.body,
    fontWeight: "600",
  },
  adaptSection: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  adaptSectionTitle: {
    color: colors.textPrimary,
    ...typography.label,
    fontWeight: "700",
    textTransform: "uppercase",
    opacity: 0.65,
  },
  adaptRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  adaptExName: {
    color: colors.textSecondary,
    ...typography.small,
    lineHeight: 18,
  },
  adaptSep: {
    color: colors.textSecondary,
    ...typography.small,
  },
  adaptChipLabel: {
    color: colors.success,
    ...typography.small,
    fontWeight: "600",
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
