import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useIsOffline } from "../../lib/network";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export function OfflineBanner(): React.JSX.Element | null {
  const isOffline = useIsOffline();
  if (!isOffline) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>
        No internet connection — changes will save once you're back online
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.warning,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: "center",
  },
  text: {
    ...typography.small,
    color: colors.card,
    fontWeight: "600",
  },
});
