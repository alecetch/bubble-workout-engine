import React from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";

function SkeletonBlock({ height, width = "100%" }: { height: number; width?: number | `${number}%` }): React.JSX.Element {
  return <View style={[styles.block, { height, width }]} />;
}

export function SkeletonOnboarding(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <SkeletonBlock height={18} width="35%" />
      <SkeletonBlock height={44} width="72%" />
      <SkeletonBlock height={22} width="92%" />

      <View style={styles.section}>
        <SkeletonBlock height={48} />
        <SkeletonBlock height={48} />
      </View>

      <View style={styles.section}>
        <SkeletonBlock height={90} />
        <SkeletonBlock height={90} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  block: {
    borderRadius: radii.card,
    backgroundColor: "rgba(148,163,184,0.18)",
  },
});
