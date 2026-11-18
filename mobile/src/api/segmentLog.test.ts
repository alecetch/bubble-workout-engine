import { beforeEach, expect, it, vi } from "vitest";
import { authPostJson } from "./client";
import { saveSegmentExerciseLogs } from "./segmentLog";
vi.mock("./client", () => ({ authGetJson: vi.fn(), authPostJson: vi.fn(async () => ({ saved: 1 })) }));
vi.mock("../utils/localDate", () => ({ localTrainingFields: () => ({ local_date: "2026-11-18", timezone: "UTC" }) }));
const payload = { programId: "p", programDayId: "d", workoutSegmentId: "s", rows: [] };
beforeEach(() => vi.clearAllMocks());
it("sends the captured date and timezone", async () => {
  await saveSegmentExerciseLogs({ ...payload, localDate: "2026-11-17", timeZone: "Europe/London" });
  expect(authPostJson).toHaveBeenCalledWith("/api/segment-log", expect.objectContaining({ local_date: "2026-11-17", timezone: "Europe/London" }), expect.anything());
});
it("omits both date fields for null and retains defaults for existing callers", async () => {
  await saveSegmentExerciseLogs({ ...payload, localDate: null, timeZone: "UTC" });
  const body = vi.mocked(authPostJson).mock.calls[0][1];
  expect(body).not.toHaveProperty("local_date"); expect(body).not.toHaveProperty("timezone");
  await saveSegmentExerciseLogs(payload);
  expect(vi.mocked(authPostJson).mock.calls[1][1]).toMatchObject({ local_date: "2026-11-18", timezone: "UTC" });
});
