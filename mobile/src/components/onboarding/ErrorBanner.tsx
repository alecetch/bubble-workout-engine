import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type ErrorBannerProps = { visible: boolean };

export function ErrorBanner({ visible }: ErrorBannerProps): React.JSX.Element {
  if (!visible) return <View style={styles.hiddenSpacer} />;
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Please fix the highlighted fields</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
    overflow: "hidden",
    backgroundColor: "rgba(250,204,21,0.14)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warning,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  text: {
    color: colors.warning,
    ...typography.small,
    fontWeight: "500",
  },
  hiddenSpacer: {
    height: 0,
  },
});
