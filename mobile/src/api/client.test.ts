import { getAppVersionInfo } from "../lib/appVersion";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({
  API_BASE_URL: "http://localhost:3000",
}));

vi.mock("./tokenStorage", () => ({
  clearTokens: vi.fn(),
  getAccessToken: vi.fn(),
  getRefreshToken: vi.fn(),
  saveTokens: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("api client logging", () => {
  it("does not pass parsed non-2xx response bodies to the logger", async () => {
    const { ApiError, apiFetch } = await import("./client");
    vi.stubGlobal("__DEV__", true);
    const responseBody = { error: "private failure", access_token: "secret-token" };
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(responseBody), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(apiFetch("/body-test")).rejects.toBeInstanceOf(ApiError);

    expect(logSpy).toHaveBeenCalledWith(
      "[api]",
      "non-2xx response GET http://localhost:3000/body-test status=500",
    );
    expect(logSpy.mock.calls.flat()).not.toContainEqual(responseBody);
  });
});


describe("app version headers", () => {
 it("sends platform/version/build and permits caller overrides", async () => {
  vi.mocked(getAppVersionInfo).mockReturnValue({ platform: "ios", version: "1.2.3", build: 17 });
  const fetcher = vi.fn().mockImplementation(async () => new Response("{}", { headers: { "content-type": "application/json" } })); vi.stubGlobal("fetch", fetcher);
  const { getJson } = await import("./client"); await getJson("/api/app-config");
  expect(fetcher.mock.calls[0][1].headers).toMatchObject({ "X-App-Platform": "ios", "X-App-Version": "1.2.3", "X-App-Build": "17" });
  await getJson("/api/app-config", { headers: { "X-App-Build": "99" } }); expect(fetcher.mock.calls[1][1].headers["X-App-Build"]).toBe("99");
 });
 it("sends unknown metadata and never refreshes an unauthenticated failed request", async () => {
  vi.mocked(getAppVersionInfo).mockReturnValue({ platform: "other", version: null, build: null });
  const fetcher = vi.fn().mockResolvedValue(new Response('{"code":"token_expired"}', { status: 401, headers: { "content-type": "application/json" } })); vi.stubGlobal("fetch", fetcher);
  const tokens = await import("./tokenStorage"); vi.mocked(tokens.getRefreshToken).mockClear();
  const { getJson } = await import("./client"); await expect(getJson("/api/app-config")).rejects.toThrow();
  expect(fetcher.mock.calls[0][1].headers).toMatchObject({ "X-App-Version": "unknown", "X-App-Build": "unknown" });
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined(); expect(tokens.getRefreshToken).not.toHaveBeenCalled();
 });
 it("includes metadata on token refresh and retry", async () => {
  vi.mocked(getAppVersionInfo).mockReturnValue({ platform: "ios", version: "1.2.3", build: 17 });
  const tokens = await import("./tokenStorage"); vi.mocked(tokens.getAccessToken).mockResolvedValue("old"); vi.mocked(tokens.getRefreshToken).mockResolvedValue("refresh");
  const response = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "application/json" } });
  const fetcher = vi.fn().mockResolvedValueOnce(response('{"code":"token_expired"}', 401)).mockResolvedValueOnce(response('{"access_token":"new","refresh_token":"new-refresh"}')).mockResolvedValueOnce(response('{}'));
  vi.stubGlobal("fetch", fetcher); const { authenticatedFetch } = await import("./client"); await authenticatedFetch("/private");
  expect(fetcher).toHaveBeenCalledTimes(3);
  for (const call of fetcher.mock.calls) expect(call[1].headers).toMatchObject({ "X-App-Platform": "ios", "X-App-Version": "1.2.3", "X-App-Build": "17" });
 });
});

it("does not post one user's queued rows after credentials switch to another user", async () => {
  const { authenticatedFetch } = await import("./client");
  const { getAccessToken } = await import("./tokenStorage");
  const { useSessionStore } = await import("../state/session/sessionStore");
  let resolve!: (token: string) => void;
  vi.mocked(getAccessToken).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  useSessionStore.setState({ userId: "a", isAuthenticated: true });
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const request = authenticatedFetch("/api/segment-log", { method: "POST", expectedUserId: "a" });
  useSessionStore.setState({ userId: "b", isAuthenticated: true }); resolve("b-token");
  await expect(request).rejects.toMatchObject({ status: 401 });
  expect(fetch).not.toHaveBeenCalled(); expect(useSessionStore.getState().userId).toBe("b");
  useSessionStore.getState().clearSession();
});
