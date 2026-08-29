import React, { useEffect, useState } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { shouldReduceMotion } from "../../utils/reduceMotion";

type SkeletonBlockProps = {
  width?: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
  testID?: string;
};

const SHIMMER_DURATION_MS = 900;
const SHIMMER_MIN_OPACITY = 0.55;
const SHIMMER_MAX_OPACITY = 1;

export function SkeletonBlock({
  width = "100%",
  height,
  borderRadius = radii.card,
  style,
  testID,
}: SkeletonBlockProps): React.JSX.Element {
  const opacity = useSharedValue(SHIMMER_MAX_OPACITY);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    shouldReduceMotion()
      .then((enabled) => {
        if (isMounted) setReduceMotionEnabled(enabled);
      })
      .catch(() => {
        if (isMounted) setReduceMotionEnabled(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotionEnabled === null) {
      return;
    }
    if (reduceMotionEnabled) {
      opacity.value = SHIMMER_MAX_OPACITY;
      return;
    }
    opacity.value = withRepeat(
      withTiming(SHIMMER_MIN_OPACITY, { duration: SHIMMER_DURATION_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity, reduceMotionEnabled]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      testID={testID}
      style={[styles.block, { width, height, borderRadius }, animatedStyle, style]}
    />
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.surface,
  },
});
