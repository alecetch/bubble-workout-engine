import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";

type SkeletonBlockProps = {
  width?: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function SkeletonBlock({
  width = "100%",
  height,
  borderRadius = radii.card,
  style,
}: SkeletonBlockProps): React.JSX.Element {
  return (
    <View style={[styles.block, { width, height, borderRadius }, style]} />
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.surface,
  },
});
