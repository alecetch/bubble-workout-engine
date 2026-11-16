import { BRAND_WORDMARK } from "../config/brand";
import { getAppStorage } from "../utils/appStorage";
import type { VersionGateState } from "./useVersionGate";

export function selectRootView(gate: VersionGateState["state"], restoration: string) {
  if (gate === "blocked") return "force_update";
  if (restoration === "unreachable") return "unreachable";
  if (restoration === "restoring") return "restoring";
  return "navigation";
}
export function isStartupReady(gate: VersionGateState["state"], restoration: string) {
  return gate !== "checking" && restoration !== "restoring";
}
export function isSoftPromptRoute(route: { name?: string; tab?: string }) {
  const roots: Record<string, string[]> = {
    HomeTab: ["ProgramDashboard", "ProgramReview"], ProgramsTab: ["ProgramHub"],
    TodayTab: ["TodayTab"], HistoryTab: ["HistoryMain"], SettingsTab: ["Settings"],
  };
  return Boolean(route.tab && route.name && roots[route.tab]?.includes(route.name));
}
const shown = new Set<number>();
const pending = new Set<number>();
export async function maybeShowSoftUpdate(gate: VersionGateState, options: {
  getRoute: () => { name?: string; tab?: string };
  show: (title: string, body: string, buttons: Array<{ text: string; style?: "cancel"; onPress?: () => void }>) => void;
  openUrl: (url: string) => Promise<unknown>;
}): Promise<boolean> {
  const latest = gate.latestBuild;
  if (gate.state !== "soft_update" || latest === null || !gate.updateUrl || !isSoftPromptRoute(options.getRoute()) || shown.has(latest) || pending.has(latest)) return false;
  pending.add(latest);
  try {
    let previous = null;
    try { previous = await getAppStorage().getItem("versionGate.softPromptShownFor"); } catch { /* Best effort. */ }
    if (previous === String(latest) || !isSoftPromptRoute(options.getRoute())) return false;
    shown.add(latest);
    try { void getAppStorage().setItem("versionGate.softPromptShownFor", String(latest)).catch(() => {}); } catch { /* Best effort. */ }
    options.show("Update available", `A newer version of ${BRAND_WORDMARK} is available.`, [
      { text: "Not now", style: "cancel" },
      { text: "Update", onPress: () => { void options.openUrl(gate.updateUrl!).catch(() => {}); } },
    ]);
    return true;
  } finally { pending.delete(latest); }
}
