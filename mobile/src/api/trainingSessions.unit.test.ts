import { beforeEach, expect, it, vi } from "vitest";
import { authDeleteJson, authGetJson } from "./client";
import { deleteOutsideSession, getOutsideSessions } from "./trainingSessions";

vi.mock("./client", () => ({ authGetJson: vi.fn(), authDeleteJson: vi.fn(), authPostJson: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it("loads manual sessions for the selected year through the authenticated client", async () => {
  const sessions = [{ id: "one", local_date: "2026-11-03", activity_type: "run", duration_min: 40 }];
  vi.mocked(authGetJson).mockResolvedValue({ ok: true, sessions });
  expect(await getOutsideSessions(2026)).toEqual(sessions);
  expect(authGetJson).toHaveBeenCalledWith("/api/users/me/training-sessions?source=manual&year=2026");
  await getOutsideSessions();
  expect(authGetJson).toHaveBeenLastCalledWith("/api/users/me/training-sessions?source=manual");
});
it("deletes via the authenticated client, accepts 204 and propagates failures", async () => {
  vi.mocked(authDeleteJson).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Not found"));
  await expect(deleteOutsideSession("id/one")).resolves.toBeUndefined();
  expect(authDeleteJson).toHaveBeenCalledWith("/api/users/me/training-sessions/id%2Fone");
  await expect(deleteOutsideSession("missing")).rejects.toThrow("Not found");
});
