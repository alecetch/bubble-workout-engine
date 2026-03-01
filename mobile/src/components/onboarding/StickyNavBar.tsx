import React, { useContext } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const hasTabBar = typeof tabBarHeight === "number" && tabBarHeight > 0;
  const bottomPadding = hasTabBar ? 0 : Math.max(insets.bottom, spacing.sm);
  const backBlocked = isSaving;
  const nextBlocked = nextDisabled || isSaving;

  const handleNext = async (): Promise<void> => {
    if (nextBlocked) return;
    await hapticMedium();
    onNext();
  };

  return (
    <View style={[styles.wrapper, { paddingBottom: bottomPadding }]}>
      <View style={styles.row}>
        <View style={styles.buttonSlot}>
          <PressableScale
            style={[styles.backButton, backBlocked && styles.backButtonDisabled]}
            onPress={onBack}
            disabled={backBlocked}
          >
            <Text style={styles.backText}>Back</Text>
          </PressableScale>
        </View>

        <View style={styles.buttonSlot}>
          <PressableScale
            style={[styles.nextButton, nextBlocked && styles.nextButtonDisabled]}
            onPress={() => {
              void handleNext();
            }}
            disabled={nextBlocked}
          >
            <View style={styles.nextInner}>
              {isSaving ? <ActivityIndicator size="small" color={colors.textPrimary} /> : null}
              <Text style={styles.nextText}>{isSaving ? "Saving..." : nextLabel}</Text>
            </View>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  row: {
    width: "100%",
    minWidth: 0,
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  buttonSlot: {
    flex: 1,
    minWidth: 0,
  },
  backButton: {
    width: "100%",
    minHeight: 58,
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
    width: "100%",
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  backButtonDisabled: {
    opacity: 0.55,
  },
  nextButton: {
    width: "100%",
    minHeight: 58,
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
    justifyContent: "center",
    width: "100%",
    minWidth: 0,
    gap: spacing.sm,
  },
  nextText: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
    flexShrink: 1,
  },
});
