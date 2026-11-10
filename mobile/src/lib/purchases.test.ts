import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PurchasesPackage } from "react-native-purchases";

const sdk = vi.hoisted(() => ({
  configure: vi.fn(), setLogLevel: vi.fn(), logIn: vi.fn(), logOut: vi.fn(),
  getOfferings: vi.fn(), purchasePackage: vi.fn(), restorePurchases: vi.fn(),
}));
const runtime = vi.hoisted(() => ({ platform: { OS: "ios" }, constants: { executionEnvironment: "standalone" } }));
const reportError = vi.hoisted(() => vi.fn());
const boot = vi.hoisted(() => vi.fn());
vi.mock("react-native-purchases", () => ({ default: sdk, LOG_LEVEL: { ERROR: "ERROR" }, PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: "1" } }));
vi.mock("react-native", () => ({ Platform: runtime.platform }));
vi.mock("expo-constants", () => ({ default: runtime.constants }));
vi.mock("./crashReporting", () => ({ reportError }));
vi.mock("../utils/logger", () => ({ logger: { boot } }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  runtime.platform.OS = "ios";
  runtime.constants.executionEnvironment = "standalone";
});
afterEach(() => vi.unstubAllEnvs());

describe("RevenueCat SDK boundary", () => {
  it("selects direct per-platform public keys and defaults to the current platform", async () => {
    vi.stubEnv("EXPO_PUBLIC_REVENUECAT_IOS_API_KEY", "appl_test");
    vi.stubEnv("EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY", "goog_test");
    const { getRevenueCatApiKey } = await import("./purchases");
    expect(getRevenueCatApiKey()).toBe("appl_test");
    expect(getRevenueCatApiKey("ios")).toBe("appl_test");
    expect(getRevenueCatApiKey("android")).toBe("goog_test");
    expect(getRevenueCatApiKey("web")).toBe("");
    vi.stubEnv("EXPO_PUBLIC_REVENUECAT_IOS_API_KEY", "");
    expect(getRevenueCatApiKey("ios")).toBe("");
  });

  it.each([["ios", "appl_test"], ["android", "goog_test"]])("configures %s with its matching key", async (platform, key) => {
    runtime.platform.OS = platform;
    const p = await import("./purchases");
    expect(p.isPurchasesAvailable()).toBe(false);
    p.configurePurchases(key);
    expect(sdk.configure).toHaveBeenCalledExactlyOnceWith({ apiKey: key });
    expect(sdk.setLogLevel).toHaveBeenCalledWith("ERROR");
    expect(p.isPurchasesAvailable()).toBe(true);
  });

  it.each([["ios", "goog_wrong"], ["android", "appl_wrong"], ["ios", ""]])("reports mismatched/missing %s keys", async (platform, key) => {
    runtime.platform.OS = platform;
    const p = await import("./purchases");
    p.configurePurchases(key);
    expect(sdk.configure).not.toHaveBeenCalled();
    expect(p.isPurchasesAvailable()).toBe(false);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { area: "purchases.configure_failed" });
    expect(boot).toHaveBeenCalledWith("revenuecat key/platform mismatch");
    expect(JSON.stringify(reportError.mock.calls)).not.toContain(key || "never-a-key");
  });

  it("keeps Expo Go inert without throwing or configuring", async () => {
    runtime.constants.executionEnvironment = "storeClient";
    const p = await import("./purchases");
    expect(() => p.configurePurchases("appl_test")).not.toThrow();
    expect(sdk.configure).not.toHaveBeenCalled();
    expect(p.isPurchasesAvailable()).toBe(false);
  });

  it("reports synchronous configuration errors without interrupting startup", async () => {
    const error = new Error("native unavailable");
    sdk.configure.mockImplementation(() => { throw error; });
    const p = await import("./purchases");
    expect(() => p.configurePurchases("appl_test")).not.toThrow();
    expect(p.isPurchasesAvailable()).toBe(false);
    expect(reportError).toHaveBeenCalledWith(error, { area: "purchases.configure_failed" });
  });

  it("reports rejected configuration and remains unavailable", async () => {
    const error = new Error("native rejected");
    sdk.configure.mockImplementation(() => Promise.reject(error));
    const p = await import("./purchases");
    p.configurePurchases("appl_test");
    expect(p.isPurchasesAvailable()).toBe(false);
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(error, { area: "purchases.configure_failed" }));
    expect(p.isPurchasesAvailable()).toBe(false);
  });

  it("does not let a stale configuration rejection disable a newer success", async () => {
    let reject!: (error: Error) => void;
    sdk.configure.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const p = await import("./purchases");
    p.configurePurchases("appl_old");
    p.configurePurchases("appl_new");
    reject(new Error("old attempt"));
    await vi.waitFor(() => expect(reportError).toHaveBeenCalled());
    expect(p.isPurchasesAvailable()).toBe(true);
  });

  it("only logs in after configuration and reports async identity failures", async () => {
    const p = await import("./purchases");
    p.logInPurchases("user-1");
    expect(sdk.logIn).not.toHaveBeenCalled();
    p.configurePurchases("appl_test");
    sdk.logIn.mockRejectedValue(new Error("login unavailable"));
    p.logInPurchases("user-1");
    expect(sdk.logIn).toHaveBeenCalledWith("user-1");
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(expect.any(Error), { area: "purchases.login_failed" }));
  });

  it("gates offerings, purchases and restore until configured, then delegates to SDK", async () => {
    const p = await import("./purchases");
    const pkg = {} as PurchasesPackage;
    expect(await p.getPurchaseOfferings()).toBeNull();
    await expect(p.purchasePackage(pkg)).rejects.toThrow("Purchases unavailable");
    await expect(p.restorePurchases()).rejects.toThrow("Purchases unavailable");
    p.configurePurchases("appl_test");
    const info = { entitlements: { active: {} } };
    const offerings = { current: null };
    sdk.getOfferings.mockResolvedValue(offerings);
    sdk.restorePurchases.mockResolvedValue(info);
    expect(await p.getPurchaseOfferings()).toBe(offerings);
    expect(await p.restorePurchases()).toBe(info);
    await p.purchasePackage(pkg);
    expect(sdk.purchasePackage).toHaveBeenCalledWith(pkg);
    p.logOutPurchases();
    expect(sdk.logOut).toHaveBeenCalledOnce();
  });

  it("consumes log-level promise rejection", async () => {
    sdk.setLogLevel.mockRejectedValue(new Error("log level unavailable"));
    const p = await import("./purchases");
    p.configurePurchases("appl_test");
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(expect.any(Error), { area: "purchases.log_level_failed" }));
  });

  it("recognizes the SDK cancellation code only", async () => {
    const { isPurchaseCancelledError } = await import("./purchases");
    expect(isPurchaseCancelledError({ code: "1" })).toBe(true);
    for (const error of [undefined, null, new Error("other"), { code: "other" }]) expect(isPurchaseCancelledError(error)).toBe(false);
  });

  it("keeps SDK loading visible to Metro without eval", () => {
    const source = readFileSync(new URL("./purchases.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).toMatch(/import Purchases,.*from "react-native-purchases"/);
  });
});
