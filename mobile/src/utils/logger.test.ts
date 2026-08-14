import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "./logger";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
});
