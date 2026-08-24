import { http, HttpResponse } from "msw";
import { ApiError, authenticatedFetch } from "./client";
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
  vi.clearAllMocks();
  server.resetHandlers();
});
afterAll(() => server.close());

describe("authenticatedFetch session expiry handling", () => {
  it("clears auth state when no refresh token is available", async () => {
    vi.mocked(getRefreshToken).mockResolvedValue(null);
    server.use(
      http.get(`${API_URL}/api/protected`, () => (
        HttpResponse.json({ code: "token_expired" }, { status: 401 })
      )),
    );

    await expectSessionExpiredRejection(authenticatedFetch("/api/protected"));

    expect(clearTokens).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().isAuthenticated).toBe(false);
  });

  it("clears auth state when the refresh request fails", async () => {
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
  });

  it("clears auth state when the retried request is still unauthorized", async () => {
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
  });

  it("keeps auth state unchanged when the first request succeeds", async () => {
    server.use(
      http.get(`${API_URL}/api/protected`, () => HttpResponse.json({ ok: true })),
    );

    await expect(authenticatedFetch("/api/protected")).resolves.toEqual({ ok: true });

    expect(clearTokens).not.toHaveBeenCalled();
    expect(useSessionStore.getState().isAuthenticated).toBe(true);
  });

  it("does not start refresh flow for non-expiry 401 errors", async () => {
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
  });
});
