type EnvShape = {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

const env = (globalThis as EnvShape).process?.env;

export const API_BASE_URL = (env?.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
