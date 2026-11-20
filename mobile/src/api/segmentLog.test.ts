import { beforeEach, expect, it, vi } from "vitest";
import { authGetJson, authPostJson } from "./client";
import { getSegmentExerciseLogs, saveSegmentExerciseLogs } from "./segmentLog";
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

it("normalizes nullable saved rows and scopes the read to the requested session", async () => {
  vi.mocked(authGetJson).mockResolvedValueOnce({ rows: [{ id: 42, program_exercise_id: "row", weight_kg: "50", reps_completed: "8", rir_actual: "2", order_index: "1" }, {}] });
  expect(await getSegmentExerciseLogs({ userId: "user", workoutSegmentId: "segment", programDayId: "day" })).toEqual([
    { id: "42", programExerciseId: "row", weightKg: 50, repsCompleted: 8, rirActual: 2, orderIndex: 1 },
    { id: undefined, programExerciseId: "", weightKg: null, repsCompleted: null, rirActual: null, orderIndex: 0 },
  ]);
  expect(authGetJson).toHaveBeenCalledWith("/api/segment-log?user_id=user&workout_segment_id=segment&program_day_id=day");
  vi.mocked(authGetJson).mockResolvedValueOnce({ rows: null });
  expect(await getSegmentExerciseLogs({ workoutSegmentId: "segment", programDayId: "day" })).toEqual([]);
});
it("preserves save ownership and normalizes PR aliases from successful responses", async () => {
  vi.mocked(authPostJson).mockResolvedValueOnce({ saved: "1", prs: [{ program_exercise_id: "a", estimated_1rm_kg: "70" }, { programExerciseId: "b", estimated1rmKg: 80 }, {}] });
  const result = await saveSegmentExerciseLogs({ ...payload, userId: "user", rows: [{ programExerciseId: "a", orderIndex: 1, weightKg: 50, repsCompleted: 8, rirActual: null }] });
  expect(authPostJson).toHaveBeenLastCalledWith("/api/segment-log", expect.objectContaining({ user_id: "user", rows: [{ program_exercise_id: "a", order_index: 1, weight_kg: 50, reps_completed: 8, rir_actual: null }] }), { expectedUserId: "user" });
  expect(result).toEqual({ saved: 1, prs: [{ programExerciseId: "a", estimated1rmKg: 70 }, { programExerciseId: "b", estimated1rmKg: 80 }, { programExerciseId: "", estimated1rmKg: 0 }] });
});
