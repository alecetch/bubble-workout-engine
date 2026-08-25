import { afterEach, describe, expect, it, vi } from "vitest";
import { addLogBreadcrumb } from "../lib/crashReporting";
import { logger } from "./logger";

vi.mock("../lib/crashReporting", () => ({
  addLogBreadcrumb: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("logger", () => {
  it("emits boot and api logs when __DEV__ is true", () => {
    vi.stubGlobal("__DEV__", true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logger.boot("booting");
    logger.api("fetching", { path: "/api/test" });

    expect(logSpy).toHaveBeenCalledWith("[boot]", "booting");
    expect(logSpy).toHaveBeenCalledWith("[api]", "fetching", { path: "/api/test" });
  });

  it("suppresses boot and api logs when __DEV__ is false", () => {
    vi.stubGlobal("__DEV__", false);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logger.boot("booting");
    logger.api("fetching");

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("emits warnings and errors regardless of __DEV__", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.stubGlobal("__DEV__", false);
    logger.warn("storage", "fallback");
    logger.error("auth", "failed");

    vi.stubGlobal("__DEV__", true);
    logger.warn("storage", "fallback again");
    logger.error("auth", "failed again");

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it("prefixes every helper with its scope", () => {
    vi.stubGlobal("__DEV__", true);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logger.boot("ready");
    logger.api("request");
    logger.warn("onboarding", "missing data");
    logger.error("push", "registration failed");

    expect(logSpy).toHaveBeenCalledWith("[boot]", "ready");
    expect(logSpy).toHaveBeenCalledWith("[api]", "request");
    expect(warnSpy).toHaveBeenCalledWith("[onboarding]", "missing data");
    expect(errorSpy).toHaveBeenCalledWith("[push]", "registration failed");
  });

  it("adds warning breadcrumbs for logger.warn", () => {
    vi.stubGlobal("__DEV__", false);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logger.warn("storage", "fallback", { code: 1 });

    expect(addLogBreadcrumb).toHaveBeenCalledWith("storage", "warning", "fallback", { code: 1 });
    expect(warnSpy).toHaveBeenCalledWith("[storage]", "fallback", { code: 1 });
  });

  it("adds error breadcrumbs for logger.error", () => {
    vi.stubGlobal("__DEV__", false);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("boom");

    logger.error("auth", "failed", error);

    expect(addLogBreadcrumb).toHaveBeenCalledWith("auth", "error", "failed", error);
    expect(errorSpy).toHaveBeenCalledWith("[auth]", "failed", error);
  });

  it("does not add breadcrumbs for boot or api logs", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    vi.stubGlobal("__DEV__", true);
    logger.boot("ready");
    logger.api("request");

    vi.stubGlobal("__DEV__", false);
    logger.boot("ready");
    logger.api("request");

    expect(addLogBreadcrumb).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(2);
  });
});
