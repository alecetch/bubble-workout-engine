import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { getAppVersionInfo } from "./appVersion";
import { resolveGate, type GateDecision } from "./versionGate";

export type VersionGateState = { state: "checking" | GateDecision; updateUrl: string | null; latestBuild: number | null };
export function useVersionGate(): VersionGateState {
  const [result, setResult] = useState<VersionGateState>({ state: "checking", updateUrl: null, latestBuild: null });
  useEffect(() => {
    let mounted = true, running = false, lastCompleted = -Infinity;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (running || !mounted) return;
      running = true;
      let settled = false;
      const finish = (value: VersionGateState) => {
        if (settled || !mounted) return;
        settled = true; clearTimeout(timer); running = false; lastCompleted = Date.now();
        setResult(value);
      };
      timer = setTimeout(() => finish({ state: "ok", updateUrl: null, latestBuild: null }), 4000);
      void Promise.resolve().then(() => resolveGate(getAppVersionInfo())).then(value => finish({ state: value.decision, updateUrl: value.updateUrl, latestBuild: value.latestBuild }),
        () => finish({ state: "ok", updateUrl: null, latestBuild: null }));
    };
    check();
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active" && Date.now() - lastCompleted > 30 * 60 * 1000) check();
    });
    return () => { mounted = false; clearTimeout(timer); subscription.remove(); };
  }, []);
  return result;
}
