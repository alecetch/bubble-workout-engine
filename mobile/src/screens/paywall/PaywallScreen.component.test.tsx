import React from "react";
import { Alert } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPurchaseOfferings,
  isPurchaseCancelledError,
  isPurchasesAvailable,
  purchasePackage,
  restorePurchases,
} from "../../lib/purchases";
import { useSessionStore } from "../../state/session/sessionStore";
import { PaywallScreen } from "./PaywallScreen";

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
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const alertSpy = vi.spyOn(Alert, "alert").mockImplementation(() => {});
const setEntitlementMock = vi.fn();
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
  render(<PaywallScreen />);
}

describe("PaywallScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    alertSpy.mockClear();

    useSessionStoreMock.mockImplementation((selector: any) =>
      selector({ setEntitlement: setEntitlementMock }),
    );
    getPurchaseOfferingsMock.mockResolvedValue(MOCK_OFFERINGS);
    purchasePackageMock.mockResolvedValue(undefined);
    restorePurchasesMock.mockResolvedValue({
      entitlements: { active: { pro: { identifier: "pro", isActive: true } } },
    });
    isPurchaseCancelledErrorMock.mockReturnValue(false);
    isPurchasesAvailableMock.mockReturnValue(true);
  });

  it("renders Subscribe and Restore purchase buttons", () => {
    renderScreen();

    expect(screen.getByText("Subscribe")).toBeInTheDocument();
    expect(screen.getByText("Restore purchase")).toBeInTheDocument();
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

    renderScreen();
    fireEvent.click(screen.getByText("Subscribe"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledOnce());
    expect(alertSpy).toHaveBeenCalledWith(
      "Purchase failed",
      "Something went wrong. Please try again.",
    );
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

  it("failed restore exception shows Restore failed Alert", async () => {
    restorePurchasesMock.mockRejectedValue(new Error("restore failed"));

    renderScreen();
    fireEvent.click(screen.getByText("Restore purchase"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledOnce());
    expect(alertSpy).toHaveBeenCalledWith(
      "Restore failed",
      "Unable to restore purchases. Please try again.",
    );
  });
});
