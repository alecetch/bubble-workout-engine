import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";

export function ProgramReviewScreen(): React.JSX.Element {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Program Review</Text>
      <Text style={styles.subtitle}>TODO: Implement program review screen UI.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
  },
});
