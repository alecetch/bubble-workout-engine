import { http, HttpResponse } from "msw";
import { ApiError } from "../client";
import { apiLogin, apiLogout, apiRefresh, apiRegister, type AuthTokens } from "../authApi";
import { server } from "./msw-server";

vi.mock("../tokenStorage", () => ({
  getAccessToken: vi.fn(),
  saveTokens: vi.fn(),
  clearTokens: vi.fn(),
  getRefreshToken: vi.fn(),
}));

const API_URL = "http://localhost:3000";

const authTokens: AuthTokens = {
  access_token: "access-token-1",
  refresh_token: "refresh-token-1",
  user_id: "user-1",
  client_profile_id: "profile-1",
};

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("auth API MSW contract", () => {
  describe("apiRegister", () => {
    it("posts registration credentials and returns auth tokens", async () => {
      let capturedBody: unknown = null;
      let capturedAuth: string | null = null;
      server.use(
        http.post(`${API_URL}/api/auth/register`, async ({ request }) => {
          capturedAuth = request.headers.get("authorization");
          capturedBody = await request.json();
          return HttpResponse.json(authTokens);
        }),
      );

      const result = await apiRegister("e2e@example.com", "E2ePass123!");

      expect(capturedAuth).toBeNull();
      expect(capturedBody).toEqual({ email: "e2e@example.com", password: "E2ePass123!" });
      expect(result.access_token).toBe("access-token-1");
      expect(result.refresh_token).toBe("refresh-token-1");
      expect(result.user_id).toBe("user-1");
      expect(result.client_profile_id).toBe("profile-1");
    });

    it("throws ApiError with status 409 on conflict", async () => {
      server.use(
        http.post(`${API_URL}/api/auth/register`, () => HttpResponse.json({}, { status: 409 })),
      );

      await expect(apiRegister("taken@example.com", "E2ePass123!")).rejects.toMatchObject({
        name: "ApiError",
        status: 409,
      } satisfies Partial<ApiError>);
    });
  });

  describe("apiLogin", () => {
    it("posts login credentials and returns auth tokens", async () => {
      let capturedBody: unknown = null;
      let capturedAuth: string | null = null;
      server.use(
        http.post(`${API_URL}/api/auth/login`, async ({ request }) => {
          capturedAuth = request.headers.get("authorization");
          capturedBody = await request.json();
          return HttpResponse.json(authTokens);
        }),
      );

      const result = await apiLogin("e2e@example.com", "E2ePass123!");

      expect(capturedAuth).toBeNull();
      expect(capturedBody).toEqual({ email: "e2e@example.com", password: "E2ePass123!" });
      expect(result.access_token).toBe("access-token-1");
      expect(result.refresh_token).toBe("refresh-token-1");
      expect(result.user_id).toBe("user-1");
      expect(result.client_profile_id).toBe("profile-1");
    });

    it("throws ApiError with status 401 on unauthorized login", async () => {
      server.use(
        http.post(`${API_URL}/api/auth/login`, () => HttpResponse.json({}, { status: 401 })),
      );

      await expect(apiLogin("e2e@example.com", "wrong-password")).rejects.toMatchObject({
        name: "ApiError",
        status: 401,
      } satisfies Partial<ApiError>);
    });
  });

  describe("apiRefresh", () => {
    it("posts the refresh token and returns refreshed tokens", async () => {
      let capturedBody: unknown = null;
      server.use(
        http.post(`${API_URL}/api/auth/refresh`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({
            access_token: "access-token-2",
            refresh_token: "refresh-token-2",
          });
        }),
      );

      const result = await apiRefresh("refresh-token-1");

      expect(capturedBody).toEqual({ refresh_token: "refresh-token-1" });
      expect(result.access_token).toBe("access-token-2");
      expect(result.refresh_token).toBe("refresh-token-2");
    });
  });

  describe("apiLogout", () => {
    it("posts the refresh token and resolves", async () => {
      let capturedBody: unknown = null;
      server.use(
        http.post(`${API_URL}/api/auth/logout`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ ok: true });
        }),
      );

      await expect(apiLogout("refresh-token-1")).resolves.toBeUndefined();

      expect(capturedBody).toEqual({ refresh_token: "refresh-token-1" });
    });
  });
});
