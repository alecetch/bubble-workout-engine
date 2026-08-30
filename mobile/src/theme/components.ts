import { Platform, type ViewStyle } from "react-native";
import { colors } from "./colors";

export const radii = {
  pill: 16,
  card: 20,
} as const;

export type SoftBadgeSemantic = "success" | "warning" | "info";

export const softBadgePalette: Record<SoftBadgeSemantic, { bg: string; text: string; border: string }> = {
  success: { bg: "#052e16", text: colors.success, border: "#16a34a" },
  warning: { bg: "#451a03", text: colors.warning, border: "#d97706" },
  info: { bg: "#0c1a4a", text: colors.accent, border: colors.accent },
};

export const shadows = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  } as ViewStyle,
  button: {
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  } as ViewStyle,
} as const;

export const componentStyles = {
  screenContainer: {
    flex: 1,
  } as ViewStyle,
  cardContainer: {
    borderRadius: radii.card,
    overflow: Platform.OS === "android" ? "hidden" : "visible",
  } as ViewStyle,
  celebrationPrompt: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: colors.card,
    ...shadows.card,
  } as ViewStyle,
} as const;
