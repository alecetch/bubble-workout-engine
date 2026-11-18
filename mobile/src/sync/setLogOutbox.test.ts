import { beforeEach, expect, it, vi } from "vitest";
import * as outbox from "./setLogOutbox";
import { entry } from "./outboxTestFixture";
const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  return { data, getItem: vi.fn(async (key: string) => data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { data.set(key, value); }), removeItem: vi.fn() };
});
vi.mock("../utils/persistentStorage", () => ({ getPersistentStorage: () => storage, isPersistentStorageAvailable: () => true }));
vi.mock("../utils/logger", () => ({ logger: { api: vi.fn() } }));
beforeEach(() => { storage.data.clear(); storage.setItem.mockClear(); outbox._resetForTest(); });
it("survives a module restart and isolates users", async () => {
  await outbox.enqueue("a", [entry()]); outbox._resetForTest();
  expect(await outbox.list("a")).toEqual([entry()]); expect(await outbox.list("b")).toEqual([]);
});
it("merges latest values, keeps the first enqueue, resets attempts and protects edits from older sends", async () => {
  await outbox.enqueue("a", [entry()]); await outbox.markAttempt("a", [entry().key], { type: "TypeError" });
  const edited = entry({ updatedAt: 2, enqueuedAt: 2, row: { ...entry().row, weightKg: 60 } });
  await outbox.enqueue("a", [edited]); await outbox.remove("a", [edited.key], { ifUpdatedAt: { [edited.key]: 1 } });
  expect(await outbox.list("a")).toEqual([{ ...edited, enqueuedAt: 1 }]);
  await outbox.remove("a", [edited.key], { ifUpdatedAt: { [edited.key]: 2 } }); expect(await outbox.list("a")).toEqual([]);
});
it("serializes simultaneous edits including same-millisecond edits", async () => {
  await Promise.all([outbox.enqueue("a", [entry()]), outbox.enqueue("a", [entry({ row: { ...entry().row, repsCompleted: 10 } })])]);
  expect((await outbox.list("a"))[0]).toMatchObject({ updatedAt: 2, row: { repsCompleted: 10 } });
});
it("prunes only entries older than fourteen days", async () => {
  const now = 15 * 86400000;
  await outbox.enqueue("a", [entry(), entry({ key: "new", enqueuedAt: now - 1000 })]);
  await outbox.pruneExpired("a", now); expect((await outbox.list("a")).map(e => e.key)).toEqual(["new"]);
});
it("does not throw when persistence fails and disables durable claims", async () => {
  storage.setItem.mockRejectedValueOnce(new Error("full"));
  await expect(outbox.enqueue("a", [entry()])).resolves.toEqual([]); expect(outbox.isOutboxAvailable()).toBe(false);
});
