import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function initNetworkMonitoring(): void {
  // Maestro's Android emulator in CI has unreliable/unstable connectivity reporting - registering
  // NetInfo's native listener there caused the app to repeatedly fail to reach a stable UI state,
  // stalling E2E flows for 10-20+ minutes at a time until the job hit its 45-minute timeout.
  // Disabling reachability polling alone (see below) reduced but did not eliminate this, so the
  // whole feature is skipped in the E2E build via an env flag CI sets - the same pattern already
  // used for EXPO_PUBLIC_ENABLE_NOTIFICATION_TAP_THROUGH. No production behavior changes.
  if (process.env.EXPO_PUBLIC_DISABLE_NETWORK_MONITORING === "true") {
    return;
  }

  // We only ever read `isConnected` (link-layer state), never `isInternetReachable` - so disable
  // netinfo's periodic reachability polling (a repeating fetch() against an external URL) entirely.
  // This alone measurably helped the E2E stall above but did not fully eliminate it.
  NetInfo.configure({ reachabilityShouldRun: () => false });

  onlineManager.setEventListener((setOnline) => {
    return NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected));
    });
  });
}

export function useIsOffline(): boolean {
  const [isOffline, setIsOffline] = useState(!onlineManager.isOnline());

  useEffect(() => {
    return onlineManager.subscribe(() => {
      setIsOffline(!onlineManager.isOnline());
    });
  }, []);

  return isOffline;
}
