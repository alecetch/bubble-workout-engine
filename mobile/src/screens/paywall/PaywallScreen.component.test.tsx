import React from "react";
import { axe } from "jest-axe";
import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  getPurchaseOfferings: vi.fn(),
  purchasePackage: vi.fn(),
  restorePurchases: vi.fn(),
  isPurchaseCancelledError: vi.fn(),
  isPurchasesAvailable: vi.fn(),
}));

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
const MOCK_PACKAGE = { identifier: "$rc_monthly" };
const MOCK_OFFERINGS = {
  current: { availablePackages: [MOCK_PACKAGE] },
};

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
    purchasePackageMock.mockResolvedValue(undefined);
    restorePurchasesMock.mockResolvedValue({
      entitlements: { active: { pro: { identifier: "pro", isActive: true } } },
    });
    isPurchaseCancelledErrorMock.mockReturnValue(false);
    isPurchasesAvailableMock.mockReturnValue(true);
  });
  it("has no accessibility violations in the default render state", async () => {
    renderScreen();
    await act(async () => {});
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });


  it("renders Subscribe and Restore purchase buttons", () => {
    renderScreen();

    expect(screen.getByText("Forma")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Formai");
    expect(screen.getByText("Subscribe")).toBeInTheDocument();
    expect(screen.getByText("Restore purchase")).toBeInTheDocument();
  });

  it("renders pre-purchase legal links", () => {
    renderScreen();

    expect(screen.getByText("Terms of Service")).toBeInTheDocument();
    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
  });

  it("Subscribe calls getPurchaseOfferings then purchasePackage with the first available package", async () => {
    renderScreen();

    fireEvent.click(screen.getByText("Subscribe"));

    await waitFor(() => expect(purchasePackageMock).toHaveBeenCalledOnce());
    expect(getPurchaseOfferingsMock).toHaveBeenCalledOnce();
    expect(purchasePackageMock).toHaveBeenCalledWith(MOCK_PACKAGE);
  });

  it("successful purchase calls setEntitlement active and does not show a purchase failed Alert", async () => {
    renderScreen();

    fireEvent.click(screen.getByText("Subscribe"));

    await waitFor(() => expect(setEntitlementMock).toHaveBeenCalledOnce());
    expect(setEntitlementMock).toHaveBeenCalledWith("active", null);
    expect(alertSpy).not.toHaveBeenCalledWith(
      "Purchase failed",
      expect.any(String),
    );
  });

  it("successful purchase invalidates entitlement and navigates back from confirmation", async () => {
    const { invalidateQueriesMock, navigation } = renderScreen();

    fireEvent.click(screen.getByText("Subscribe"));

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
    fireEvent.click(screen.getByText("Subscribe"));

    await waitFor(() => expect(isPurchaseCancelledErrorMock).toHaveBeenCalled());
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("failed purchase shows Purchase failed Alert", async () => {
    isPurchaseCancelledErrorMock.mockReturnValue(false);
    purchasePackageMock.mockRejectedValue(new Error("billing unavailable"));

    const { invalidateQueriesMock } = renderScreen();
    fireEvent.click(screen.getByText("Subscribe"));

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

    fireEvent.click(screen.getByText("Subscribe"));

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
