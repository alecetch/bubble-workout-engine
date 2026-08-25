import { addLogBreadcrumb } from "../lib/crashReporting";

declare const __DEV__: boolean;

type LogLevel = "log" | "warn" | "error";

function emit(level: LogLevel, scope: string, message: string, detail?: unknown): void {
  const isDevRuntime = typeof __DEV__ !== "undefined" && __DEV__;
  if (!isDevRuntime && level === "log") return;

  if (level === "warn" || level === "error") {
    addLogBreadcrumb(scope, level === "warn" ? "warning" : "error", message, detail);
  }

  const prefix = `[${scope}]`;
  if (detail === undefined) {
    console[level](prefix, message);
  } else {
    console[level](prefix, message, detail);
  }
}

export const logger = {
  boot: (message: string, detail?: unknown) => emit("log", "boot", message, detail),
  api: (message: string, detail?: unknown) => emit("log", "api", message, detail),
  warn: (scope: string, message: string, detail?: unknown) => emit("warn", scope, message, detail),
  error: (scope: string, message: string, detail?: unknown) => emit("error", scope, message, detail),
};
