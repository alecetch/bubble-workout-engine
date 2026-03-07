import { useCallback, useMemo, useRef } from "react";
import { Animated } from "react-native";
import { colors } from "../../theme/colors";

type UseErrorPulseResult = {
  pulse: () => void;
  animatedStyle: {
    borderWidth: Animated.AnimatedInterpolation<number>;
    borderColor: Animated.AnimatedInterpolation<string>;
    shadowColor: string;
    shadowOpacity: Animated.AnimatedInterpolation<number>;
    shadowRadius: Animated.AnimatedInterpolation<number>;
    shadowOffset: { width: number; height: number };
    elevation: Animated.AnimatedInterpolation<number>;
    borderRadius: number;
  };
};

export function useErrorPulse(durationMs = 600): UseErrorPulseResult {
  const value = useRef(new Animated.Value(0)).current;

  const pulse = useCallback(() => {
    value.stopAnimation();
    value.setValue(0);
    Animated.sequence([
      Animated.timing(value, {
        toValue: 1,
        duration: Math.floor(durationMs / 2),
        useNativeDriver: false,
      }),
      Animated.timing(value, {
        toValue: 0,
        duration: Math.ceil(durationMs / 2),
        useNativeDriver: false,
      }),
    ]).start();
  }, [durationMs, value]);

  const animatedStyle = useMemo(
    () => ({
      borderWidth: value.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 2],
      }),
      borderColor: value.interpolate({
        inputRange: [0, 1],
        outputRange: ["rgba(59,130,246,0)", colors.focus],
      }),
      shadowColor: colors.focus,
      shadowOpacity: value.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.35],
      }),
      shadowRadius: value.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 10],
      }),
      shadowOffset: { width: 0, height: 0 },
      elevation: value.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 5],
      }),
      borderRadius: 22,
    }),
    [value],
  );

  return { pulse, animatedStyle };
}
