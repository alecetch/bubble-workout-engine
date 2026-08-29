import React from "react";
import Animated from "react-native-reanimated";
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { usePressScale } from "./usePressScale";

type PressableScaleProps = {
  children: React.ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  hitSlop?: PressableProps["hitSlop"];
  accessibilityLabel?: string;
  testID?: string;
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
  containerStyle,
  hitSlop,
  accessibilityLabel,
  testID,
}: PressableScaleProps): React.JSX.Element {
  const { animatedStyle, onPressIn, onPressOut } = usePressScale({ disabled });

  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={containerStyle}
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
