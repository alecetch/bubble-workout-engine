import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionRestoration } from "./useSessionRestoration";
import { restoreSession, type RestoreOutcome } from "./restoreSession";
import { reportError } from "../../lib/crashReporting";
import { getMe } from "../../api/me";
import { clearTokens, getAccessToken } from "../../api/tokenStorage";
import { queryClient } from "../../api/queryClient";
import { useSessionStore } from "./sessionStore";
vi.mock("./restoreSession", () => ({ restoreSession: vi.fn() }));
vi.mock("../../api/tokenStorage", () => ({ clearTokens: vi.fn(), getAccessToken: vi.fn() }));
vi.mock("../../api/me", () => ({ getMe: vi.fn() }));
vi.mock("../../api/clientProfiles", () => ({ getClientProfile: vi.fn() }));
vi.mock("../../api/entitlement", () => ({ getEntitlement: vi.fn() }));
vi.mock("../../lib/purchases", () => ({ logInPurchases: vi.fn() }));
vi.mock("../../lib/crashReporting", () => ({ reportError: vi.fn() }));
beforeEach(() => {
  vi.mocked(restoreSession).mockReset();
  vi.mocked(clearTokens).mockReset().mockResolvedValue(undefined);
  useSessionStore.getState().clearSession();
  queryClient.clear();
});
describe("startup restoration lifecycle", () => {
  it.each(["restored", "signed_out"] as const)("becomes ready after %s", async outcome => {
    vi.mocked(restoreSession).mockResolvedValue(outcome);
    const { result } = renderHook(() => useSessionRestoration());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.isRetrying).toBe(false);
  });
  it("keeps recovery mounted during retry and prevents duplicate restore attempts", async () => {
    let finish!: (outcome: RestoreOutcome) => void;
    vi.mocked(restoreSession).mockResolvedValueOnce("unreachable").mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useSessionRestoration());
    await waitFor(() => expect(result.current.state).toBe("unreachable"));
    act(() => { void result.current.retry(); void result.current.retry(); });
    expect(result.current.state).toBe("unreachable");
    expect(result.current.isRetrying).toBe(true);
    expect(restoreSession).toHaveBeenCalledTimes(2);
    await act(async () => finish("restored"));
    expect(result.current.state).toBe("ready");
  });
  it("sign out invalidates a pending retry before clearing credentials", async () => {
    let finish!: (outcome: RestoreOutcome) => void;
    let isActive!: () => boolean;
    vi.mocked(restoreSession).mockResolvedValueOnce("unreachable").mockImplementationOnce(active => {
      isActive = active!;
      return new Promise(resolve => { finish = resolve; });
    });
    const { result } = renderHook(() => useSessionRestoration());
    await waitFor(() => expect(result.current.state).toBe("unreachable"));
    queryClient.setQueryData(["private"], { data: "cached" });
    act(() => { void result.current.retry(); });
    expect(isActive()).toBe(true);
    await act(async () => { await result.current.signOut(); });
    expect(isActive()).toBe(false);
    expect(clearTokens).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(["private"])).toBeUndefined();
    expect(result.current.state).toBe("ready");
    await act(async () => finish("unreachable"));
    expect(result.current.state).toBe("ready");
    expect(useSessionStore.getState().isAuthenticated).toBe(false);
  });
  it("unmount invalidates the restore callback", () => {
    let isActive!: () => boolean;
    vi.mocked(restoreSession).mockImplementationOnce(active => {
      isActive = active!;
      return new Promise(() => {});
    });
    const { unmount } = renderHook(() => useSessionRestoration());
    expect(isActive()).toBe(true);
    unmount();
    expect(isActive()).toBe(false);
  });
  it("an actual token read failure leaves startup ready and signed out for Welcome", async () => {
    const actual = await vi.importActual<typeof import("./restoreSession")>("./restoreSession");
    const error = new Error("private Keychain error");
    vi.mocked(getAccessToken).mockRejectedValueOnce(error);
    vi.mocked(restoreSession).mockImplementationOnce(actual.restoreSession);
    const { result } = renderHook(() => useSessionRestoration());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(useSessionStore.getState().isAuthenticated).toBe(false);
    expect(result.current.isRetrying).toBe(false);
    expect(getMe).not.toHaveBeenCalled(); expect(clearTokens).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledWith(error, "session.token_read_failed");
  });
});
