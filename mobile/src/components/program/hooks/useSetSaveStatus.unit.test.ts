import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { onlineManager } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import { useSetSaveStatus } from "./useSetSaveStatus";
const payload = { programId: "p", programDayId: "d", workoutSegmentId: "s", rows: [
  { programExerciseId: "e", orderIndex: 1, weightKg: 50, repsCompleted: 8, rirActual: 2 },
] };
const saved = { saved: 1, prs: [] };
afterEach(() => onlineManager.setOnline(true));

describe("useSetSaveStatus", () => {
  it("tracks saving to confirmed, prevents duplicate sends and counts unsaved rows", async () => {
    let resolve!: (value: typeof saved) => void;
    const save = vi.fn(() => new Promise<typeof saved>(r => { resolve = r; }));
    const onSaved = vi.fn();
    const { result } = renderHook(() => useSetSaveStatus({ save, onSaved }));
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.saveRows(payload); });
    expect(result.current.statuses["e:0"]).toBe("saving");
    expect(result.current.unsavedCount).toBe(1);
    await act(async () => { await result.current.saveRows(payload); });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(saved); await pending; });
    expect(result.current.unsavedCount).toBe(0);
    expect(onSaved).toHaveBeenCalledWith(["e:0"]);
  });
  for (const edited of [false, true]) it(`retains failed payload and retries ${edited ? "edited" : "original"} values`, async () => {
    const save = vi.fn().mockRejectedValueOnce(new TypeError("network")).mockResolvedValue(saved);
    let currentRow = payload.rows[0];
    const { result } = renderHook(() => useSetSaveStatus({ save, getCurrentRow: () => currentRow }));
    await act(async () => { await expect(result.current.saveRows(payload)).rejects.toThrow(); });
    expect(result.current.statuses["e:0"]).toBe("failed");
    expect(result.current.unsavedCount).toBe(1);
    if (edited) currentRow = { ...currentRow, weightKg: 55, repsCompleted: 9 };
    await act(async () => { await result.current.retryFailed(); });
    expect(save).toHaveBeenLastCalledWith({ ...payload, rows: [currentRow] });
    expect(result.current.unsavedCount).toBe(0);
  });
  it("transitions waiting to saving to confirmed on reconnect", async () => {
    onlineManager.setOnline(false);
    let resolve!: (value: typeof saved) => void;
    const save = vi.fn(() => new Promise<typeof saved>(r => { resolve = r; }));
    const { result } = renderHook(() => useSetSaveStatus({ save }));
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.saveRows(payload); });
    expect(result.current.statuses["e:0"]).toBe("waiting");
    act(() => onlineManager.setOnline(true));
    expect(result.current.statuses["e:0"]).toBe("saving");
    await act(async () => { resolve(saved); await pending; });
    expect(result.current.unsavedCount).toBe(0);
  });
  it("402 clears pending status without confirming the row", async () => {
    const onSaved = vi.fn();
    const { result } = renderHook(() => useSetSaveStatus({ save: vi.fn().mockRejectedValue(new ApiError(402, "subscription")), onSaved }));
    await act(async () => { await expect(result.current.saveRows(payload)).rejects.toThrow(); });
    expect(result.current.unsavedCount).toBe(0);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
