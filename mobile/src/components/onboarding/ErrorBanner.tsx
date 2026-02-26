import React, { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type ErrorBannerProps = {
  visible: boolean;
};

const DURATION_MS = 180;

export function ErrorBanner({ visible }: ErrorBannerProps): React.JSX.Element {
  const progress = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: DURATION_MS,
      easing: Easing.out(Easing.ease),
    });
  }, [progress, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    height: interpolate(progress.value, [0, 1], [0, 40]),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [4, 0]) }],
    marginTop: interpolate(progress.value, [0, 1], [0, spacing.sm]),
  }));

  return (
    <Animated.View pointerEvents={visible ? "auto" : "none"} style={[styles.container, animatedStyle]}>
      <Text style={styles.text}>Please fix the highlighted fields</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
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
});
