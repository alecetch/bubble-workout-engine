import React, { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { PressableScale } from "../interaction/PressableScale";
import { hapticLight } from "../interaction/haptics";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type PillProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
};

const DURATION_MS = 180;

export function Pill({ label, selected, onPress, disabled = false }: PillProps): React.JSX.Element {
  const selectedProgress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selectedProgress.value = withTiming(selected ? 1 : 0, {
      duration: DURATION_MS,
      easing: Easing.out(Easing.ease),
    });
  }, [selected, selectedProgress]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(selectedProgress.value, [0, 1], [colors.surface, "rgba(59,130,246,0.28)"]),
    borderColor: interpolateColor(selectedProgress.value, [0, 1], [colors.border, colors.accent]),
  }));

  const textAnimatedStyle = useAnimatedStyle(() => ({
    color: interpolateColor(selectedProgress.value, [0, 1], [colors.textSecondary, colors.textPrimary]),
  }));

  const handlePress = async (): Promise<void> => {
    if (disabled) return;
    await hapticLight();
    onPress();
  };

  return (
    <PressableScale
      style={[styles.pill, animatedStyle, disabled && styles.disabled]}
      onPress={() => {
        void handlePress();
      }}
      disabled={disabled}
    >
      <Animated.Text style={[styles.label, textAnimatedStyle]}>{label}</Animated.Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 46,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  label: {
    ...typography.body,
    fontWeight: "500",
  },
  disabled: {
    opacity: 0.5,
  },
});
