import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/react-native", () => ({
  init: vi.fn(),
  nativeCrash: vi.fn(),
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
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
      sendDefaultPii: false,
      beforeBreadcrumb: expect.any(Function),
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
      sendDefaultPii: false,
      beforeBreadcrumb: expect.any(Function),
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

  it("does not add log breadcrumbs when the DSN is unset", async () => {
    const { addLogBreadcrumb, Sentry } = await loadWithDsn(undefined);

    addLogBreadcrumb("push", "error", "registration failed");

    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it("adds log breadcrumbs without detail when the DSN is set", async () => {
    const { addLogBreadcrumb, Sentry } = await loadWithDsn("https://example@sentry.io/1");

    addLogBreadcrumb("push", "error", "registration failed");

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "push",
      level: "error",
      message: "registration failed",
      data: undefined,
    });
  });

  it("normalizes Error detail for log breadcrumbs", async () => {
    const { addLogBreadcrumb, Sentry } = await loadWithDsn("https://example@sentry.io/1");

    addLogBreadcrumb("auth", "error", "sign-in failed", new Error("boom"));

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "auth",
      level: "error",
      message: "sign-in failed",
      data: { name: "Error", message: "boom" },
    });
  });

  it("passes plain object detail through for log breadcrumbs", async () => {
    const { addLogBreadcrumb, Sentry } = await loadWithDsn("https://example@sentry.io/1");

    addLogBreadcrumb("calendar", "warning", "missing date", { id: "day-1" });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "calendar",
      level: "warning",
      message: "missing date",
      data: { id: "day-1" },
    });
  });

  it("wraps primitive detail for log breadcrumbs", async () => {
    const { addLogBreadcrumb, Sentry } = await loadWithDsn("https://example@sentry.io/1");

    addLogBreadcrumb("storage", "warning", "fallback", "some string");

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "storage",
      level: "warning",
      message: "fallback",
      data: { detail: "some string" },
    });
  });
});


describe("diagnostics and privacy", () => {
  it.each([true, false])("uses the dev fallback when __DEV__ is %s", async (dev) => {
    vi.stubGlobal("__DEV__", dev);
    vi.stubEnv("EXPO_PUBLIC_SENTRY_ENVIRONMENT", "");
    const { initCrashReporting, Sentry } = await loadWithDsn("test-dsn");
    initCrashReporting();
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ environment: dev ? "development" : "production" }));
  });
  it("uses the explicit build environment", async () => {
    vi.stubEnv("EXPO_PUBLIC_SENTRY_ENVIRONMENT", "beta");
    const { initCrashReporting, Sentry } = await loadWithDsn("test-dsn");
    initCrashReporting();
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ environment: "beta" }));
  });
  it.each(["fetch", "xhr"])("allows only safe %s network fields", async (category) => {
    const { initCrashReporting, Sentry } = await loadWithDsn("test-dsn");
    initCrashReporting();
    const before = vi.mocked(Sentry.init).mock.calls[0][0]!.beforeBreadcrumb!;
    const result = before({ category, message: "https://example.com?token=private", data: {
      method: "POST", url: "https://example.com/path?token=private#fragment", status_code: 400,
      request_body: "private", response_body: "private", headers: { Authorization: "private" },
    } }, {});
    expect(result).toEqual({ category, data: { method: "POST", url: "https://example.com/path", status_code: 400 } });
    expect(JSON.stringify(result)).not.toContain("private");
    const other = { category: "calendar", message: "unchanged", data: { id: "day" } };
    expect(before(other, {})).toBe(other);
  });
  it.each(["", "test-dsn"])("reports enabled state and gates diagnostics for DSN %s", async (dsn) => {
    const { isCrashReportingEnabled, sendTestError, triggerNativeCrash, Sentry } = await loadWithDsn(dsn);
    expect(isCrashReportingEnabled()).toBe(Boolean(dsn));
    sendTestError();
    triggerNativeCrash();
    if (dsn) {
      expect(Sentry.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: "Sentry test error" }), { tags: { diagnostic: "true" } });
      expect(Sentry.nativeCrash).toHaveBeenCalledOnce();
    } else {
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.nativeCrash).not.toHaveBeenCalled();
    }
  });
});
