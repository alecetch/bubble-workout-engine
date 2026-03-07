import { AccessibilityInfo } from "react-native";

export async function shouldReduceMotion(): Promise<boolean> {
  try {
    return await AccessibilityInfo.isReduceMotionEnabled();
  } catch {
    return false;
  }
}
