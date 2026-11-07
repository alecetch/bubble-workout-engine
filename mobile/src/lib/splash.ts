import { useCallback, useEffect, useRef } from "react";
import * as SplashScreen from "expo-splash-screen";

export function preventSplashAutoHide(): void {
  void SplashScreen.preventAutoHideAsync().catch(() => {});
}

export function useHideSplashWhenReady(isReady: boolean, timeoutMs = 5000): void {
  const hidden = useRef(false);
  const hide = useCallback(() => {
    if (hidden.current) return;
    hidden.current = true;
    void SplashScreen.hideAsync().catch(() => {});
  }, []);
  useEffect(() => {
    if (hidden.current) return;
    if (isReady) {
      hide();
      return;
    }
    const timeout = setTimeout(hide, timeoutMs);
    return () => clearTimeout(timeout);
  }, [isReady, timeoutMs, hide]);
}
