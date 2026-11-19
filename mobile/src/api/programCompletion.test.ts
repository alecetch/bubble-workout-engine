import { beforeEach, expect, it, vi } from "vitest";
import { authGetJson, authPostJson } from "./client";
import { getProgramEndCheck, getProgramCompletionSummary, completeProgram } from "./programCompletion";
vi.mock("./client", () => ({ authGetJson: vi.fn(), authPostJson: vi.fn() }));
vi.mock("../utils/localDate", () => ({ toLocalIsoDate: () => "2026-05-01", deviceTimeZone: () => "Europe/London" }));
beforeEach(() => { vi.mocked(authGetJson).mockReset(); vi.mocked(authPostJson).mockReset().mockResolvedValue({ ok: true }); });
it("defaults additive fields safely for old servers", async () => {
  vi.mocked(authGetJson).mockResolvedValue({});
  expect(await getProgramEndCheck("p")).toMatchObject({ lastScheduledDate: null, scheduleEnded: false, daysSinceLastSession: null });
  expect((await getProgramCompletionSummary("p")).lapsed).toBe(false);
});
it("parses ended schedules and lapse metadata", async () => {
  vi.mocked(authGetJson).mockResolvedValue({ last_scheduled_date: "2026-04-28", schedule_ended: true, days_since_last_session: 25, lapsed: true });
  expect(await getProgramEndCheck("p")).toMatchObject({ lastScheduledDate: "2026-04-28", scheduleEnded: true, daysSinceLastSession: 25 });
  expect((await getProgramCompletionSummary("p")).lapsed).toBe(true);
});
it("rejects malformed optional numbers and dates safely", async () => {
  vi.mocked(authGetJson).mockResolvedValue({ last_scheduled_date: 3, days_since_last_session: "invalid", schedule_ended: "true" });
  expect(await getProgramEndCheck("p")).toMatchObject({ lastScheduledDate: null, scheduleEnded: false, daysSinceLastSession: null });
});
it("sends captured device date and timezone on both reads and completion", async () => {
  vi.mocked(authGetJson).mockResolvedValue({});
  await getProgramEndCheck("p"); await getProgramCompletionSummary("p"); await completeProgram("p", "with_skips");
  expect(authGetJson).toHaveBeenCalledWith("/api/program/p/end-check?local_date=2026-05-01&timezone=Europe%2FLondon");
  expect(authGetJson).toHaveBeenCalledWith("/api/program/p/completion-summary?local_date=2026-05-01&timezone=Europe%2FLondon");
  expect(authPostJson).toHaveBeenCalledWith("/api/program/p/complete", { mode: "with_skips", local_date: "2026-05-01", timezone: "Europe/London" });
});
