import { getJson } from "../api/client";
import { getAppStorage } from "../utils/appStorage";
import type { AppVersionInfo } from "./appVersion";

export type PlatformPolicy = { minBuild: number | null; latestBuild: number | null; updateUrl: string | null };
export type GateDecision = "ok" | "soft_update" | "blocked";
export type GateResult = { decision: GateDecision; updateUrl: string | null; latestBuild: number | null };
export const BLOCK_KEY = "versionGate.block";
const ok: GateResult = { decision: "ok", updateUrl: null, latestBuild: null };
const validBuild = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const validUrl = (value: unknown): value is string => typeof value === "string" && /^(https:\/\/|itms-beta:\/\/)/.test(value);

export function decideGate(build: number | null, policy: PlatformPolicy | null): GateDecision {
  if (build === null || policy === null) return "ok";
  if (policy.minBuild !== null && build < policy.minBuild) return "blocked";
  if (policy.latestBuild !== null && build < policy.latestBuild) return "soft_update";
  return "ok";
}

export async function fetchVersionPolicy(platform: "ios" | "android", timeoutMs = 3000): Promise<PlatformPolicy | null> {
  try {
    const body = await getJson<{ ok?: boolean; ios?: unknown; android?: unknown }>("/api/app-config", { timeoutMs });
    if (body?.ok !== true) return null;
    const value = body[platform];
    if (!value || typeof value !== "object" || !("min_build" in value) || !("latest_build" in value) || !("update_url" in value)) return null;
    return { minBuild: validBuild(value.min_build) ? value.min_build : null,
      latestBuild: validBuild(value.latest_build) ? value.latest_build : null,
      updateUrl: validUrl(value.update_url) ? value.update_url : null };
  } catch { return null; }
}

export async function resolveGate(info: AppVersionInfo): Promise<GateResult> {
  if (info.platform === "other" || info.build === null) return ok;
  const policy = await fetchVersionPolicy(info.platform);
  if (policy) {
    const decision = decideGate(info.build, policy);
    try {
      if (decision === "blocked") await getAppStorage().setItem(BLOCK_KEY, JSON.stringify({ build: info.build, minBuild: policy.minBuild, updateUrl: policy.updateUrl }));
      else await getAppStorage().removeItem(BLOCK_KEY);
    } catch { /* Storage cannot prevent a valid online decision. */ }
    return { decision, updateUrl: policy.updateUrl, latestBuild: policy.latestBuild };
  }
  try {
    const raw = await getAppStorage().getItem(BLOCK_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved?.build === info.build && validBuild(saved.minBuild) && saved.minBuild > info.build) {
      return { decision: "blocked", updateUrl: validUrl(saved.updateUrl) ? saved.updateUrl : null, latestBuild: null };
    }
  } catch { /* No readable saved block means fail open. */ }
  return ok;
}
