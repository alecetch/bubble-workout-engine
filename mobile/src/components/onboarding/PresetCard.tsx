import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { hapticLight } from "../interaction/haptics";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type PresetCardProps = {
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
};

export function PresetCard({ title, description, selected, onPress }: PresetCardProps): React.JSX.Element {
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
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, selected && styles.titleSelected]}>{title}</Text>
        </View>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    overflow: "hidden",
    justifyContent: "center",
  },
  cardSelected: {
    borderColor: colors.accent,
    backgroundColor: "rgba(59,130,246,0.28)",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 24,
  },
  title: {
    color: colors.textSecondary,
    ...typography.body,
    fontWeight: "600",
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
    lineHeight: 20,
  },
  titleSelected: {
    color: colors.textPrimary,
  },
  description: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    ...typography.small,
    textAlign: "center",
    includeFontPadding: false,
    lineHeight: 18,
  },
});
