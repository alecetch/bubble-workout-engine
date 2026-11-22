/** @vitest-environment jsdom */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProgramDayFullResponse } from "../../../api/programViewer";
import { getExerciseComplete, setExerciseComplete } from "../../../utils/localWorkoutLog";
import { useLocalExerciseCompletion } from "./useLocalExerciseCompletion";

vi.mock("../../../utils/localWorkoutLog", () => ({
  getExerciseComplete: vi.fn(),
  setExerciseComplete: vi.fn().mockResolvedValue(undefined),
}));

type Exercise = ProgramDayFullResponse["segments"][number]["exercises"][number];

const getExerciseCompleteMock = vi.mocked(getExerciseComplete);

function exercise(id: string): Exercise {
  return {
    id,
    exerciseId: id,
    name: id,
    sets: 1,
  } as Exercise;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLocalExerciseCompletion", () => {
  it("loads completed exercise ids on mount", async () => {
    getExerciseCompleteMock.mockImplementation(async (_programDayId, exerciseId) => exerciseId === "ex-2");

    const { result } = renderHook(() =>
      useLocalExerciseCompletion([exercise("ex-1"), exercise("ex-2")], "day-1"),
    );

    await waitFor(() => expect(result.current.completedExerciseIds.has("ex-2")).toBe(true));

    expect(result.current.completedExerciseIds.has("ex-1")).toBe(false);
    expect(getExerciseCompleteMock).toHaveBeenCalledWith("day-1", "ex-1");
    expect(getExerciseCompleteMock).toHaveBeenCalledWith("day-1", "ex-2");
  });

  it("does not update state after unmount when completion promises resolve", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let resolveCompletion: (value: boolean) => void = () => undefined;
    getExerciseCompleteMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveCompletion = resolve;
      }),
    );

    const { result, unmount } = renderHook(() =>
      useLocalExerciseCompletion([exercise("ex-1")], "day-1"),
    );

    unmount();
    resolveCompletion(true);

    await Promise.resolve();

    expect(result.current.completedExerciseIds.size).toBe(0);
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("state update on an unmounted component"),
    );
  });
  it("restores logged exercises on a server-completed day but not exercises without rows",async()=>{
    getExerciseCompleteMock.mockResolvedValue(false);vi.mocked(setExerciseComplete).mockClear();
    const exercises=[{...exercise("ex-1"),sets:3},exercise("ex-2")];
    const serverRows=[{id:"saved",programExerciseId:"ex-1",orderIndex:1,weightKg:60,repsCompleted:5,rirActual:null}];
    const {result}=renderHook(()=>useLocalExerciseCompletion(exercises,"day-1",{serverDayComplete:true,serverRows}));
    await waitFor(()=>expect(result.current.completedExerciseIds.has("ex-1")).toBe(true));
    expect(result.current.completedExerciseIds.has("ex-2")).toBe(false);
    expect(setExerciseComplete).toHaveBeenCalledWith("day-1","ex-1",true);expect(setExerciseComplete).not.toHaveBeenCalledWith("day-1","ex-2",true);
  });
  it("all prescribed server sets complete an exercise even on an unfinished day",async()=>{
    getExerciseCompleteMock.mockResolvedValue(false);
    const exercises=[{...exercise("ex-1"),sets:3}];
    const serverRows=[1,2,3].map(orderIndex=>({id:`row-${orderIndex}`,programExerciseId:"ex-1",orderIndex,weightKg:60,repsCompleted:5,rirActual:null}));
    const {result}=renderHook(()=>useLocalExerciseCompletion(exercises,"day-1",{serverDayComplete:false,serverRows}));
    await waitFor(()=>expect(result.current.completedExerciseIds.has("ex-1")).toBe(true));
  });
  it("a local true survives stale incomplete server data without a spurious write",async()=>{
    getExerciseCompleteMock.mockResolvedValue(true);vi.mocked(setExerciseComplete).mockClear();
    const exercises=[exercise("ex-1")];
    const {result}=renderHook(()=>useLocalExerciseCompletion(exercises,"day-1",{serverDayComplete:false,serverRows:[]}));
    await waitFor(()=>expect(result.current.completedExerciseIds.has("ex-1")).toBe(true));expect(setExerciseComplete).not.toHaveBeenCalled();
  });
  it("requires every prescribed index, ignoring duplicates and phone-only ticks",async()=>{
    getExerciseCompleteMock.mockResolvedValue(false);vi.mocked(setExerciseComplete).mockClear();
    const exercises=[{...exercise("ex-1"),sets:3}];
    const rows=[1,1,3].map(orderIndex=>({id:String(orderIndex),programExerciseId:"ex-1",orderIndex,weightKg:60,repsCompleted:5,rirActual:null}));
    const view=renderHook(({serverRows})=>useLocalExerciseCompletion(exercises,"day-1",{serverRows}),{initialProps:{serverRows:rows}});
    await waitFor(()=>expect(getExerciseCompleteMock).toHaveBeenCalled());expect(view.result.current.completedExerciseIds.size).toBe(0);
    view.rerender({serverRows:[]});expect(view.result.current.completedExerciseIds.size).toBe(0);expect(setExerciseComplete).not.toHaveBeenCalled();
  });
  it("uses prescribed rounds instead of the exercise's one-set field",async()=>{
    getExerciseCompleteMock.mockResolvedValue(false);const exercises=[exercise("ex-1")];
    const rows=[1,2,3].map(orderIndex=>({id:String(orderIndex),programExerciseId:"ex-1",orderIndex,weightKg:60,repsCompleted:5,rirActual:null}));
    const view=renderHook(({serverRows})=>useLocalExerciseCompletion(exercises,"day-1",{prescribedSets:3,serverRows}),{initialProps:{serverRows:rows.slice(0,1)}});
    await waitFor(()=>expect(getExerciseCompleteMock).toHaveBeenCalled());expect(view.result.current.completedExerciseIds.size).toBe(0);
    view.rerender({serverRows:rows});await waitFor(()=>expect(view.result.current.completedExerciseIds.has("ex-1")).toBe(true));
  });

});
