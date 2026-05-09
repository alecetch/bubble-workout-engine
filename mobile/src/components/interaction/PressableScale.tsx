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
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={containerStyle}
    >
      <View style={style}>{children}</View>
    </Pressable>
  );
}
