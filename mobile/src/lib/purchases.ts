import Constants from "expo-constants";
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, PURCHASES_ERROR_CODE } from "react-native-purchases";
import type { CustomerInfo, PurchasesOfferings, PurchasesPackage } from "react-native-purchases";
import { reportError } from "./crashReporting";
import { logger } from "../utils/logger";

let purchasesConfigured = false;
let configurationAttempt = 0;

function canUsePurchasesNative(): boolean {
  return Constants.executionEnvironment !== "storeClient";
}

export function getRevenueCatApiKey(platform: string = Platform.OS): string {
  if (platform === "ios") return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? "";
  if (platform === "android") return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? "";
  return "";
}

export function isPurchasesAvailable(): boolean {
  return canUsePurchasesNative() && purchasesConfigured;
}

function reportSdkError(error: unknown, area: string): void {
  reportError(error instanceof Error ? error : new Error("RevenueCat SDK operation failed"), { area });
  logger.boot(area);
}

export function configurePurchases(apiKey: string): void {
  const attempt = ++configurationAttempt;
  purchasesConfigured = false;
  if (!canUsePurchasesNative()) return;
  const prefix = Platform.OS === "ios" ? "appl_" : Platform.OS === "android" ? "goog_" : null;
  if (!prefix) return;
  if (!apiKey.startsWith(prefix)) {
    reportError(new Error("RevenueCat key/platform mismatch"), { area: "purchases.configure_failed" });
    logger.boot("revenuecat key/platform mismatch");
    return;
  }
  const failed = (error: unknown): void => {
    if (attempt === configurationAttempt) purchasesConfigured = false;
    reportSdkError(error, "purchases.configure_failed");
  };
  try {
    // Log-level configuration is async in the installed SDK; consume its rejection too.
    void Promise.resolve(Purchases.setLogLevel(LOG_LEVEL.ERROR)).catch(error =>
      reportSdkError(error, "purchases.log_level_failed"));
    // configure is currently synchronous. Also handle a promise returned by native adapters.
    const result: unknown = Purchases.configure({ apiKey });
    if (result && typeof (result as PromiseLike<void>).then === "function") {
      void Promise.resolve(result).then(() => {
        if (attempt === configurationAttempt) purchasesConfigured = true;
      }, failed);
    } else {
      purchasesConfigured = true;
    }
  } catch (error) {
    failed(error);
  }
}

export function logInPurchases(userId: string): void {
  if (!isPurchasesAvailable() || !userId) return;
  try {
    void Promise.resolve(Purchases.logIn(userId)).catch(error => reportSdkError(error, "purchases.login_failed"));
  } catch (error) {
    reportSdkError(error, "purchases.login_failed");
  }
}

export function logOutPurchases(): void {
  if (!isPurchasesAvailable()) return;
  try {
    void Promise.resolve(Purchases.logOut()).catch(error => reportSdkError(error, "purchases.logout_failed"));
  } catch (error) {
    reportSdkError(error, "purchases.logout_failed");
  }
}

export async function getPurchaseOfferings(): Promise<PurchasesOfferings | null> {
  if (!isPurchasesAvailable()) return null;
  return Purchases.getOfferings();
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<void> {
  if (!isPurchasesAvailable()) throw new Error("Purchases unavailable");
  await Purchases.purchasePackage(pkg);
}

export async function restorePurchases(): Promise<CustomerInfo> {
  if (!isPurchasesAvailable()) throw new Error("Purchases unavailable");
  return Purchases.restorePurchases();
}

export function isPurchaseCancelledError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err
    && err.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR);
}
