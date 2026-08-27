import { http, HttpResponse } from "msw";
import { fetchActivePrograms } from "../activePrograms";
import { getAccountInfo } from "../accountApi";
import { getEntitlement } from "../entitlement";
import { getMe, linkClientProfileToMe } from "../me";
import { getNotificationPreferences } from "../notifications";
import { getSegmentExerciseLogs } from "../segmentLog";
import { server } from "./msw-server";

vi.mock("../tokenStorage", () => ({
  getAccessToken: vi.fn().mockResolvedValue("test-access-token"),
  getRefreshToken: vi.fn().mockResolvedValue(null),
  saveTokens: vi.fn().mockResolvedValue(undefined),
  clearTokens: vi.fn().mockResolvedValue(undefined),
}));

const API_URL = "http://localhost:3000";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("API function HTTP integration", () => {
  describe("getMe", () => {
    it("fetches /api/me and returns user data", async () => {
      server.use(
        http.get(`${API_URL}/api/me`, ({ request }) => {
          expect(request.headers.get("authorization")).toBe("Bearer test-access-token");
          return HttpResponse.json({ id: "u1", clientProfileId: "cp1" });
        }),
      );

      const result = await getMe();

      expect(result.id).toBe("u1");
      expect(result.clientProfileId).toBe("cp1");
    });

    it("sends Authorization header", async () => {
      let capturedAuth: string | null = null;
      server.use(
        http.get(`${API_URL}/api/me`, ({ request }) => {
          capturedAuth = request.headers.get("authorization");
          return HttpResponse.json({ id: "u1", clientProfileId: "cp1" });
        }),
      );

      await getMe();

      expect(capturedAuth).toBe("Bearer test-access-token");
    });

    it("linkClientProfileToMe patches /api/users/me with the client profile id", async () => {
      let capturedBody: unknown = null;
      server.use(
        http.patch(`${API_URL}/api/users/me`, async ({ request }) => {
          expect(request.headers.get("authorization")).toBe("Bearer test-access-token");
          capturedBody = await request.json();
          return HttpResponse.json({ id: "u1", clientProfileId: "cp2" });
        }),
      );

      const result = await linkClientProfileToMe({ clientProfileId: "cp2" });

      expect(capturedBody).toEqual({ clientProfileId: "cp2" });
      expect(result.clientProfileId).toBe("cp2");
    });
  });

  describe("getEntitlement", () => {
    it("fetches /api/users/me/entitlement and returns status", async () => {
      server.use(
        http.get(`${API_URL}/api/users/me/entitlement`, () =>
          HttpResponse.json({
            ok: true,
            subscription_status: "trialing",
            is_active: true,
            trial_days_remaining: 7,
            trial_expires_at: "2026-05-17T00:00:00.000Z",
            subscription_expires_at: null,
            physique_consent_given: false,
          }),
        ),
      );

      const result = await getEntitlement();

      expect(result.subscription_status).toBe("trialing");
      expect(result.is_active).toBe(true);
    });

    it("sends Authorization header", async () => {
      let capturedAuth: string | null = null;
      server.use(
        http.get(`${API_URL}/api/users/me/entitlement`, ({ request }) => {
          capturedAuth = request.headers.get("authorization");
          return HttpResponse.json({
            ok: true,
            subscription_status: "active",
            is_active: true,
            trial_days_remaining: null,
            trial_expires_at: "2026-05-10T00:00:00.000Z",
            subscription_expires_at: null,
            physique_consent_given: true,
          });
        }),
      );

      await getEntitlement();

      expect(capturedAuth).toBe("Bearer test-access-token");
    });
  });

  describe("getAccountInfo", () => {
    it("fetches /api/users/me/account and returns display name", async () => {
      server.use(
        http.get(`${API_URL}/api/users/me/account`, () =>
          HttpResponse.json({ ok: true, email: "alice@example.com", displayName: "Alice" }),
        ),
      );

      const result = await getAccountInfo();

      expect(result.email).toBe("alice@example.com");
      expect(result.displayName).toBe("Alice");
    });

    it("sends Authorization header", async () => {
      let capturedAuth: string | null = null;
      server.use(
        http.get(`${API_URL}/api/users/me/account`, ({ request }) => {
          capturedAuth = request.headers.get("authorization");
          return HttpResponse.json({ ok: true, email: "alice@example.com", displayName: "Alice" });
        }),
      );

      await getAccountInfo();

      expect(capturedAuth).toBe("Bearer test-access-token");
    });

    it("preserves a null display name", async () => {
      server.use(
        http.get(`${API_URL}/api/users/me/account`, () =>
          HttpResponse.json({ ok: true, email: "alice@example.com", displayName: null }),
        ),
      );

      const result = await getAccountInfo();

      expect(result.displayName).toBeNull();
    });
  });

  describe("getNotificationPreferences", () => {
    it("fetches notification preferences", async () => {
      server.use(
        http.get(`${API_URL}/api/users/me/notification-preferences`, () =>
          HttpResponse.json({
            prNotificationEnabled: true,
            deloadNotificationEnabled: false,
            reminderEnabled: true,
            reminderTimeLocalHhmm: "07:30",
            reminderTimezone: "Europe/London",
          }),
        ),
      );

      const result = await getNotificationPreferences();

      expect(result.prNotificationEnabled).toBe(true);
      expect(result.reminderTimeLocalHhmm).toBe("07:30");
    });

    it("sends Authorization header", async () => {
      let capturedAuth: string | null = null;
      server.use(
        http.get(`${API_URL}/api/users/me/notification-preferences`, ({ request }) => {
          capturedAuth = request.headers.get("authorization");
          return HttpResponse.json({
            prNotificationEnabled: false,
            deloadNotificationEnabled: false,
            reminderEnabled: false,
            reminderTimeLocalHhmm: "08:00",
            reminderTimezone: "UTC",
          });
        }),
      );

      await getNotificationPreferences();

      expect(capturedAuth).toBe("Bearer test-access-token");
    });

    it("normalizes missing notification preference fields with defaults", async () => {
      server.use(
        http.get(`${API_URL}/api/users/me/notification-preferences`, () =>
          HttpResponse.json({ reminderTimeLocalHhmm: "" }),
        ),
      );

      const result = await getNotificationPreferences();

      expect(result.reminderEnabled).toBe(true);
      expect(result.reminderTimeLocalHhmm).toBe("08:00");
      expect(result.reminderTimezone).toBe("UTC");
    });
  });

  describe("fetchActivePrograms", () => {
    it("fetches /api/programs/active and returns programs array", async () => {
      server.use(
        http.get(`${API_URL}/api/programs/active`, () =>
          HttpResponse.json({
            ok: true,
            primary_program_id: "p1",
            programs: [
              {
                program_id: "p1",
                program_title: "Strength Block",
                program_type: "strength",
                is_primary: true,
                status: "active",
                weeks_count: 4,
                days_per_week: 4,
                start_date: "2026-05-10",
                hero_media_id: null,
                today_session_count: 1,
                next_session_date: "2026-05-11",
              },
            ],
            today_sessions: [],
          }),
        ),
      );

      const result = await fetchActivePrograms();

      expect(result.programs).toHaveLength(1);
      expect(result.programs[0].program_id).toBe("p1");
    });

    it("sends Authorization header", async () => {
      let capturedAuth: string | null = null;
      server.use(
        http.get(`${API_URL}/api/programs/active`, ({ request }) => {
          capturedAuth = request.headers.get("authorization");
          return HttpResponse.json({ programs: [] });
        }),
      );

      await fetchActivePrograms();

      expect(capturedAuth).toBe("Bearer test-access-token");
    });
  });

  describe("getSegmentExerciseLogs", () => {
    it("rejects when segment-log fetch fails", async () => {
      server.use(
        http.get(`${API_URL}/api/segment-log`, () =>
          HttpResponse.json({ error: "failed" }, { status: 500 }),
        ),
      );

      await expect(
        getSegmentExerciseLogs({
          userId: "user-1",
          workoutSegmentId: "segment-1",
          programDayId: "day-1",
        }),
      ).rejects.toMatchObject({ status: 500 });
    });
  });
});
