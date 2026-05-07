import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";

vi.mock("../../api/hooks", () => ({
  useMe: () => ({ data: null, isLoading: false, isError: false }),
  useEntitlement: () => ({ data: null, isLoading: false, isError: false }),
  useReferenceData: () => ({ data: null, isLoading: false, isError: false }),
  useClientProfile: () => ({ data: null, isLoading: false, isError: false }),
  useReferralInfo: () => ({ data: null, isLoading: false, isError: false }),
  useReferralStats: () => ({ data: null, isLoading: false, isError: false }),
}));

vi.mock("../../state/session/sessionStore", () => ({
  useSessionStore: vi.fn((selector: any) => selector({ clearSession: vi.fn() })),
}));

vi.mock("../../lib/purchases", () => ({ logOutPurchases: vi.fn() }));

vi.mock("../../api/tokenStorage", () => ({
  clearTokens: vi.fn().mockResolvedValue(undefined),
  getRefreshToken: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../api/authApi", () => ({ apiLogout: vi.fn() }));

vi.mock("../../api/accountApi", () => ({
  deleteAccount: vi.fn(),
  getAccountInfo: vi.fn(),
}));

vi.mock("../../api/notifications", () => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));

vi.mock("../../api/profileApi", () => ({
  getPreferredUnit: vi.fn(),
  getPreferredHeightUnit: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, onPress, disabled, accessibilityLabel }: any) => (
    <button
      type="button"
      aria-label={accessibilityLabel}
      disabled={disabled}
      onClick={() => onPress?.()}
    >
      {children}
    </button>
  ),
}));

import { SettingsScreen } from "./SettingsScreen";

describe("SettingsScreen", () => {
  const nav = { navigate: vi.fn() };

  beforeEach(() => {
    nav.navigate.mockReset();
    vi.mocked(useQuery).mockImplementation(({ queryKey }: any) => {
      if (queryKey[0] === "accountInfo") {
        return {
          data: { displayName: "Alice", email: "alice@example.com" },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        } as any;
      }
      return { data: undefined, isLoading: false, isError: false, refetch: vi.fn() } as any;
    });
  });

  it("renders Settings title and ACCOUNT section rows when account data is loaded", () => {
    render(<SettingsScreen navigation={nav as any} route={{} as any} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Change Password")).toBeInTheDocument();
  });

  it("tapping Name navigates to AccountName with current display name", () => {
    render(<SettingsScreen navigation={nav as any} route={{} as any} />);
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(nav.navigate).toHaveBeenCalledWith("AccountName", { currentName: "Alice" });
  });

  it("tapping Change Password navigates to ChangePassword", () => {
    render(<SettingsScreen navigation={nav as any} route={{} as any} />);
    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));
    expect(nav.navigate).toHaveBeenCalledWith("ChangePassword");
  });
});
