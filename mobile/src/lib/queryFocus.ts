import { focusManager } from "@tanstack/react-query";
import { AppState, type AppStateStatus } from "react-native";

export function initQueryFocusManagement(): void {
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      setFocused(state === "active");
    });
    return subscription.remove;
  });
}
