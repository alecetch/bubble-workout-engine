import { http, HttpResponse } from "msw";
import { changePassword, deleteAccount, updateDisplayName } from "../accountApi";
import { ApiError } from "../client";
import { server } from "./msw-server";

vi.mock("../tokenStorage", () => ({
  getAccessToken: vi.fn().mockResolvedValue("test-access-token"),
  saveTokens: vi.fn(),
  clearTokens: vi.fn(),
  getRefreshToken: vi.fn(),
}));

const API_URL = "http://localhost:3000";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("account API MSW contract", () => {
  describe("updateDisplayName", () => {
    it("patches the display name with authorization and returns the string", async () => {
      let capturedAuth: string | null = null;
      let capturedBody: unknown = null;
      server.use(
        http.patch(`${API_URL}/api/users/me/display-name`, async ({ request }) => {
          capturedAuth = request.headers.get("authorization");
          capturedBody = await request.json();
          return HttpResponse.json({ ok: true, displayName: "Alex" });
        }),
      );

      const result = await updateDisplayName("Alex");

      expect(capturedAuth).toBe("Bearer test-access-token");
      expect(capturedBody).toEqual({ displayName: "Alex" });
      expect(result).toBe("Alex");
    });
  });

  describe("changePassword", () => {
    it("posts the current and new password", async () => {
      let capturedBody: unknown = null;
      server.use(
        http.post(`${API_URL}/api/auth/change-password`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ ok: true });
        }),
      );

      await expect(changePassword("old-password", "new-password")).resolves.toBeUndefined();

      expect(capturedBody).toEqual({
        currentPassword: "old-password",
        newPassword: "new-password",
      });
    });

    it("throws ApiError with status 401 for the wrong current password", async () => {
      server.use(
        http.post(`${API_URL}/api/auth/change-password`, () =>
          HttpResponse.json({}, { status: 401 }),
        ),
      );

      await expect(changePassword("wrong-password", "new-password")).rejects.toMatchObject({
        name: "ApiError",
        status: 401,
      } satisfies Partial<ApiError>);
    });
  });

  describe("deleteAccount", () => {
    it("deletes the account with authorization", async () => {
      let capturedAuth: string | null = null;
      server.use(
        http.delete(`${API_URL}/api/users/me`, ({ request }) => {
          capturedAuth = request.headers.get("authorization");
          return HttpResponse.json({ ok: true });
        }),
      );

      await expect(deleteAccount()).resolves.toBeUndefined();

      expect(capturedAuth).toBe("Bearer test-access-token");
    });
  });
});
