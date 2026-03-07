import React, { useEffect, useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { shouldReduceMotion } from "../../utils/reduceMotion";

type ProgressHeaderProps = {
  step: 1 | 2 | 3;
};

const DURATION_MS = 180;

export function ProgressHeader({ step }: ProgressHeaderProps): React.JSX.Element {
  const [barWidth, setBarWidth] = useState(0);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const progressWidth = useSharedValue(0);

  useEffect(() => {
    let mounted = true;
    shouldReduceMotion()
      .then((value) => {
        if (mounted) setReduceMotionEnabled(value);
      })
      .catch(() => {
        if (mounted) setReduceMotionEnabled(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const target = barWidth * (step / 3);
    if (reduceMotionEnabled) {
      progressWidth.value = target;
      return;
    }

    progressWidth.value = withTiming(target, {
      duration: DURATION_MS,
      easing: Easing.out(Easing.ease),
    });
  }, [barWidth, progressWidth, reduceMotionEnabled, step]);

  const barAnimatedStyle = useAnimatedStyle(() => ({
    width: progressWidth.value,
  }));

  const handleBarLayout = (event: LayoutChangeEvent): void => {
    setBarWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.stepLabel}>{`Step ${step} of 3`}</Text>
      <View style={styles.barTrack} onLayout={handleBarLayout}>
        <Animated.View style={[styles.barFill, barAnimatedStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  stepLabel: {
    color: colors.textSecondary,
    ...typography.small,
  },
  barTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  barFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
});
