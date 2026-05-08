import { useSessionStore } from "../../state/session/sessionStore";

type SessionState = ReturnType<typeof useSessionStore.getState>;

export function buildSessionState(overrides?: Partial<SessionState>): SessionState {
  return {
    isAuthenticated: true,
    userId: "user-test-1",
    clientProfileId: "profile-test-1",
    activeProgramId: null,
    entryRoute: "ProgramReview",
    subscriptionStatus: "active",
    trialExpiresAt: null,
    setSession: vi.fn(),
    setEntitlement: vi.fn(),
    setActiveProgramId: vi.fn(),
    clearSession: vi.fn(),
    ...overrides,
  };
}
