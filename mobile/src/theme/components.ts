import { Platform, type ViewStyle } from "react-native";

export const radii = {
  pill: 16,
  card: 20,
} as const;

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
} as const;
