import React from "react";
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";

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
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <View style={style}>{children}</View>
    </Pressable>
  );
}
