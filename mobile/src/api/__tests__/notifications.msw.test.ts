import { http, HttpResponse } from "msw";
import {
  clearPushToken,
  registerPushToken,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "../notifications";
import { server } from "./msw-server";

vi.mock("../tokenStorage", () => ({
  getAccessToken: vi.fn().mockResolvedValue("test-access-token"),
  saveTokens: vi.fn(),
  clearTokens: vi.fn(),
  getRefreshToken: vi.fn(),
}));

const API_URL = "http://localhost:3000";

const preferences: NotificationPreferences = {
  reminderEnabled: false,
  reminderTimeLocalHhmm: "07:30",
  reminderTimezone: "Europe/London",
  prNotificationEnabled: true,
  deloadNotificationEnabled: false,
};

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("notifications API MSW contract", () => {
  describe("registerPushToken", () => {
    it("patches the device push token with authorization", async () => {
      let capturedAuth: string | null = null;
      let capturedBody: unknown = null;
      server.use(
        http.patch(`${API_URL}/api/users/me/push-token`, async ({ request }) => {
          capturedAuth = request.headers.get("authorization");
          capturedBody = await request.json();
          return HttpResponse.json({ ok: true });
        }),
      );

      await expect(registerPushToken("device-push-token")).resolves.toBeUndefined();

      expect(capturedAuth).toBe("Bearer test-access-token");
      expect(capturedBody).toEqual({ push_token: "device-push-token" });
    });
  });

  describe("clearPushToken", () => {
    it("patches the push token to null", async () => {
      let capturedBody: unknown = null;
      server.use(
        http.patch(`${API_URL}/api/users/me/push-token`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ ok: true });
        }),
      );

      await expect(clearPushToken()).resolves.toBeUndefined();

      expect(capturedBody).toEqual({ push_token: null });
    });
  });

  describe("updateNotificationPreferences", () => {
    it("patches partial preferences and returns normalized preferences", async () => {
      let capturedAuth: string | null = null;
      let capturedBody: Record<string, unknown> | null = null;
      server.use(
        http.patch(`${API_URL}/api/users/me/notification-preferences`, async ({ request }) => {
          capturedAuth = request.headers.get("authorization");
          capturedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json(preferences);
        }),
      );

      const result = await updateNotificationPreferences({ reminderEnabled: false });

      expect(capturedAuth).toBe("Bearer test-access-token");
      expect(capturedBody).toEqual({ reminderEnabled: false });
      expect(capturedBody).not.toHaveProperty("reminderTimeLocalHhmm");
      expect(result.reminderEnabled).toBe(false);
      expect(result.reminderTimeLocalHhmm).toBe("07:30");
      expect(result.reminderTimezone).toBe("Europe/London");
      expect(result.prNotificationEnabled).toBe(true);
      expect(result.deloadNotificationEnabled).toBe(false);
    });
  });
});
