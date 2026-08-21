import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function initNetworkMonitoring(): void {
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
