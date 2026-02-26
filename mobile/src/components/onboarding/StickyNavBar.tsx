import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { hapticMedium } from "../interaction/haptics";
import { colors } from "../../theme/colors";
import { radii, shadows } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type StickyNavBarProps = {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled: boolean;
  isSaving: boolean;
};

export function StickyNavBar({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  isSaving,
}: StickyNavBarProps): React.JSX.Element {
  const backBlocked = isSaving;
  const nextBlocked = nextDisabled || isSaving;

  const handleNext = async (): Promise<void> => {
    if (nextBlocked) return;
    await hapticMedium();
    onNext();
  };

  return (
    <View style={styles.wrapper}>
      <PressableScale
        style={[styles.backButton, backBlocked && styles.backButtonDisabled]}
        onPress={onBack}
        disabled={backBlocked}
      >
        <Text style={styles.backText}>Back</Text>
      </PressableScale>

      <PressableScale
        style={[styles.nextButton, nextBlocked && styles.nextButtonDisabled]}
        onPress={() => {
          void handleNext();
        }}
        disabled={nextBlocked}
      >
        <View style={styles.nextInner}>
          {isSaving ? <ActivityIndicator size="small" color={colors.textPrimary} /> : null}
          <Text style={styles.nextText}>{isSaving ? "Saving…" : nextLabel}</Text>
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  backButton: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "transparent",
  },
  backText: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "500",
  },
  backButtonDisabled: {
    opacity: 0.55,
  },
  nextButton: {
    flex: 1.4,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    ...shadows.button,
  },
  nextButtonDisabled: {
    opacity: 0.55,
  },
  nextInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  nextText: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
});
