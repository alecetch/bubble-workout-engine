import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BRAND_WORDMARK } from "../../config/brand";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export const HEALTH_NOTICE_TITLE = "Before you start";
export const HEALTH_NOTICE_BODY = `${BRAND_WORDMARK} gives general training guidance. It isn't medical advice and isn't designed for people with a medical condition. If you have a heart, lung or other health condition, are pregnant or have recently given birth, are recovering from an injury or surgery, or aren't sure, check with a doctor or physiotherapist before you start. Stop any exercise that causes pain, dizziness, chest discomfort or unusual breathlessness.`;
export const HEALTH_NOTICE_INJURY_LINE = "We'll avoid exercises that commonly aggravate the areas you've selected, but we can't assess an injury. If it's being treated or still hurts, get it checked first.";

export function HealthNotice({ showInjuryLine = false, testID }: { showInjuryLine?: boolean; testID?: string }): React.JSX.Element {
  const label = [HEALTH_NOTICE_TITLE, HEALTH_NOTICE_BODY, ...(showInjuryLine ? [HEALTH_NOTICE_INJURY_LINE] : [])].join(" ");
  return (
    <View style={styles.card} accessible accessibilityRole="text" accessibilityLabel={label} testID={testID}>
      <View style={styles.heading}>
        <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} accessible={false} />
        <Text style={styles.title}>{HEALTH_NOTICE_TITLE}</Text>
      </View>
      <Text style={styles.body}>{HEALTH_NOTICE_BODY}</Text>
      {showInjuryLine ? <Text style={styles.body} testID="health-notice-injury-line">{HEALTH_NOTICE_INJURY_LINE}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  title: { ...typography.small, color: colors.textPrimary, fontWeight: "600", flexShrink: 1 },
  body: { ...typography.small, color: colors.textSecondary },
});
