import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsScreen } from "../SettingsScreen";

type MockPreferences = {
  reminderEnabled: boolean;
  reminderTimeLocalHhmm: string;
  reminderTimezone: string;
  prNotificationEnabled: boolean;
  deloadNotificationEnabled: boolean;
};

type MockAccountInfo = {
  email: string;
  displayName: string | null;
};

type QueryState<T> = {
  data?: T;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
};

const defaultPreferences: MockPreferences = {
  reminderEnabled: true,
  reminderTimeLocalHhmm: "08:00",
  reminderTimezone: "UTC",
  prNotificationEnabled: true,
  deloadNotificationEnabled: false,
};

const defaultAccountInfo: MockAccountInfo = {
  email: "test@example.com",
  displayName: "Test User",
};

const defaultPreferredUnit: "kg" | "lbs" = "kg";

let notificationState: QueryState<MockPreferences>;
let accountState: QueryState<MockAccountInfo>;
let meState: QueryState<{ id: string; clientProfileId: string }>;
let profileState: QueryState<{ id: string; equipmentPreset: string | null }>;
let referenceDataState: QueryState<{ equipmentPresets: Array<{ code: string; label: string }> }>;
let preferredUnitState: QueryState<"kg" | "lbs">;
let preferredHeightUnitState: QueryState<"cm" | "ft_in">;
let notificationMutationShouldFail = false;
let notificationMutationPending = false;
let deleteAccountShouldFail = false;
let mutationCallCount = 0;
const notificationMutateSpy = vi.fn();
const deleteAccountMutateSpy = vi.fn();
const queryClientClearSpy = vi.fn();
const clearTokensSpy = vi.fn();
const clearSessionSpy = vi.fn();
const logoutSpy = vi.fn();
const getRefreshTokenSpy = vi.fn();
const navigationNavigateSpy = vi.fn();
const notificationRefetchSpy = vi.fn();
const accountRefetchSpy = vi.fn();
const meRefetchSpy = vi.fn();
const profileRefetchSpy = vi.fn();
const preferredUnitRefetchSpy = vi.fn();
const preferredHeightUnitRefetchSpy = vi.fn();

function resetMockState(): void {
  notificationState = {
    data: { ...defaultPreferences },
    isLoading: false,
    isError: false,
    isFetching: false,
  };
  accountState = {
    data: { ...defaultAccountInfo },
    isLoading: false,
    isError: false,
    isFetching: false,
  };
  meState = {
    data: { id: "user-1", clientProfileId: "profile-1" },
    isLoading: false,
    isError: false,
    isFetching: false,
  };
  profileState = {
    data: { id: "profile-1", equipmentPreset: "commercial_gym" },
    isLoading: false,
    isError: false,
    isFetching: false,
  };
  referenceDataState = {
    data: { equipmentPresets: [{ code: "commercial_gym", label: "Commercial Gym" }] },
    isLoading: false,
    isError: false,
    isFetching: false,
  };
  preferredUnitState = {
    data: defaultPreferredUnit,
    isLoading: false,
    isError: false,
    isFetching: false,
  };
  preferredHeightUnitState = {
    data: "cm",
    isLoading: false,
    isError: false,
    isFetching: false,
  };
  notificationMutationShouldFail = false;
  notificationMutationPending = false;
  deleteAccountShouldFail = false;
  mutationCallCount = 0;
  notificationMutateSpy.mockReset();
  deleteAccountMutateSpy.mockReset();
  queryClientClearSpy.mockReset();
  clearTokensSpy.mockReset();
  clearSessionSpy.mockReset();
  logoutSpy.mockReset();
  getRefreshTokenSpy.mockReset();
  navigationNavigateSpy.mockReset();
  notificationRefetchSpy.mockReset();
  accountRefetchSpy.mockReset();
  meRefetchSpy.mockReset();
  profileRefetchSpy.mockReset();
  preferredUnitRefetchSpy.mockReset();
  preferredHeightUnitRefetchSpy.mockReset();
  getRefreshTokenSpy.mockResolvedValue(null);
  clearTokensSpy.mockResolvedValue(undefined);
  logoutSpy.mockResolvedValue(undefined);
}

vi.mock("@tanstack/react-query", async () => {
  return {
    useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      const key = String(queryKey[0]);
      if (key === "notificationPreferences") {
        return {
          ...notificationState,
          error: notificationState.isError ? new Error("notification load failed") : null,
          refetch: notificationRefetchSpy,
        };
      }
      if (key === "accountInfo") {
        return {
          ...accountState,
          error: accountState.isError ? new Error("account load failed") : null,
          refetch: accountRefetchSpy,
        };
      }
      if (key === "me") {
        return {
          ...meState,
          error: meState.isError ? new Error("me load failed") : null,
          refetch: meRefetchSpy,
        };
      }
      if (key === "clientProfile") {
        return {
          ...profileState,
          error: profileState.isError ? new Error("profile load failed") : null,
          refetch: profileRefetchSpy,
        };
      }
      if (key === "referenceData") {
        return {
          ...referenceDataState,
          error: referenceDataState.isError ? new Error("reference load failed") : null,
          refetch: vi.fn(),
        };
      }
      if (key === "preferredHeightUnit") {
        return {
          ...preferredHeightUnitState,
          error: preferredHeightUnitState.isError ? new Error("height unit load failed") : null,
          refetch: preferredHeightUnitRefetchSpy,
        };
      }
      return {
        ...preferredUnitState,
        error: preferredUnitState.isError ? new Error("unit load failed") : null,
        refetch: preferredUnitRefetchSpy,
      };
    },
    useMutation: vi.fn((config?: {
      onError?: (error: Error, variables: unknown, context?: unknown) => void;
    }) => {
      const callIndex = mutationCallCount;
      mutationCallCount += 1;
      if (callIndex === 0) {
        return {
          isPending: notificationMutationPending,
          mutate: (
            patch: Partial<MockPreferences>,
            options?: { onError?: (error: Error) => void },
          ) => {
            notificationMutateSpy(patch);
            const previous = notificationState.data ? { ...notificationState.data } : undefined;
            notificationState = {
              ...notificationState,
              data: previous ? { ...previous, ...patch } : undefined,
            };
            if (notificationMutationShouldFail) {
              notificationState = {
                ...notificationState,
                data: previous,
              };
              const error = new Error("save failed");
              options?.onError?.(error);
              config?.onError?.(error, patch, { prev: previous });
            }
          },
        };
      }
      return {
        isPending: false,
        mutate: () => {
          deleteAccountMutateSpy();
          if (deleteAccountShouldFail) {
            config?.onError?.(new Error("delete failed"), undefined, undefined);
          }
        },
      };
    }),
    useQueryClient: () => ({
      clear: queryClientClearSpy,
      cancelQueries: vi.fn().mockResolvedValue(undefined),
      getQueryData: vi.fn(() => notificationState.data),
      setQueryData: vi.fn(),
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

vi.mock("../../../api/authApi", () => ({
  apiLogout: (...args: unknown[]) => logoutSpy(...args),
}));

vi.mock("../../../api/tokenStorage", () => ({
  getRefreshToken: () => getRefreshTokenSpy(),
  clearTokens: () => clearTokensSpy(),
}));

vi.mock("../../../state/session/sessionStore", () => ({
  useSessionStore: (selector: (state: { clearSession: () => void }) => unknown) =>
    selector({ clearSession: clearSessionSpy }),
}));

function renderScreen() {
  mutationCallCount = 0;
  return render(
    <SettingsScreen
      navigation={{
        navigate: navigationNavigateSpy,
      } as never}
      route={{ key: "settings", name: "Settings", params: undefined } as never}
    />,
  );
}

describe("SettingsScreen", () => {
  beforeEach(() => {
    resetMockState();
  });

  it("renders three notification toggle rows when preferences load", () => {
    renderScreen();

    expect(screen.getByText("PR Notifications")).toBeInTheDocument();
    expect(screen.getByText("Recovery Notifications")).toBeInTheDocument();
    expect(screen.getByText("Workout Reminder")).toBeInTheDocument();
  });

  it("calls updateNotificationPreferences with the correct key when a toggle is pressed", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("switch", { name: "Recovery Notifications" }));

    expect(notificationMutateSpy).toHaveBeenCalledWith({ deloadNotificationEnabled: true });
  });

  it("reverts to the prior toggle value when the notification mutation fails", () => {
    notificationMutationShouldFail = true;
    renderScreen();

    fireEvent.click(screen.getByRole("switch", { name: "PR Notifications" }));

    expect(notificationMutateSpy).toHaveBeenCalledWith({ prNotificationEnabled: false });
    expect(screen.getByRole("switch", { name: "PR Notifications" })).toBeChecked();
    expect(screen.getByText("Couldn't save. Check your connection.")).toBeInTheDocument();
  });

  it("shows skeleton rows while notification preferences are loading", () => {
    notificationState = {
      data: undefined,
      isLoading: true,
      isError: false,
      isFetching: false,
    };

    const { getAllByTestId } = render(
      <SettingsScreen
        navigation={{ navigate: navigationNavigateSpy } as never}
        route={{ key: "settings", name: "Settings", params: undefined } as never}
      />,
    );

    expect(getAllByTestId("settings-skeleton-row")).toHaveLength(3);
  });

  it("shows preference skeleton rows while profile data is loading", () => {
    meState = {
      data: undefined,
      isLoading: true,
      isError: false,
      isFetching: false,
    };
    profileState = {
      data: undefined,
      isLoading: true,
      isError: false,
      isFetching: false,
    };

    const { getAllByTestId } = renderScreen();

    expect(getAllByTestId("settings-skeleton-row").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Couldn't load preferences - tap to retry")).not.toBeInTheDocument();
  });

  it("shows a retry row on notification fetch error", () => {
    notificationState = {
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
    };
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Couldn't load notification settings - tap to retry" }));

    expect(notificationRefetchSpy).toHaveBeenCalledTimes(1);
  });

  it("shows a preferences retry row when profile fetch fails", () => {
    profileState = {
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
    };
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Couldn't load preferences - tap to retry" }));

    expect(profileRefetchSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps notification toggles usable after a failed save", () => {
    notificationMutationShouldFail = true;
    renderScreen();

    fireEvent.click(screen.getByRole("switch", { name: "Recovery Notifications" }));

    expect(screen.getByRole("switch", { name: "Recovery Notifications" })).not.toBeDisabled();
    expect(screen.getByText("Couldn't save. Check your connection.")).toBeInTheDocument();
  });

  it("shows Reminder Time only when workout reminders are enabled", () => {
    const view = renderScreen();
    expect(screen.getByText("Reminder Time")).toBeInTheDocument();

    notificationState = {
      ...notificationState,
      data: { ...defaultPreferences, reminderEnabled: false },
    };
    view.rerender(
      <SettingsScreen
        navigation={{ navigate: navigationNavigateSpy } as never}
        route={{ key: "settings", name: "Settings", params: undefined } as never}
      />,
    );

    expect(screen.queryByText("Reminder Time")).not.toBeInTheDocument();
  });

  it("renders Name and Email rows from account info", () => {
    renderScreen();

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("tapping Log Out clears tokens, session, and query cache", async () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Log Out" }));

    await waitFor(() => {
      expect(clearTokensSpy).toHaveBeenCalledTimes(1);
      expect(clearSessionSpy).toHaveBeenCalledTimes(1);
      expect(queryClientClearSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("surfaces delete-account failures and keeps the screen usable", async () => {
    deleteAccountShouldFail = true;
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    fireEvent.click(screen.getByText("Delete my account"));

    await waitFor(() => {
      expect(deleteAccountMutateSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Couldn't delete account. Try again.")).toBeInTheDocument();
    });
  });
});
