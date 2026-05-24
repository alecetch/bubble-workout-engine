import { create } from "zustand";
import { getAppStorage } from "../../utils/appStorage";

const SHOW_REST_TIMER_KEY = "@workout/showRestTimer";

type SettingsStoreState = {
  showRestTimer: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setShowRestTimer: (value: boolean) => Promise<void>;
};

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  showRestTimer: true,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await getAppStorage().getItem(SHOW_REST_TIMER_KEY);
      set({
        showRestTimer: raw == null ? true : raw !== "0",
        hydrated: true,
      });
    } catch {
      set({ showRestTimer: true, hydrated: true });
    }
  },

  setShowRestTimer: async (value) => {
    set({ showRestTimer: value });
    await getAppStorage().setItem(SHOW_REST_TIMER_KEY, value ? "1" : "0");
  },
}));
