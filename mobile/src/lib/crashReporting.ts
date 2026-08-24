import type React from "react";
import * as Sentry from "@sentry/react-native";

declare const __DEV__: boolean;

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";

export function initCrashReporting(): void {
  Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    environment: __DEV__ ? "development" : "production",
    // Error capture only for v1 - no performance tracing.
    tracesSampleRate: 0,
  });
}

export function reportError(error: Error, extra?: Record<string, unknown>): void {
  if (!dsn) return;
  Sentry.captureException(error, extra ? { extra } : undefined);
}

export function setCrashReportingUser(userId: string | null): void {
  if (!dsn) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

export function wrapWithCrashReporting<P extends object>(
  Component: React.ComponentType<P>,
): React.ComponentType<P> {
  return Sentry.wrap(
    Component as React.ComponentType<Record<string, unknown>>,
  ) as React.ComponentType<P>;
}

export function addLogBreadcrumb(
  scope: string,
  level: "warning" | "error",
  message: string,
  detail?: unknown,
): void {
  if (!dsn) return;
  Sentry.addBreadcrumb({
    category: scope,
    level,
    message,
    data: normalizeBreadcrumbData(detail),
  });
}

function normalizeBreadcrumbData(detail: unknown): Record<string, unknown> | undefined {
  if (detail === undefined) return undefined;
  if (detail instanceof Error) return { name: detail.name, message: detail.message };
  if (typeof detail === "object" && detail !== null && !Array.isArray(detail)) {
    return detail as Record<string, unknown>;
  }
  return { detail };
}
