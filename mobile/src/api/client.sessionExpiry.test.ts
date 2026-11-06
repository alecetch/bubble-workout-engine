import { delay, http, HttpResponse } from "msw";
import { ApiError, NetworkTimeoutError, isSessionExpiredError, authenticatedFetch } from "./client";
import { queryClient } from "./queryClient";
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from "./tokenStorage";
import { server } from "./__tests__/msw-server";
import { useSessionStore } from "../state/session/sessionStore";

vi.mock("./tokenStorage", () => ({
  getAccessToken: vi.fn(),
  getRefreshToken: vi.fn(),
  saveTokens: vi.fn(),
  clearTokens: vi.fn(),
}));

const API_URL = "http://localhost:3000";
const TEST_QUERY_KEY = ["some-test-key"] as const;
const TEST_QUERY_DATA = { fake: true };

function setAuthenticatedSession(): void {
  useSessionStore.setState({
    isAuthenticated: true,
    userId: "user-1",
    clientProfileId: "profile-1",
    activeProgramId: null,
    entryRoute: "ProgramReview",
    subscriptionStatus: "active",
    trialExpiresAt: null,
  });
}

function expectSessionExpiredRejection(promise: Promise<unknown>): Promise<void> {
  return expect(promise).rejects.toMatchObject({
    name: "ApiError",
    status: 401,
    details: { code: "session_expired" },
  } satisfies Partial<ApiError>);
}

function seedQueryCache(): void {
  queryClient.setQueryData(TEST_QUERY_KEY, TEST_QUERY_DATA);
}

function expectQueryCacheCleared(): void {
  expect(queryClient.getQueryData(TEST_QUERY_KEY)).toBeUndefined();
}

function expectQueryCachePreserved(): void {
  expect(queryClient.getQueryData(TEST_QUERY_KEY)).toEqual(TEST_QUERY_DATA);
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  vi.mocked(getAccessToken).mockResolvedValue("access-token-1");
  vi.mocked(getRefreshToken).mockReset();
  vi.mocked(saveTokens).mockResolvedValue(undefined);
  vi.mocked(clearTokens).mockResolvedValue(undefined);
  setAuthenticatedSession();
});
afterEach(() => {
  useSessionStore.getState().clearSession();
  queryClient.clear();
  vi.clearAllMocks();
  server.resetHandlers();
});
afterAll(() => server.close());

describe("authenticatedFetch session expiry handling", () => {
  it("clears auth state when no refresh token is available", async () => {
    seedQueryCache();
    vi.mocked(getRefreshToken).mockResolvedValue(null);
    server.use(
      http.get(`${API_URL}/api/protected`, () => (
        HttpResponse.json({ code: "token_expired" }, { status: 401 })
      )),
    );

    await expectSessionExpiredRejection(authenticatedFetch("/api/protected"));

    expect(clearTokens).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().isAuthenticated).toBe(false);
    expectQueryCacheCleared();
  });

  it("clears auth state when the refresh request fails", async () => {
    seedQueryCache();
    vi.mocked(getRefreshToken).mockResolvedValue("refresh-token-1");
    server.use(
      http.get(`${API_URL}/api/protected`, () => (
        HttpResponse.json({ code: "token_expired" }, { status: 401 })
      )),
      http.post(`${API_URL}/api/auth/refresh`, () => (
        HttpResponse.json({ code: "refresh_failed" }, { status: 401 })
      )),
    );

    await expectSessionExpiredRejection(authenticatedFetch("/api/protected"));

    expect(clearTokens).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().isAuthenticated).toBe(false);
    expectQueryCacheCleared();
  });

  it("clears auth state when the retried request is still unauthorized", async () => {
    seedQueryCache();
    let requestCount = 0;
    vi.mocked(getRefreshToken).mockResolvedValue("refresh-token-1");
    server.use(
      http.get(`${API_URL}/api/protected`, () => {
        requestCount += 1;
        return HttpResponse.json(
          { code: requestCount === 1 ? "token_expired" : "still_unauthorized" },
          { status: 401 },
        );
      }),
      http.post(`${API_URL}/api/auth/refresh`, () => (
        HttpResponse.json({
          access_token: "access-token-2",
          refresh_token: "refresh-token-2",
        })
      )),
    );

    await expectSessionExpiredRejection(authenticatedFetch("/api/protected"));

    expect(saveTokens).toHaveBeenCalledWith("access-token-2", "refresh-token-2");
    expect(clearTokens).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().isAuthenticated).toBe(false);
    expectQueryCacheCleared();
  });

  it("keeps auth state unchanged when the first request succeeds", async () => {
    seedQueryCache();
    server.use(
      http.get(`${API_URL}/api/protected`, () => HttpResponse.json({ ok: true })),
    );

    await expect(authenticatedFetch("/api/protected")).resolves.toEqual({ ok: true });

    expect(clearTokens).not.toHaveBeenCalled();
    expect(useSessionStore.getState().isAuthenticated).toBe(true);
    expectQueryCachePreserved();
  });

  it("does not start refresh flow for non-expiry 401 errors", async () => {
    seedQueryCache();
    server.use(
      http.get(`${API_URL}/api/protected`, () => (
        HttpResponse.json({ code: "some_other_error" }, { status: 401 })
      )),
    );

    await expect(authenticatedFetch("/api/protected")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      details: { code: "some_other_error" },
    } satisfies Partial<ApiError>);

    expect(getRefreshToken).not.toHaveBeenCalled();
    expect(clearTokens).not.toHaveBeenCalled();
    expect(useSessionStore.getState().isAuthenticated).toBe(true);
    expectQueryCachePreserved();
  });
});

describe("transient refresh errors preserve the signed-in session", () => {
  function expiredRequest() {
    seedQueryCache();
    vi.mocked(getRefreshToken).mockResolvedValue("refresh-token-1");
    server.use(http.get(`${API_URL}/api/protected`, () => HttpResponse.json({ code: "token_expired" }, { status: 401 })));
  }
  function expectCredentialsKept() {
    expect(clearTokens).not.toHaveBeenCalled();
    expect(saveTokens).not.toHaveBeenCalled();
    expect(useSessionStore.getState().isAuthenticated).toBe(true);
    expectQueryCachePreserved();
  }
  it.each([503, 500, 429, 400])("preserves credentials on refresh HTTP %s", async status => {
    expiredRequest();
    server.use(http.post(`${API_URL}/api/auth/refresh`, () => HttpResponse.json({ code: "temporary" }, { status })));
    await expect(authenticatedFetch("/api/protected")).rejects.toMatchObject({ name: "ApiError", status, details: { code: "temporary" } });
    expectCredentialsKept();
  });
  it("preserves credentials on refresh network error", async () => {
    expiredRequest();
    server.use(http.post(`${API_URL}/api/auth/refresh`, () => HttpResponse.error()));
    await expect(authenticatedFetch("/api/protected")).rejects.toBeInstanceOf(TypeError);
    expectCredentialsKept();
  });
  it("preserves credentials on refresh timeout", async () => {
    expiredRequest();
    const originalFetch = globalThis.fetch;
    const timeout = new NetworkTimeoutError();
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input).endsWith("/api/auth/refresh")) return Promise.reject(timeout);
      return originalFetch(input, init);
    });
    try {
      await expect(authenticatedFetch("/api/protected")).rejects.toBe(timeout);
      expectCredentialsKept();
    } finally { spy.mockRestore(); }
  });
  it("still clears credentials on refresh 403", async () => {
    expiredRequest();
    server.use(http.post(`${API_URL}/api/auth/refresh`, () => HttpResponse.json({ code: "invalid_token" }, { status: 403 })));
    await expectSessionExpiredRejection(authenticatedFetch("/api/protected"));
    expect(clearTokens).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().isAuthenticated).toBe(false);
    expectQueryCacheCleared();
  });
  it("shares one in-flight refresh across concurrent expired calls", async () => {
    seedQueryCache();
    vi.mocked(getRefreshToken).mockResolvedValue("refresh-token-1");
    let refreshCount = 0;
    server.use(
      http.get(`${API_URL}/api/protected`, ({ request }) => request.headers.get("Authorization") === "Bearer new-access"
        ? HttpResponse.json({ ok: true }) : HttpResponse.json({ code: "token_expired" }, { status: 401 })),
      http.post(`${API_URL}/api/auth/refresh`, async () => {
        refreshCount++;
        await delay(40);
        return HttpResponse.json({ access_token: "new-access", refresh_token: "new-refresh" });
      }),
    );
    const results = await Promise.all([authenticatedFetch("/api/protected"), authenticatedFetch("/api/protected")]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(refreshCount).toBe(1);
    expect(saveTokens).toHaveBeenCalledTimes(1);
    expect(clearTokens).not.toHaveBeenCalled();
    expectQueryCachePreserved();
  });
  it("recognizes only the explicit session-expired error", () => {
    expect(isSessionExpiredError(new ApiError(401, "expired", { code: "session_expired" }))).toBe(true);
    for (const error of [new Error("session_expired"), new ApiError(401, "expired", { code: "token_expired" }), new ApiError(403, "expired", { code: "session_expired" })]) {
      expect(isSessionExpiredError(error)).toBe(false);
    }
  });
});
