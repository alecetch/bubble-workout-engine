import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEntitlement } from "../../api/hooks";
import { useSessionStore } from "../../state/session/sessionStore";

vi.mock("../../api/hooks", () => ({
  useMe: () => ({ data: null, isLoading: false, isError: false }),
  useEntitlement: vi.fn(() => ({ data: null, isLoading: false, isError: false })),
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

const nav = { navigate: vi.fn() };

function makeQuery(overrides: Record<string, unknown> = {}) {
  return { data: undefined, isLoading: false, isError: false, refetch: vi.fn(), ...overrides };
}

function mockDefaultQueries() {
  vi.mocked(useQuery).mockImplementation(({ queryKey }: any) => {
    if (queryKey[0] === "accountInfo") {
      return makeQuery({ data: { displayName: "Alice", email: "alice@example.com" } }) as any;
    }
    return makeQuery() as any;
  });
}

function resetSettingsMocks() {
  nav.navigate.mockReset();
  vi.mocked(useEntitlement).mockReturnValue({ data: null, isLoading: false, isError: false } as any);
  vi.mocked(useSessionStore).mockImplementation((selector: any) => selector({ clearSession: vi.fn() }));
  vi.mocked(useQueryClient).mockReturnValue({
    cancelQueries: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
    getQueryData: vi.fn(() => undefined),
    invalidateQueries: vi.fn(),
    removeQueries: vi.fn(),
    setQueryData: vi.fn(),
  } as any);
  vi.mocked(useMutation).mockImplementation(({ mutationFn, onSuccess }: any) => ({
    error: null,
    isError: false,
    isPending: false,
    mutate: vi.fn((variables?: unknown) => {
      const result = mutationFn?.(variables);
      void Promise.resolve(result).then((data) => onSuccess?.(data, variables, undefined));
    }),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
  }) as any);
  mockDefaultQueries();
}

describe("SettingsScreen", () => {
  beforeEach(() => {
    resetSettingsMocks();
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

describe("loading states", () => {
  beforeEach(() => {
    resetSettingsMocks();
  });

  it("shows skeleton rows while accountQuery is loading", () => {
    vi.mocked(useQuery).mockImplementation(({ queryKey }: any) => {
      if (queryKey[0] === "accountInfo") return makeQuery({ isLoading: true }) as any;
      return makeQuery() as any;
    });

    render(<SettingsScreen navigation={nav as any} route={{} as any} />);

    expect(screen.getAllByTestId("settings-skeleton-row").length).toBeGreaterThan(0);
  });

  it("shows skeleton rows while notifQuery is loading", () => {
    vi.mocked(useQuery).mockImplementation(({ queryKey }: any) => {
      if (queryKey[0] === "notificationPreferences") return makeQuery({ isLoading: true }) as any;
      return makeQuery() as any;
    });

    render(<SettingsScreen navigation={nav as any} route={{} as any} />);

    expect(screen.getAllByTestId("settings-skeleton-row").length).toBeGreaterThan(0);
  });

  it("shows skeleton rows while preferredUnitQuery is loading", () => {
    vi.mocked(useQuery).mockImplementation(({ queryKey }: any) => {
      if (queryKey[0] === "preferredUnit") return makeQuery({ isLoading: true }) as any;
      return makeQuery() as any;
    });

    render(<SettingsScreen navigation={nav as any} route={{} as any} />);

    expect(screen.getAllByTestId("settings-skeleton-row").length).toBeGreaterThan(0);
  });
});

describe("error states", () => {
  beforeEach(() => {
    resetSettingsMocks();
  });

  it("shows retry row when accountQuery fails", () => {
    vi.mocked(useQuery).mockImplementation(({ queryKey }: any) => {
      if (queryKey[0] === "accountInfo") return makeQuery({ isError: true }) as any;
      return makeQuery() as any;
    });

    render(<SettingsScreen navigation={nav as any} route={{} as any} />);

    expect(screen.getByText("Couldn't load account settings - tap to retry")).toBeInTheDocument();
  });

  it("shows retry row when notifQuery fails", () => {
    vi.mocked(useQuery).mockImplementation(({ queryKey }: any) => {
      if (queryKey[0] === "notificationPreferences") return makeQuery({ isError: true }) as any;
      return makeQuery() as any;
    });

    render(<SettingsScreen navigation={nav as any} route={{} as any} />);

    expect(screen.getByText("Couldn't load notification settings - tap to retry")).toBeInTheDocument();
  });

  it("shows retry row when preferredUnitQuery fails", () => {
    vi.mocked(useQuery).mockImplementation(({ queryKey }: any) => {
      if (queryKey[0] === "preferredUnit") return makeQuery({ isError: true }) as any;
      return makeQuery() as any;
    });

    render(<SettingsScreen navigation={nav as any} route={{} as any} />);

    expect(screen.getByText("Couldn't load preferences - tap to retry")).toBeInTheDocument();
  });
});

const defaultNotifData = {
  prNotificationEnabled: false,
  deloadNotificationEnabled: false,
  reminderEnabled: false,
  reminderTimeLocalHhmm: "08:00",
};

describe("notification toggles", () => {
  beforeEach(() => {
    resetSettingsMocks();
  });

  it("renders notification toggle rows when notifQuery resolves", () => {
    vi.mocked(useQuery).mockImplementation(({ queryKey }: any) => {
      if (queryKey[0] === "notificationPreferences") return makeQuery({ data: defaultNotifData }) as any;
      return makeQuery() as any;
    });

    render(<SettingsScreen navigation={nav as any} route={{} as any} />);

    expect(screen.getByText("PR Notifications")).toBeInTheDocument();
    expect(screen.getByText("Recovery Notifications")).toBeInTheDocument();
    expect(screen.getByText("Workout Reminder")).toBeInTheDocument();
  });

  it("does not show Reminder Time row when reminderEnabled is false", () => {
    vi.mocked(useQuery).mockImplementation(({ queryKey }: any) => {
      if (queryKey[0] === "notificationPreferences") {
        return makeQuery({ data: { ...defaultNotifData, reminderEnabled: false } }) as any;
      }
      return makeQuery() as any;
    });

    render(<SettingsScreen navigation={nav as any} route={{} as any} />);

    expect(screen.queryByText("Reminder Time")).not.toBeInTheDocument();
  });

  it("shows Reminder Time row with formatted time when reminderEnabled is true", () => {
    vi.mocked(useQuery).mockImplementation(({ queryKey }: any) => {
      if (queryKey[0] === "notificationPreferences") {
        return makeQuery({
          data: { ...defaultNotifData, reminderEnabled: true, reminderTimeLocalHhmm: "07:30" },
        }) as any;
      }
      return makeQuery() as any;
    });

    render(<SettingsScreen navigation={nav as any} route={{} as any} />);

    expect(screen.getByText("Reminder Time")).toBeInTheDocument();
    expect(screen.getByText("7:30 AM")).toBeInTheDocument();
  });

  it("tapping Reminder Time row navigates to NotificationTime", () => {
    vi.mocked(useQuery).mockImplementation(({ queryKey }: any) => {
      if (queryKey[0] === "notificationPreferences") {
        return makeQuery({
          data: { ...defaultNotifData, reminderEnabled: true, reminderTimeLocalHhmm: "07:30" },
        }) as any;
      }
      return makeQuery() as any;
    });

    render(<SettingsScreen navigation={nav as any} route={{} as any} />);
    fireEvent.click(screen.getByRole("button", { name: "Reminder Time" }));

    expect(nav.navigate).toHaveBeenCalledWith("NotificationTime", { currentTime: "07:30" });
  });
});

describe("subscription section", () => {
  beforeEach(() => {
    resetSettingsMocks();
  });

  it("renders trial status when subscription_status is trialing", () => {
    vi.mocked(useEntitlement).mockReturnValue({
      data: { subscription_status: "trialing", trial_days_remaining: 7, is_active: true },
      isLoading: false,
      isError: false,
    } as any);

    render(<SettingsScreen navigation={nav as any} route={{} as any} />);

    expect(screen.getByText(/Free trial - 7 days remaining/)).toBeInTheDocument();
  });

  it("renders Active subscription when subscription_status is active", () => {
    vi.mocked(useEntitlement).mockReturnValue({
      data: { subscription_status: "active", is_active: true },
      isLoading: false,
      isError: false,
    } as any);

    render(<SettingsScreen navigation={nav as any} route={{} as any} />);

    expect(screen.getByText("Active subscription")).toBeInTheDocument();
  });

  it("renders Trial ended when subscription_status is expired", () => {
    vi.mocked(useEntitlement).mockReturnValue({
      data: { subscription_status: "expired", is_active: false },
      isLoading: false,
      isError: false,
    } as any);

    render(<SettingsScreen navigation={nav as any} route={{} as any} />);

    expect(screen.getByText("Trial ended")).toBeInTheDocument();
  });

  it("shows Subscribe button when is_active is false", () => {
    vi.mocked(useEntitlement).mockReturnValue({
      data: { subscription_status: "expired", is_active: false },
      isLoading: false,
      isError: false,
    } as any);

    render(<SettingsScreen navigation={nav as any} route={{} as any} />);

    expect(screen.getByRole("button", { name: "Subscribe" })).toBeInTheDocument();
  });

  it("does not show Subscribe button when is_active is true", () => {
    vi.mocked(useEntitlement).mockReturnValue({
      data: { subscription_status: "trialing", is_active: true },
      isLoading: false,
      isError: false,
    } as any);

    render(<SettingsScreen navigation={nav as any} route={{} as any} />);

    expect(screen.queryByRole("button", { name: "Subscribe" })).not.toBeInTheDocument();
  });
});

describe("log out", () => {
  beforeEach(() => {
    resetSettingsMocks();
  });

  it("Log Out row is visible in the DANGER ZONE section", () => {
    render(<SettingsScreen navigation={nav as any} route={{} as any} />);

    expect(screen.getByRole("button", { name: "Log Out" })).toBeInTheDocument();
  });

  it("tapping Log Out calls clearTokens and clearSession", async () => {
    const { clearTokens } = await import("../../api/tokenStorage");
    const clearSession = vi.fn();
    vi.mocked(useSessionStore).mockImplementation((selector: any) => selector({ clearSession }));

    render(<SettingsScreen navigation={nav as any} route={{} as any} />);
    fireEvent.click(screen.getByRole("button", { name: "Log Out" }));

    await waitFor(() => {
      expect(vi.mocked(clearTokens)).toHaveBeenCalled();
      expect(clearSession).toHaveBeenCalled();
    });
  });
});

describe("delete account modal", () => {
  beforeEach(() => {
    resetSettingsMocks();
  });

  it("tapping Delete Account opens the confirmation modal", () => {
    render(<SettingsScreen navigation={nav as any} route={{} as any} />);

    expect(screen.queryByText("Delete account")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));

    expect(screen.getByText("Delete account")).toBeInTheDocument();
    expect(screen.getByText(/permanently delete your account/)).toBeInTheDocument();
  });

  it("tapping Cancel in the modal closes it", () => {
    render(<SettingsScreen navigation={nav as any} route={{} as any} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Delete account")).not.toBeVisible();
  });

  it("tapping Delete my account calls deleteAccount mutation", async () => {
    const { deleteAccount } = await import("../../api/accountApi");

    render(<SettingsScreen navigation={nav as any} route={{} as any} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(vi.mocked(deleteAccount)).toHaveBeenCalled();
  });
});
