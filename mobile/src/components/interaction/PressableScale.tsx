import React from "react";
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated from "react-native-reanimated";
import { usePressScale } from "./usePressScale";

type PressableScaleProps = {
  children: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  hitSlop?: PressableProps["hitSlop"];
  accessibilityLabel?: string;
};

// Usage:
// <PressableScale onPress={handleTap}>
//   <YourCard />
// </PressableScale>
export function PressableScale({
  children,
  onPress,
  onLongPress,
  disabled = false,
  style,
  hitSlop,
  accessibilityLabel,
}: PressableScaleProps): React.JSX.Element {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale({
    disabled,
    pressedScale: 0.97,
  });

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => onPressIn()}
      onPressOut={() => onPressOut()}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
