import { http, HttpResponse } from "msw";
import { ApiError } from "../client";
import {
  createClientProfile,
  getClientProfile,
  updateClientProfile,
  type ClientProfileServer,
} from "../clientProfiles";
import { server } from "./msw-server";

vi.mock("../tokenStorage", () => ({
  getAccessToken: vi.fn().mockResolvedValue("test-access-token"),
  saveTokens: vi.fn(),
  clearTokens: vi.fn(),
  getRefreshToken: vi.fn(),
}));

const API_URL = "http://localhost:3000";

const mockProfile: ClientProfileServer = {
  id: "profile-1",
  userId: "user-1",
  onboardingStepCompleted: 2,
  onboardingCompletedAt: null,
  goals: ["Strength"],
  fitnessLevel: "Intermediate",
  injuryFlags: [],
  goalNotes: "Build durable strength",
  equipmentPresetCode: "home",
  selectedEquipmentCodes: ["dumbbells"],
  equipmentPreset: "home",
  equipmentItemCodes: ["dumbbells"],
  preferredDays: ["Mon", "Wed", "Fri"],
  scheduleConstraints: "Weekday mornings",
  heightCm: 180,
  weightKg: 82,
  minutesPerSession: 50,
  sex: "Prefer not to say",
  ageRange: "25-34",
  anchorLifts: [],
  anchorLiftsSkipped: true,
  preferredUnit: "kg",
  preferredHeightUnit: "cm",
};

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("clientProfiles API MSW contract", () => {
  describe("getClientProfile", () => {
    it("gets a client profile by id with authorization", async () => {
      let capturedAuth: string | null = null;
      let capturedUrl = "";
      server.use(
        http.get(`${API_URL}/api/client-profiles/:profileId`, ({ params, request }) => {
          capturedAuth = request.headers.get("authorization");
          capturedUrl = request.url;
          expect(params.profileId).toBe("profile-1");
          return HttpResponse.json(mockProfile);
        }),
      );

      const result = await getClientProfile("profile-1");

      expect(capturedAuth).toBe("Bearer test-access-token");
      expect(capturedUrl).toContain("/api/client-profiles/profile-1");
      expect(result.id).toBe("profile-1");
    });

    it("throws ApiError with status 404 when the profile is not found", async () => {
      server.use(
        http.get(`${API_URL}/api/client-profiles/:profileId`, () =>
          HttpResponse.json({}, { status: 404 }),
        ),
      );

      await expect(getClientProfile("missing-profile")).rejects.toMatchObject({
        name: "ApiError",
        status: 404,
      } satisfies Partial<ApiError>);
    });
  });

  describe("createClientProfile", () => {
    it("posts the profile payload and returns the created profile", async () => {
      const payload = {
        goals: ["Strength"],
        onboardingStepCompleted: 1,
      } satisfies Parameters<typeof createClientProfile>[0];
      let capturedBody: unknown = null;
      server.use(
        http.post(`${API_URL}/api/client-profiles`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ ...mockProfile, ...payload });
        }),
      );

      const result = await createClientProfile(payload);

      expect(capturedBody).toEqual(payload);
      expect(result.id).toBe("profile-1");
    });
  });

  describe("updateClientProfile", () => {
    it("patches only the provided fields and returns the updated profile", async () => {
      const payload = {
        fitnessLevel: "Advanced",
        onboardingStepCompleted: 3,
      } satisfies Parameters<typeof updateClientProfile>[1];
      let capturedAuth: string | null = null;
      let capturedBody: Record<string, unknown> | null = null;
      server.use(
        http.patch(`${API_URL}/api/client-profiles/:profileId`, async ({ params, request }) => {
          capturedAuth = request.headers.get("authorization");
          capturedBody = await request.json() as Record<string, unknown>;
          expect(params.profileId).toBe("profile-1");
          return HttpResponse.json({ ...mockProfile, ...payload });
        }),
      );

      const result = await updateClientProfile("profile-1", payload);

      expect(capturedAuth).toBe("Bearer test-access-token");
      expect(capturedBody).toEqual(payload);
      expect(capturedBody).not.toHaveProperty("goals");
      expect(result.fitnessLevel).toBe("Advanced");
      expect(result.onboardingStepCompleted).toBe(3);
    });
  });
});
