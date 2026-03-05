type EnvShape = {
  process?: {
    env?: Record<string, string | undefined>;
  };
  require?: (moduleName: string) => unknown;
};

const env = (globalThis as EnvShape).process?.env;
const requireFn = (globalThis as EnvShape).require;

type EngineKeySource =
  | "EXPO_PUBLIC_ENGINE_KEY"
  | "ENGINE_KEY"
  | "react-native-config"
  | "none";

function readEngineKeyFromReactNativeConfig(): string {
  if (!requireFn) return "";

  try {
    const loaded = requireFn("react-native-config") as { default?: Record<string, string | undefined> };
    const config = loaded?.default ?? (loaded as Record<string, string | undefined>);
    return (config?.EXPO_PUBLIC_ENGINE_KEY ?? config?.ENGINE_KEY ?? "").trim();
  } catch {
    return "";
  }
}

function resolveEngineKey(): { key: string; source: EngineKeySource } {
  const expoPublicEngineKey = (env?.EXPO_PUBLIC_ENGINE_KEY ?? "").trim();
  if (expoPublicEngineKey) {
    return { key: expoPublicEngineKey, source: "EXPO_PUBLIC_ENGINE_KEY" };
  }

  const engineKey = (env?.ENGINE_KEY ?? "").trim();
  if (engineKey) {
    return { key: engineKey, source: "ENGINE_KEY" };
  }

  const rnConfigKey = readEngineKeyFromReactNativeConfig();
  if (rnConfigKey) {
    return { key: rnConfigKey, source: "react-native-config" };
  }

  return { key: "", source: "none" };
}

export const API_BASE_URL = (env?.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ENGINE_KEY_RESOLUTION = resolveEngineKey();
export const ENGINE_KEY = ENGINE_KEY_RESOLUTION.key;

export function getEngineKeyStatus(): { hasKey: boolean; source: string } {
  return {
    hasKey: Boolean(ENGINE_KEY_RESOLUTION.key),
    source: ENGINE_KEY_RESOLUTION.source,
  };
}

function warnIfLocalhostBaseUrlOnDevice(): void {
  const isLocalhost =
    API_BASE_URL.includes("://localhost") || API_BASE_URL.includes("://127.0.0.1");
  if (!isLocalhost) return;

  if (!requireFn) return;
  try {
    const platform = requireFn("react-native") as {
      Platform?: { OS?: string };
    };
    const constantsModule = requireFn("expo-constants") as {
      default?: {
        expoConfig?: { hostUri?: string | null };
        manifest?: { debuggerHost?: string | null };
        manifest2?: { extra?: { expoGo?: { debuggerHost?: string | null } } };
      };
    };

    const os = platform?.Platform?.OS;
    if (!os || os === "web") return;

    const constants = constantsModule?.default;
    const hostUri =
      constants?.expoConfig?.hostUri ??
      constants?.manifest2?.extra?.expoGo?.debuggerHost ??
      constants?.manifest?.debuggerHost ??
      null;

    if (hostUri && !hostUri.includes("localhost") && !hostUri.includes("127.0.0.1")) {
      console.warn(
        "API_BASE_URL is localhost. On a physical device this won't reach your dev machine.",
      );
    }
  } catch {
    // Best-effort dev warning only.
  }
}

warnIfLocalhostBaseUrlOnDevice();
