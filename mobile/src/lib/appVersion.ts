import * as Application from "expo-application";
import Constants from "expo-constants";
import { Platform } from "react-native";

export type AppVersionInfo = { platform: "ios" | "android" | "other"; version: string | null; build: number | null };
const raw = Application.nativeBuildVersion;
const parsed = typeof raw === "string" && /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null;
const info: AppVersionInfo = {
  platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "other",
  version: Application.nativeApplicationVersion,
  build: Constants.executionEnvironment === "storeClient" || (typeof __DEV__ !== "undefined" && __DEV__) ? null : parsed,
};
export function getAppVersionInfo(): AppVersionInfo { return info; }
