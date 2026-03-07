import React from "react";
import { StyleSheet, Text, type ViewStyle, View } from "react-native";
import { colors } from "../../theme/colors";
import { radii, shadows } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type SectionCardProps = {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  style?: ViewStyle;
};

export function SectionCard({
  title,
  subtitle,
  children,
  style,
}: SectionCardProps): React.JSX.Element {
  return (
    <View style={[styles.card, style]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.card,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  subtitle: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    ...typography.small,
  },
  body: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
});
