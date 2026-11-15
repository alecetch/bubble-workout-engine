import { create } from "zustand";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";

export type AppEntryRoute = Extract<keyof OnboardingStackParamList, "OnboardingEntry" | "ProgramReview">;

export type AppInitialTab = "HomeTab" | "TodayTab";

type SessionState = {
  isAuthenticated: boolean;
  userId: string | null;
  clientProfileId: string | null;
  activeProgramId: string | null;
  entryRoute: AppEntryRoute;
  initialTab: AppInitialTab;
  subscriptionStatus: "trialing" | "active" | "expired" | "cancelled" | null;
  trialExpiresAt: string | null;
  setSession: (payload: {
    userId: string;
    clientProfileId: string;
    entryRoute: AppEntryRoute;
    initialTab: AppInitialTab;
    subscriptionStatus?: string;
    trialExpiresAt?: string | null;
  }) => void;
  setEntitlement: (status: string, trialExpiresAt: string | null) => void;
  setActiveProgramId: (programId: string | null) => void;
  clearSession: () => void;
};

const defaultSession = {
  isAuthenticated: false,
  userId: null,
  clientProfileId: null,
  activeProgramId: null,
  entryRoute: "OnboardingEntry" as AppEntryRoute,
  initialTab: "HomeTab" as AppInitialTab,
  subscriptionStatus: null as SessionState["subscriptionStatus"],
  trialExpiresAt: null as string | null,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...defaultSession,
  setSession: ({ userId, clientProfileId, entryRoute, initialTab, subscriptionStatus, trialExpiresAt }) => {
    set({
      isAuthenticated: true,
      userId,
      clientProfileId,
      entryRoute,
      initialTab,
      subscriptionStatus: (subscriptionStatus ?? null) as SessionState["subscriptionStatus"],
      trialExpiresAt: trialExpiresAt ?? null,
    });
  },
  setEntitlement: (status, trialExpiresAt) => {
    set({
      subscriptionStatus: status as SessionState["subscriptionStatus"],
      trialExpiresAt,
    });
  },
  setActiveProgramId: (programId) => {
    set({ activeProgramId: programId });
  },
  clearSession: () => {
    set(defaultSession);
  },
}));
