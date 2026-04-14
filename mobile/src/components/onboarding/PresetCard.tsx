import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { hapticLight } from "../interaction/haptics";
import { colors } from "../../theme/colors";
import { radii, shadows } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type PresetCardProps = {
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  onHelpPress?: () => void;
};

export function PresetCard({ title, description, selected, onPress, onHelpPress }: PresetCardProps): React.JSX.Element {
  const handlePress = async (): Promise<void> => {
    await hapticLight();
    onPress();
  };

  return (
    <PressableScale
      style={[styles.card, selected && styles.cardSelected]}
      onPress={() => {
        void handlePress();
      }}
    >
      {selected ? <View style={styles.accentBar} /> : null}
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {selected ? (
            <PressableScale style={styles.helpButton} onPress={onHelpPress}>
              <Text style={styles.check}>?</Text>
            </PressableScale>
          ) : null}
        </View>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 84,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    overflow: "hidden",
    ...shadows.card,
  },
  cardSelected: {
    borderColor: colors.accent,
    backgroundColor: "rgba(59,130,246,0.16)",
  },
  accentBar: {
    width: 4,
    backgroundColor: colors.accent,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  check: {
    color: colors.accent,
    ...typography.h3,
  },
  helpButton: {
    minWidth: 28,
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  description: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    ...typography.small,
  },
});
