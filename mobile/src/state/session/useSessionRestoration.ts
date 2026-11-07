import { useCallback, useEffect, useRef, useState } from "react";
import { clearTokens } from "../../api/tokenStorage";
import { queryClient } from "../../api/queryClient";
import { logger } from "../../utils/logger";
import { restoreSession } from "./restoreSession";
import { useSessionStore } from "./sessionStore";

export function useSessionRestoration() {
  const [state, setState] = useState<"restoring" | "ready" | "unreachable">("restoring");
  const [isRetrying, setIsRetrying] = useState(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const signingOut = useRef(false);

  const retry = useCallback(async () => {
    if (inFlight.current || !mounted.current) return;
    const attempt = ++generation.current;
    const isActive = () => mounted.current && generation.current === attempt;
    inFlight.current = true;
    setIsRetrying(true);
    try {
      const outcome = await restoreSession(isActive);
      if (isActive()) setState(outcome === "unreachable" ? "unreachable" : "ready");
    } catch {
      if (isActive()) setState("unreachable");
    } finally {
      if (generation.current === attempt) {
        inFlight.current = false;
        if (mounted.current) setIsRetrying(false);
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    // Invalidate an in-flight restore before deleting credentials so it cannot
    // reinstall a session after the user explicitly chooses to sign out.
    const attempt = ++generation.current;
    inFlight.current = true;
    setIsRetrying(true);
    try {
      await clearTokens();
      if (mounted.current && generation.current === attempt) {
        useSessionStore.getState().clearSession();
        queryClient.clear();
        setState("ready");
      }
    } catch {
      logger.error("session", "Could not clear stored credentials");
    } finally {
      signingOut.current = false;
      if (generation.current === attempt) {
        inFlight.current = false;
        if (mounted.current) setIsRetrying(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void retry();
    return () => {
      mounted.current = false;
      generation.current++;
      inFlight.current = false;
    };
  }, [retry]);

  return { state, isRetrying, retry, signOut };
}
