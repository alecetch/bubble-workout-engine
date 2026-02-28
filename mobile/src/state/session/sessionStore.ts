import { create } from "zustand";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";

type AppEntryRoute = Extract<keyof OnboardingStackParamList, "OnboardingEntry" | "ProgramReview">;

type SessionState = {
  isAuthenticated: boolean;
  userId: string | null;
  clientProfileId: string | null;
  entryRoute: AppEntryRoute;
  setSession: (payload: { userId: string; clientProfileId: string; entryRoute: AppEntryRoute }) => void;
  clearSession: () => void;
};

const defaultSession = {
  isAuthenticated: false,
  userId: null,
  clientProfileId: null,
  entryRoute: "OnboardingEntry" as AppEntryRoute,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...defaultSession,
  setSession: ({ userId, clientProfileId, entryRoute }) => {
    set({
      isAuthenticated: true,
      userId,
      clientProfileId,
      entryRoute,
    });
  },
  clearSession: () => {
    set(defaultSession);
  },
}));
