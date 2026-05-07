import { beforeEach, describe, expect, it } from "vitest";
import { useSessionStore } from "./sessionStore";

const defaultSessionState = {
  isAuthenticated: false,
  userId: null,
  clientProfileId: null,
  activeProgramId: null,
  entryRoute: "OnboardingEntry" as const,
  subscriptionStatus: null,
  trialExpiresAt: null,
};

describe("sessionStore", () => {
  beforeEach(() => {
    useSessionStore.setState(defaultSessionState);
  });

  it("initial state is unauthenticated with all nullable fields set to null", () => {
    const state = useSessionStore.getState();

    expect(state.isAuthenticated).toBe(false);
    expect(state.userId).toBeNull();
    expect(state.clientProfileId).toBeNull();
    expect(state.activeProgramId).toBeNull();
    expect(state.entryRoute).toBe("OnboardingEntry");
    expect(state.subscriptionStatus).toBeNull();
    expect(state.trialExpiresAt).toBeNull();
  });

  it("setSession marks the store as authenticated and sets identity fields", () => {
    useSessionStore.getState().setSession({
      userId: "u-1",
      clientProfileId: "p-1",
      entryRoute: "ProgramReview",
    });

    const state = useSessionStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.userId).toBe("u-1");
    expect(state.clientProfileId).toBe("p-1");
    expect(state.entryRoute).toBe("ProgramReview");
  });

  it("setSession persists optional subscription fields when provided", () => {
    useSessionStore.getState().setSession({
      userId: "u-1",
      clientProfileId: "p-1",
      entryRoute: "ProgramReview",
      subscriptionStatus: "trialing",
      trialExpiresAt: "2026-12-01",
    });

    const state = useSessionStore.getState();
    expect(state.subscriptionStatus).toBe("trialing");
    expect(state.trialExpiresAt).toBe("2026-12-01");
  });

  it("setSession defaults subscription fields to null when omitted", () => {
    useSessionStore.getState().setSession({
      userId: "u-1",
      clientProfileId: "p-1",
      entryRoute: "ProgramReview",
    });

    const state = useSessionStore.getState();
    expect(state.subscriptionStatus).toBeNull();
    expect(state.trialExpiresAt).toBeNull();
  });

  it("setActiveProgramId updates only activeProgramId and leaves other fields unchanged", () => {
    useSessionStore.getState().setSession({
      userId: "u-1",
      clientProfileId: "p-1",
      entryRoute: "ProgramReview",
    });

    useSessionStore.getState().setActiveProgramId("prog-1");

    const state = useSessionStore.getState();
    expect(state.activeProgramId).toBe("prog-1");
    expect(state.userId).toBe("u-1");
    expect(state.clientProfileId).toBe("p-1");
    expect(state.isAuthenticated).toBe(true);
    expect(state.entryRoute).toBe("ProgramReview");
  });

  it("setEntitlement updates subscriptionStatus and trialExpiresAt", () => {
    useSessionStore.getState().setEntitlement("active", null);

    const state = useSessionStore.getState();
    expect(state.subscriptionStatus).toBe("active");
    expect(state.trialExpiresAt).toBeNull();
  });

  it("clearSession resets all fields to their defaults", () => {
    useSessionStore.getState().setSession({
      userId: "u-1",
      clientProfileId: "p-1",
      entryRoute: "ProgramReview",
      subscriptionStatus: "active",
      trialExpiresAt: "2027-01-01",
    });
    useSessionStore.getState().setActiveProgramId("prog-1");

    useSessionStore.getState().clearSession();

    const state = useSessionStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.userId).toBeNull();
    expect(state.clientProfileId).toBeNull();
    expect(state.activeProgramId).toBeNull();
    expect(state.entryRoute).toBe("OnboardingEntry");
    expect(state.subscriptionStatus).toBeNull();
    expect(state.trialExpiresAt).toBeNull();
  });

  it("clearSession is idempotent", () => {
    expect(() => {
      useSessionStore.getState().clearSession();
      useSessionStore.getState().clearSession();
    }).not.toThrow();

    const state = useSessionStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.userId).toBeNull();
  });
});
