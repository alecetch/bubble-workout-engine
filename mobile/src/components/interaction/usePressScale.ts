import { useCallback, useEffect, useMemo, useState } from "react";
import { Easing } from "react-native-reanimated";
import { interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { ViewStyle } from "react-native";
import { shouldReduceMotion } from "../../utils/reduceMotion";

type UsePressScaleOptions = {
  disabled?: boolean;
  pressedScale?: number;
};

type UsePressScaleResult = {
  animatedStyle: ReturnType<typeof useAnimatedStyle>;
  onPressIn: () => void;
  onPressOut: () => void;
  reduceMotionEnabled: boolean;
};

const TIMING_DURATION_MS = 180;

export function usePressScale(options: UsePressScaleOptions = {}): UsePressScaleResult {
  const { disabled = false, pressedScale = 0.97 } = options;

  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const pressed = useSharedValue(0);

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

  const animateTo = useCallback(
    (value: number) => {
      if (disabled) {
        pressed.value = 0;
        return;
      }

      if (reduceMotionEnabled) {
        pressed.value = 0;
        return;
      }

      pressed.value = withTiming(value, {
        duration: TIMING_DURATION_MS,
        easing: Easing.out(Easing.ease),
      });
    },
    [disabled, reduceMotionEnabled, pressed],
  );

  const onPressIn = useCallback(() => {
    if (disabled) return;
    animateTo(1);
  }, [animateTo, disabled]);

  const onPressOut = useCallback(() => {
    if (reduceMotionEnabled) {
      pressed.value = 0;
      return;
    }
    animateTo(0);
  }, [animateTo, pressed, reduceMotionEnabled]);

  const animatedStyle = useAnimatedStyle(() => {
    if (reduceMotionEnabled) {
      const style: ViewStyle = {
        transform: [{ scale: 1 }],
      };
      return style;
    }

    const scale = interpolate(pressed.value, [0, 1], [1, pressedScale]);
    const shadowOpacity = interpolate(pressed.value, [0, 1], [0.22, 0.14]);
    const shadowRadius = interpolate(pressed.value, [0, 1], [10, 6]);
    const shadowOffsetHeight = interpolate(pressed.value, [0, 1], [6, 3]);
    const elevation = interpolate(pressed.value, [0, 1], [6, 3]);

    const style: ViewStyle = {
      transform: [{ scale }],
      shadowOpacity,
      shadowRadius,
      shadowOffset: { width: 0, height: shadowOffsetHeight },
      elevation,
    };

    return style;
  }, [pressedScale, reduceMotionEnabled]);

  return useMemo(
    () => ({
      animatedStyle,
      onPressIn,
      onPressOut,
      reduceMotionEnabled,
    }),
    [animatedStyle, onPressIn, onPressOut, reduceMotionEnabled],
  );
}
