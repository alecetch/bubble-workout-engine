import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { onlineManager } from "@tanstack/react-query";
import * as outbox from "./setLogOutbox";
import * as sender from "./setLogOutboxSender";
import { saveSegmentExerciseLogs } from "../api/segmentLog";
import { ApiError } from "../api/client";
import { logger } from "../utils/logger";
import { entry } from "./outboxTestFixture";
const store = vi.hoisted(() => new Map<string, string>());
vi.mock("../utils/persistentStorage", () => ({ isPersistentStorageAvailable: () => true, getPersistentStorage: () => ({
  getItem: async (k: string) => store.get(k) ?? null, setItem: async (k: string, v: string) => { store.set(k, v); }, removeItem: async (k: string) => { store.delete(k); },
}) }));
vi.mock("../api/client", () => ({ ApiError: class extends Error { constructor(public status: number, message: string) { super(message); } }, NetworkTimeoutError: class extends Error {} }));
vi.mock("../api/segmentLog", () => ({ saveSegmentExerciseLogs: vi.fn() }));
vi.mock("../utils/logger", () => ({ logger: { api: vi.fn() } }));
const send = vi.mocked(saveSegmentExerciseLogs);
const invalidateQueries = vi.fn();
let userId = "a";
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 18, 12));
  store.clear(); outbox._resetForTest(); sender._resetForTest(); vi.clearAllMocks(); userId = "a"; onlineManager.setOnline(true);
  send.mockReset().mockResolvedValue({ saved: 1, prs: [] });
  sender.initOutboxSender({ queryClient: { invalidateQueries }, getSession: () => ({ userId, isAuthenticated: true }) });
});
afterEach(() => { sender._resetForTest(); vi.useRealTimers(); onlineManager.setOnline(true); });
it("groups segment/date snapshots oldest first and invalidates all three query families", async () => {
  await outbox.enqueue("a", [entry({ key: "later", enqueuedAt: 3 }), entry({ key: "old", workoutSegmentId: "other", enqueuedAt: 1 }),
    entry({ key: "yesterday", localDate: "2026-11-17", enqueuedAt: 2 })]);
  await sender.flush("a");
  expect(send.mock.calls.map(([p]) => [p.workoutSegmentId, p.localDate])).toEqual([["other", "2026-11-18"], ["s", "2026-11-17"], ["s", "2026-11-18"]]);
  expect(await outbox.list("a")).toEqual([]);
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["yearProgress"] });
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["historyOverview"] });
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["segmentExerciseLogs", "s", "d"] });
});
for (const error of [new TypeError("offline"), new ApiError(503, "unavailable"), new ApiError(429, "limited")]) it(`retains transient ${error.constructor.name} and retries after 2s`, async () => {
  await outbox.enqueue("a", [entry()]); send.mockRejectedValueOnce(error);
  await sender.flush("a"); expect(await outbox.list("a")).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1999); expect(send).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(send).toHaveBeenCalledTimes(2); expect(await outbox.list("a")).toEqual([]);
});
for (const [status, reason] of [[402, "subscription"], [404, "not_found"], [400, "invalid"]] as const) it(`drops final ${status} rejection`, async () => {
  await outbox.enqueue("a", [entry()]); send.mockRejectedValue(new ApiError(status, "rejected")); await sender.flush("a");
  expect(await outbox.list("a")).toEqual([]); expect(logger.api).toHaveBeenCalledWith("set-outbox-dropped", { reason, count: 1 });
  if (status === 400) { expect(send).toHaveBeenCalledTimes(2); expect(send.mock.calls[1][0].localDate).toBeNull(); }
});
it("sends dates older than yesterday without date fields", async () => {
  await outbox.enqueue("a", [entry({ localDate: "2026-11-16" })]); await sender.flush("a"); expect(send.mock.calls[0][0].localDate).toBeNull();
});
it("skips offline and other users, and 401 keeps entries without timers", async () => {
  await outbox.enqueue("a", [entry()]); onlineManager.setOnline(false); await sender.flush("a");
  onlineManager.setOnline(true); userId = "b"; await sender.flush("a"); expect(send).not.toHaveBeenCalled();
  userId = "a"; send.mockRejectedValue(new ApiError(401, "auth")); await sender.flush("a");
  expect(await outbox.list("a")).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
});
it("coalesces concurrent triggers into one extra run and protects a later edit", async () => {
  await outbox.enqueue("a", [entry()]); let resolve!: (value: { saved: number; prs: [] }) => void;
  send.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const first = sender.flush("a"); await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  await outbox.enqueue("a", [entry({ updatedAt: 2, row: { ...entry().row, weightKg: 70 } })]);
  const second = sender.flush("a"); const third = sender.flush("a"); resolve({ saved: 1, prs: [] });
  await Promise.all([first, second, third]); expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1][0].rows[0].weightKg).toBe(70); expect(await outbox.list("a")).toEqual([]);
});
it("clear and sign-out cancel retry timers without deleting on sign-out", async () => {
  await outbox.enqueue("a", [entry()]); send.mockRejectedValue(new TypeError("network")); await sender.flush("a");
  sender.stopOutboxSender("a"); expect(vi.getTimerCount()).toBe(0); expect(await outbox.list("a")).toHaveLength(1);
  await sender.flush("a"); await outbox.clear("a"); expect(vi.getTimerCount()).toBe(0);
});
