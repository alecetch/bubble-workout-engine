import * as Sentry from "@sentry/node";
import logger from "./logger.js";

export async function withJobHeartbeat({ monitorSlug, pingUrl, schedule,
  checkinMarginMinutes = 10, maxRuntimeMinutes = 4,
  sentry = Sentry, fetchImpl = globalThis.fetch, log = logger }, fn) {
  const enabled = Boolean(monitorSlug && process.env.SENTRY_DSN);
  if (!enabled && !pingUrl) return fn();
  const started = performance.now();
  let checkInId;
  const safely = async operation => {
    try { return await operation(); }
    catch {
      try { log?.warn?.({ event: "job.heartbeat.failed" }); } catch { /* Monitoring must not fail the job. */ }
    }
  };
  if (enabled) checkInId = await safely(() => sentry.captureCheckIn({ monitorSlug, status: "in_progress" }, {
    schedule: { type: "crontab", value: schedule }, checkinMargin: checkinMarginMinutes,
    maxRuntime: maxRuntimeMinutes, timezone: "Etc/UTC",
  }));
  async function finish(status) {
    if (enabled && checkInId) await safely(() => sentry.captureCheckIn({
      monitorSlug, checkInId, status, duration: (performance.now() - started) / 1000,
    }));
    if (pingUrl) await safely(async () => {
      const url = new URL(pingUrl);
      if (status === "error") url.pathname = `${url.pathname.replace(/\/$/, "")}/fail`;
      const result = await fetchImpl(url.toString(), { method: "GET", signal: AbortSignal.timeout(5000) });
      if (!result.ok) throw new Error("Heartbeat rejected");
    });
  }
  let result;
  try { result = await fn(); }
  catch (error) { await finish("error"); throw error; }
  await finish("ok");
  return result;
}

// setInterval is relative to process startup; cron approximates its cadence.
// Divisors of an hour/day are exact. Other intervals use a nearby divisor and
// a margin that covers drift, including a late process start.
export function heartbeatSchedule(intervalMs) {
  const minutes = Math.max(1, Math.round(intervalMs / 60000));
  const choices = [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30, 60, 120, 180, 240, 360, 480, 720, 1440];
  const cadence = choices.reduce((best, next) => Math.abs(next - minutes) < Math.abs(best - minutes) ? next : best);
  return { schedule: cadence < 60 ? `*/${cadence} * * * *` : cadence < 1440 ? `0 */${cadence / 60} * * *` : "0 0 * * *",
    checkinMarginMinutes: Math.max(10, minutes + Math.abs(minutes - cadence)), maxRuntimeMinutes: Math.max(4, minutes) };
}
