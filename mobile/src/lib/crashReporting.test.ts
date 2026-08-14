import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/react-native", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  setUser: vi.fn(),
  wrap: vi.fn((component) => component),
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("__DEV__", false);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function loadWithDsn(dsn: string | undefined) {
  vi.stubEnv("EXPO_PUBLIC_SENTRY_DSN", dsn ?? "");
  const crashReporting = await import("./crashReporting");
  const Sentry = await import("@sentry/react-native");
  return { ...crashReporting, Sentry };
}

describe("crashReporting", () => {
  it("initializes Sentry disabled when the DSN is unset", async () => {
    const { initCrashReporting, Sentry } = await loadWithDsn(undefined);

    initCrashReporting();

    expect(Sentry.init).toHaveBeenCalledWith({
      dsn: "",
      enabled: false,
      environment: "production",
      tracesSampleRate: 0,
    });
  });

  it("initializes Sentry enabled when the DSN is set", async () => {
    const { initCrashReporting, Sentry } = await loadWithDsn("https://example@sentry.io/1");

    initCrashReporting();

    expect(Sentry.init).toHaveBeenCalledWith({
      dsn: "https://example@sentry.io/1",
      enabled: true,
      environment: "production",
      tracesSampleRate: 0,
    });
  });

  it("does not capture errors when the DSN is unset", async () => {
    const { reportError, Sentry } = await loadWithDsn(undefined);

    reportError(new Error("boom"));

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("captures errors with extra context when the DSN is set", async () => {
    const { reportError, Sentry } = await loadWithDsn("https://example@sentry.io/1");
    const error = new Error("boom");

    reportError(error, { componentStack: "x" });

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      extra: { componentStack: "x" },
    });
  });

  it("syncs user context only when the DSN is set", async () => {
    const unset = await loadWithDsn(undefined);

    unset.setCrashReportingUser("user-1");
    unset.setCrashReportingUser(null);

    expect(unset.Sentry.setUser).not.toHaveBeenCalled();

    vi.resetModules();
    const set = await loadWithDsn("https://example@sentry.io/1");

    set.setCrashReportingUser("user-1");
    set.setCrashReportingUser(null);

    expect(set.Sentry.setUser).toHaveBeenCalledWith({ id: "user-1" });
    expect(set.Sentry.setUser).toHaveBeenCalledWith(null);
  });
});
