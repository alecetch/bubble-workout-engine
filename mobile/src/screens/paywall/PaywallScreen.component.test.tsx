import { reportError } from "../../lib/crashReporting";
import { BRAND_WORDMARK } from "../../config/brand";
import React from "react";
import { axe } from "jest-axe";
import { Alert, Platform } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerInfo, PurchasesOfferings, PurchasesPackage } from "react-native-purchases";
import { syncEntitlement } from "../../api/entitlement";
import { queryKeys } from "../../api/hooks";
import {
  getPurchaseOfferings,
  isPurchaseCancelledError,
  isPurchasesAvailable,
  purchasePackage,
  restorePurchases,
} from "../../lib/purchases";
import { useSessionStore } from "../../state/session/sessionStore";
import { PaywallScreen } from "./PaywallScreen";
import { mockZustandSelector } from "../../__test-utils__";

vi.mock("@tanstack/react-query", async (importActual) => {
  const actual = await importActual<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: vi.fn(),
  };
});

vi.mock("../../lib/purchases", () => ({
  selectMonthlyPackage: (offerings: PurchasesOfferings | null) => offerings?.current?.monthly ?? offerings?.current?.availablePackages[0] ?? null,
  getPurchaseOfferings: vi.fn(),
  purchasePackage: vi.fn(),
  restorePurchases: vi.fn(),
  isPurchaseCancelledError: vi.fn(),
  isPurchasesAvailable: vi.fn(),
}));

vi.mock("../../lib/crashReporting", () => ({ reportError: vi.fn() }));

vi.mock("../../api/entitlement", () => ({ syncEntitlement: vi.fn() }));

const originalPlatform = Platform.OS;
afterEach(() => { Platform.OS = originalPlatform; });

vi.mock("../../state/session/sessionStore", () => ({
  useSessionStore: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const alertSpy = vi.spyOn(Alert, "alert").mockImplementation(() => {});
const setEntitlementMock = vi.fn();
const invalidateQueriesMock = vi.fn();
const MOCK_PACKAGE = { identifier: "$rc_monthly", product: { priceString: "$9.99" } } as PurchasesPackage;
const MOCK_OFFERINGS = {
  current: { monthly: MOCK_PACKAGE, availablePackages: [{ identifier: "other" }, MOCK_PACKAGE] },
} as PurchasesOfferings;

const getPurchaseOfferingsMock = vi.mocked(getPurchaseOfferings);
const isPurchaseCancelledErrorMock = vi.mocked(isPurchaseCancelledError);
const isPurchasesAvailableMock = vi.mocked(isPurchasesAvailable);
const purchasePackageMock = vi.mocked(purchasePackage);
const restorePurchasesMock = vi.mocked(restorePurchases);
const useSessionStoreMock = vi.mocked(useSessionStore);

function renderScreen() {
  const navigation = { goBack: vi.fn() };

  render(
    <PaywallScreen
      navigation={navigation as any}
      route={{ key: "Paywall", name: "Paywall", params: undefined } as any}
    />,
  );

  return { invalidateQueriesMock, navigation };
}

function getAlertButtons(title: string) {
  const call = alertSpy.mock.calls.find(([alertTitle]) => alertTitle === title);
  return call?.[2] as Array<{ text?: string; onPress?: () => void }> | undefined;
}

describe("PaywallScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    alertSpy.mockClear();
    invalidateQueriesMock.mockReset();

    mockZustandSelector(useSessionStoreMock as any, { setEntitlement: setEntitlementMock });
    vi.mocked(useQueryClient).mockReturnValue({ invalidateQueries: invalidateQueriesMock } as any);
    getPurchaseOfferingsMock.mockResolvedValue(MOCK_OFFERINGS);
    purchasePackageMock.mockResolvedValue({ entitlements: { active: { pro: {} } } } as unknown as CustomerInfo);
    restorePurchasesMock.mockResolvedValue({
      entitlements: { active: { pro: { identifier: "pro", isActive: true } } },
    } as unknown as CustomerInfo);
    vi.mocked(syncEntitlement).mockResolvedValue(null);
    Platform.OS = "ios";
    isPurchaseCancelledErrorMock.mockReturnValue(false);
    isPurchasesAvailableMock.mockReturnValue(true);
  });
  it("loads offerings before a tap and keeps Restore available during loading", async () => {
    let resolve!: (value: PurchasesOfferings | null) => void;
    getPurchaseOfferingsMock.mockReturnValue(new Promise(done => { resolve = done; }));
    renderScreen();
    expect(getPurchaseOfferingsMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restore purchase" })).toBeEnabled();
    expect(screen.queryByText(/per month\./)).not.toBeInTheDocument();
    await act(async () => resolve(MOCK_OFFERINGS));
    expect(screen.getByRole("button", { name: /Subscribe for \$9.99\/month/ })).toBeEnabled();
  });

  it.each(["null", "rejected"])("recovers from %s offerings with Try again", async failure => {
    if (failure === "null") getPurchaseOfferingsMock.mockResolvedValueOnce(null);
    else getPurchaseOfferingsMock.mockRejectedValueOnce(new Error("offline"));
    renderScreen();
    expect(await screen.findByText("Subscriptions are unavailable right now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restore purchase" })).toBeEnabled();
    if (failure === "rejected") expect(reportError).toHaveBeenCalledWith(expect.any(Error), { area: "purchases.offerings_failed" });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Subscribe for $9.99/month")).toBeInTheDocument();
    expect(getPurchaseOfferingsMock).toHaveBeenCalledTimes(2);
  });

  it("shows unavailable without calling offerings when the SDK is unavailable", async () => {
    isPurchasesAvailableMock.mockReturnValue(false);
    renderScreen();
    expect(await screen.findByText("Subscriptions are unavailable right now")).toBeInTheDocument();
    expect(getPurchaseOfferingsMock).not.toHaveBeenCalled();
  });

  it.each(["active", "inactive", "null", "throws"])("reconciles purchase when sync is %s", async result => {
    const server = { is_active: result === "active", subscription_status: result === "active" ? "active" : "expired", trial_expires_at: "2026-12-01" };
    if (result === "throws") vi.mocked(syncEntitlement).mockRejectedValue(new Error("sync offline"));
    else vi.mocked(syncEntitlement).mockResolvedValue(result === "null" ? null : server as any);
    if (result === "active") purchasePackageMock.mockResolvedValue({ entitlements: { active: {} } } as CustomerInfo);
    renderScreen();
    fireEvent.click(await screen.findByText("Subscribe for $9.99/month"));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("You're subscribed", expect.any(String), expect.any(Array)));
    expect(syncEntitlement).toHaveBeenCalledOnce();
    expect(setEntitlementMock).toHaveBeenCalledWith("active", result === "active" ? "2026-12-01" : null);
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.entitlement });
    expect(alertSpy.mock.calls.some(call => call[0] === "Purchase failed")).toBe(false);
    if (result === "inactive") expect(reportError).toHaveBeenCalledWith(expect.any(Error), { area: "purchases.sync_mismatch" });
    if (result === "throws") expect(reportError).toHaveBeenCalledWith(expect.any(Error), { area: "purchases.sync_failed" });
  });

  it.each([1, 3])("shows %i trial days with correct grammar", async days => {
    mockZustandSelector(useSessionStoreMock as any, { setEntitlement: setEntitlementMock, subscriptionStatus: "trialing", trialExpiresAt: new Date(Date.now() + (days - 0.2) * 86_400_000).toISOString() });
    renderScreen();
    expect(screen.getByText(`Keep training with ${BRAND_WORDMARK} Pro`)).toBeInTheDocument();
    expect(screen.getByText(`Your free trial ends in ${days} day${days === 1 ? "" : "s"}. Subscribe now and you won't lose a session.`)).toBeInTheDocument();
    await screen.findByText("Subscribe for $9.99/month");
  });

  it.each(["ios", "android"])("uses %s billing terms and expired copy", async platform => {
    Platform.OS = platform as typeof Platform.OS;
    mockZustandSelector(useSessionStoreMock as any, { setEntitlement: setEntitlementMock, subscriptionStatus: "expired" });
    renderScreen();
    expect(screen.getByText("Your trial has ended")).toBeInTheDocument();
    await screen.findByText("Subscribe for $9.99/month");
    expect(screen.getByText(new RegExp(platform === "android" ? "Google Play account" : "Apple ID"))).toHaveTextContent(platform === "android" ? "Google Play settings" : "App Store settings");
  });

  it("has no accessibility violations in the default render state", async () => {
    renderScreen();
    await act(async () => {});
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });


  it("renders Subscribe and Restore purchase buttons", async () => {
    renderScreen();

    expect(screen.getByText(BRAND_WORDMARK)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bForma\b/);
    expect(document.body.textContent).not.toContain("Formai");
    expect(await screen.findByText("Subscribe for $9.99/month")).toBeInTheDocument();
    expect(screen.getByText(/\$9.99 per month\./)).toBeInTheDocument();
    expect(screen.getByText("Restore purchase")).toBeInTheDocument();
  });

  it("renders pre-purchase legal links", () => {
    renderScreen();

    expect(screen.getByText("Terms of Service")).toBeInTheDocument();
    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
  });

  it("loads offerings on mount and purchases monthly instead of the first available package", async () => {
    renderScreen();
    expect(getPurchaseOfferingsMock).toHaveBeenCalledOnce();

    fireEvent.click(await screen.findByText("Subscribe for $9.99/month"));

    await waitFor(() => expect(purchasePackageMock).toHaveBeenCalledOnce());
    expect(getPurchaseOfferingsMock).toHaveBeenCalledOnce();
    expect(purchasePackageMock).toHaveBeenCalledWith(MOCK_PACKAGE);
  });

  it("successful purchase calls setEntitlement active and does not show a purchase failed Alert", async () => {
    renderScreen();

    fireEvent.click(await screen.findByText("Subscribe for $9.99/month"));

    await waitFor(() => expect(setEntitlementMock).toHaveBeenCalledOnce());
    expect(setEntitlementMock).toHaveBeenCalledWith("active", null);
    expect(alertSpy).not.toHaveBeenCalledWith(
      "Purchase failed",
      expect.any(String),
    );
  });

  it("successful purchase invalidates entitlement and navigates back from confirmation", async () => {
    const { invalidateQueriesMock, navigation } = renderScreen();

    fireEvent.click(await screen.findByText("Subscribe for $9.99/month"));

    await waitFor(() => {
      expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.entitlement });
    });
    expect(alertSpy).toHaveBeenCalledWith(
      "You're subscribed",
      "Welcome back — your training is unlocked.",
      expect.any(Array),
    );

    const buttons = getAlertButtons("You're subscribed");
    buttons?.find((button) => button.text === "Continue")?.onPress?.();
    expect(navigation.goBack).toHaveBeenCalledOnce();
  });

  it("cancelled purchase does not show any Alert", async () => {
    isPurchaseCancelledErrorMock.mockReturnValue(true);
    purchasePackageMock.mockRejectedValue(
      Object.assign(new Error("cancelled"), { code: "PURCHASE_CANCELLED_ERROR" }),
    );

    renderScreen();
    fireEvent.click(await screen.findByText("Subscribe for $9.99/month"));

    await waitFor(() => expect(isPurchaseCancelledErrorMock).toHaveBeenCalled());
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("failed purchase shows Purchase failed Alert", async () => {
    isPurchaseCancelledErrorMock.mockReturnValue(false);
    purchasePackageMock.mockRejectedValue(new Error("billing unavailable"));

    const { invalidateQueriesMock } = renderScreen();
    fireEvent.click(await screen.findByText("Subscribe for $9.99/month"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledOnce());
    expect(alertSpy).toHaveBeenCalledWith(
      "Purchase failed",
      "Something went wrong. Please try again.",
    );
    expect(invalidateQueriesMock).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalledWith(
      "You're subscribed",
      expect.any(String),
      expect.any(Array),
    );
  });

  it("disables the Subscribe button while a purchase is in progress", async () => {
    purchasePackageMock.mockReturnValueOnce(new Promise(() => {}));
    renderScreen();

    fireEvent.click(await screen.findByText("Subscribe for $9.99/month"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Processing\.\.\./ })).toBeDisabled();
    });
  });

  it("Restore purchase button calls restorePurchases", async () => {
    renderScreen();

    fireEvent.click(screen.getByText("Restore purchase"));

    await waitFor(() => expect(restorePurchasesMock).toHaveBeenCalledOnce());
  });

  it("successful restore calls setEntitlement and does not show No purchase found Alert", async () => {
    renderScreen();

    fireEvent.click(screen.getByText("Restore purchase"));

    await waitFor(() => expect(setEntitlementMock).toHaveBeenCalledOnce());
    expect(setEntitlementMock).toHaveBeenCalledWith("active", null);
    expect(alertSpy).not.toHaveBeenCalledWith(
      "No purchase found",
      expect.any(String),
    );
  });

  it("successful restore invalidates entitlement and navigates back from confirmation", async () => {
    const { invalidateQueriesMock, navigation } = renderScreen();

    fireEvent.click(screen.getByText("Restore purchase"));

    await waitFor(() => {
      expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.entitlement });
    });
    expect(alertSpy).toHaveBeenCalledWith(
      "Purchase restored",
      "Your subscription is active again.",
      expect.any(Array),
    );

    const buttons = getAlertButtons("Purchase restored");
    buttons?.find((button) => button.text === "Continue")?.onPress?.();
    expect(navigation.goBack).toHaveBeenCalledOnce();
  });

  it("failed restore exception shows Restore failed Alert", async () => {
    restorePurchasesMock.mockRejectedValue(new Error("restore failed"));

    const { invalidateQueriesMock } = renderScreen();
    fireEvent.click(screen.getByText("Restore purchase"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledOnce());
    expect(alertSpy).toHaveBeenCalledWith(
      "Restore failed",
      "Unable to restore purchases. Please try again.",
    );
    expect(invalidateQueriesMock).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalledWith(
      "Purchase restored",
      expect.any(String),
      expect.any(Array),
    );
  });
});


describe("restore server reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Platform.OS = "ios";
    invalidateQueriesMock.mockReset();
    mockZustandSelector(useSessionStoreMock as any, { setEntitlement: setEntitlementMock });
    vi.mocked(useQueryClient).mockReturnValue({ invalidateQueries: invalidateQueriesMock } as any);
    isPurchasesAvailableMock.mockReturnValue(true);
    restorePurchasesMock.mockResolvedValue({ entitlements: { active: { pro: {} } } } as unknown as CustomerInfo);
  });

  it("uses active server state even when the SDK has no entitlement", async () => {
    restorePurchasesMock.mockResolvedValue({ entitlements: { active: {} } } as unknown as CustomerInfo);
    vi.mocked(syncEntitlement).mockResolvedValue({ is_active: true, subscription_status: "active", trial_expires_at: "2026-01-01" } as any);
    renderScreen();
    fireEvent.click(screen.getByText("Restore purchase"));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Purchase restored", expect.any(String), expect.any(Array)));
    expect(syncEntitlement).toHaveBeenCalledOnce();
    expect(setEntitlementMock).toHaveBeenCalledWith("active", "2026-01-01");
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.entitlement });
  });

  it("uses inactive server state even when the SDK has pro", async () => {
    vi.mocked(syncEntitlement).mockResolvedValue({ is_active: false, subscription_status: "expired", trial_expires_at: "2026-01-01" } as any);
    renderScreen();
    fireEvent.click(screen.getByText("Restore purchase"));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("No purchase found", expect.stringContaining("Apple ID")));
    expect(setEntitlementMock).toHaveBeenCalledWith("expired", "2026-01-01");
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.entitlement });
  });

  it("falls back to SDK state when the endpoint is unavailable", async () => {
    vi.mocked(syncEntitlement).mockResolvedValue(null);
    renderScreen();
    fireEvent.click(screen.getByText("Restore purchase"));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Purchase restored", expect.any(String), expect.any(Array)));
    expect(setEntitlementMock).toHaveBeenCalledWith("active", null);
  });

  it("names the Google account on Android when no purchase is found", async () => {
    Platform.OS = "android";
    vi.mocked(syncEntitlement).mockResolvedValue(null);
    restorePurchasesMock.mockResolvedValue({ entitlements: { active: {} } } as unknown as CustomerInfo);
    renderScreen();
    fireEvent.click(screen.getByText("Restore purchase"));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("No purchase found", expect.stringContaining("Google account")));
    expect(setEntitlementMock).not.toHaveBeenCalled();
  });

  it("reports sync failure without granting the SDK entitlement", async () => {
    vi.mocked(syncEntitlement).mockRejectedValue(new Error("server error"));
    renderScreen();
    fireEvent.click(screen.getByText("Restore purchase"));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Restore failed", expect.any(String)));
    expect(setEntitlementMock).not.toHaveBeenCalled();
  });
});
