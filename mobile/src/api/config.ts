import { logger } from "../utils/logger";

type EnvShape = {
  require?: (moduleName: string) => unknown;
};

// Read EXPO_PUBLIC_* vars via direct process.env references so Metro inlines
// them at bundle time. Indirect access (e.g. through a stored reference to
// process.env) is not transformed by Metro and produces undefined in builds.
const BAKED_API_BASE_URL: string = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";
const BAKED_WELCOME_HERO_URL: string = process.env.EXPO_PUBLIC_WELCOME_HERO_URL ?? "";

const requireFn = (globalThis as EnvShape).require;

export const API_BASE_URL = (BAKED_API_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
export const WELCOME_HERO_URL = BAKED_WELCOME_HERO_URL;

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
      logger.warn(
        "api",
        "API_BASE_URL is localhost. On a physical device this won't reach your dev machine.",
      );
    }
  } catch {
    // Best-effort dev warning only.
  }
}

warnIfLocalhostBaseUrlOnDevice();
