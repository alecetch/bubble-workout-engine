import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function initNetworkMonitoring(): void {
  // We only ever read `isConnected` (link-layer state), never `isInternetReachable` - so disable
  // netinfo's periodic reachability polling (a repeating fetch() against an external URL) entirely.
  // Left enabled, this caused Maestro E2E to hang for ~20 minutes on the very first app launch in
  // CI, where the reachability check can't reliably resolve on the Android emulator's network.
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
