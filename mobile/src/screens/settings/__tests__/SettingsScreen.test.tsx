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
let preferredUnitState: QueryState<"kg" | "lbs">;
let notificationMutationShouldFail = false;
let notificationMutationPending = false;
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
const preferredUnitRefetchSpy = vi.fn();

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
  preferredUnitState = {
    data: defaultPreferredUnit,
    isLoading: false,
    isError: false,
    isFetching: false,
  };
  notificationMutationShouldFail = false;
  notificationMutationPending = false;
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
  preferredUnitRefetchSpy.mockReset();
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
});
