import type { AuthTokens as AuthToken } from "../../api/authApi";
import type { ClientProfileServer as ClientProfile } from "../../api/clientProfiles";

export function buildToken(overrides?: Partial<AuthToken>): AuthToken {
  return {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    user_id: "user-test-1",
    client_profile_id: "profile-test-1",
    subscription_status: "active",
    trial_expires_at: null,
    ...overrides,
  };
}

export function buildClientProfile(overrides?: Partial<ClientProfile>): ClientProfile {
  return {
    id: "profile-test-1",
    userId: "user-test-1",
    goals: [],
    fitnessLevel: null,
    injuryFlags: [],
    goalNotes: "",
    equipmentPresetCode: null,
    selectedEquipmentCodes: [],
    equipmentPreset: null,
    equipmentItemCodes: [],
    preferredDays: [],
    scheduleConstraints: "",
    heightCm: null,
    weightKg: null,
    minutesPerSession: null,
    sex: null,
    ageRange: null,
    anchorLifts: [],
    anchorLiftsSkipped: false,
    onboardingStepCompleted: 0,
    onboardingCompletedAt: null,
    preferredUnit: "kg",
    preferredHeightUnit: "cm",
    ...overrides,
  };
}
