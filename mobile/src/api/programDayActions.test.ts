import { describe, it, expect, vi } from "vitest";
import { startEquipmentSubstitution } from "./programDayActions";
import { authPostJson } from "./client";
vi.mock("./client", () => ({ authPostJson: vi.fn(), authGetJson: vi.fn() }));
describe("startEquipmentSubstitution", () => {
  it("passes through final result fields", async () => {
    const result = { jobId: "job", status: "partial", swappedCount: 2, warnings: [{ programExerciseId: "row", exerciseId: "exercise" }], unsubstitutedExerciseIds: ["exercise"], error: null };
    vi.mocked(authPostJson).mockResolvedValueOnce({ ok: true, ...result });
    expect(await startEquipmentSubstitution("program", ["bodyweight"])).toEqual(result);
  });
  it("leaves optional fields undefined for older APIs", async () => {
    vi.mocked(authPostJson).mockResolvedValueOnce({ ok: true, jobId: "job" });
    const result = await startEquipmentSubstitution("program", ["bodyweight"]);
    expect(result.jobId).toBe("job");
    for (const key of ["status", "swappedCount", "warnings", "unsubstitutedExerciseIds", "error"] as const) expect(result[key]).toBeUndefined();
  });
});
