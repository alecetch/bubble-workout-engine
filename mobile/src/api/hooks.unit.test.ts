import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  queryKeys,
  useActivePrograms,
  useProgramDayFull,
  useProgramOverview,
  useSetPrimaryProgram,
  useUpdateNotificationPreferences,
} from "./hooks";
import { fetchActivePrograms, setPrimaryProgram } from "./activePrograms";
import { updateNotificationPreferences } from "./notifications";
import { getProgramDayFull, getProgramOverview } from "./programViewer";

vi.unmock("@tanstack/react-query");

vi.mock("./programViewer", () => ({
  getProgramOverview: vi.fn(),
  getProgramDayFull: vi.fn(),
  markProgramDayComplete: vi.fn(),
}));

vi.mock("./activePrograms", () => ({
  fetchActivePrograms: vi.fn(),
  fetchCombinedCalendar: vi.fn(),
  fetchSessionsByDate: vi.fn(),
  setPrimaryProgram: vi.fn(),
}));

vi.mock("./notifications", () => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));

const getProgramOverviewMock = vi.mocked(getProgramOverview);
const getProgramDayFullMock = vi.mocked(getProgramDayFull);
const fetchActiveProgramsMock = vi.mocked(fetchActivePrograms);
const setPrimaryProgramMock = vi.mocked(setPrimaryProgram);
const updateNotificationPreferencesMock = vi.mocked(updateNotificationPreferences);

const programOverviewFixture = {
  program: { id: "prog-1", title: "Program" },
  weeks: [],
  calendarDays: [],
};

const activeProgramsFixture = {
  ok: true,
  primary_program_id: "prog-1",
  programs: [],
  today_sessions: [],
};

const notificationPreferencesFixture = {
  reminderEnabled: true,
  reminderTimeLocalHhmm: "08:00",
  reminderTimezone: "Europe/London",
  prNotificationEnabled: true,
  deloadNotificationEnabled: true,
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function makeWrapper(client = createQueryClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

describe("api hooks", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    getProgramOverviewMock.mockReset();
    getProgramOverviewMock.mockResolvedValue(programOverviewFixture as any);
    getProgramDayFullMock.mockReset();
    getProgramDayFullMock.mockResolvedValue({ day: { id: "day-1" }, segments: [] } as any);
    fetchActiveProgramsMock.mockReset();
    fetchActiveProgramsMock.mockResolvedValue(activeProgramsFixture);
    setPrimaryProgramMock.mockReset();
    setPrimaryProgramMock.mockResolvedValue({ ok: true, primary_program_id: "prog-2" });
    updateNotificationPreferencesMock.mockReset();
    updateNotificationPreferencesMock.mockResolvedValue(notificationPreferencesFixture);
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe("queryKey shapes", () => {
    it("queryKeys.programOverview includes programId and userId", () => {
      expect(queryKeys.programOverview("prog-1", { userId: "u-1" })).toEqual([
        "programOverview",
        "prog-1",
        "u-1",
      ]);
    });

    it("queryKeys.programOverview substitutes null for missing userId", () => {
      expect(queryKeys.programOverview("prog-1", {})[2]).toBeNull();
    });

    it("queryKeys.programDayFull includes programDayId and userId", () => {
      expect(queryKeys.programDayFull("day-1", { userId: "u-1" })).toEqual([
        "programDayFull",
        "day-1",
        "u-1",
      ]);
    });
  });

  describe("enabled conditions", () => {
    it("useProgramOverview does not fetch when programId is empty", async () => {
      renderHook(() => useProgramOverview("", { userId: "u-1" }), {
        wrapper: makeWrapper(queryClient),
      });

      await waitFor(() => {
        expect(getProgramOverviewMock).not.toHaveBeenCalled();
      });
    });

    it("useProgramOverview does not fetch when userId is missing", async () => {
      renderHook(() => useProgramOverview("prog-1", {}), {
        wrapper: makeWrapper(queryClient),
      });

      await waitFor(() => {
        expect(getProgramOverviewMock).not.toHaveBeenCalled();
      });
    });

    it("useProgramDayFull does not fetch when programDayId is falsy", async () => {
      renderHook(() => useProgramDayFull(undefined as any, { userId: "u-1" }), {
        wrapper: makeWrapper(queryClient),
      });

      await waitFor(() => {
        expect(getProgramDayFullMock).not.toHaveBeenCalled();
      });
    });
  });

  describe("staleTime values", () => {
    it("useProgramOverview serves cached data within the 5-minute staleTime window", async () => {
      queryClient.setQueryData(
        queryKeys.programOverview("prog-1", { userId: "u-1" }),
        programOverviewFixture,
        { updatedAt: Date.now() - 4 * 60 * 1000 },
      );

      const { result } = renderHook(() => useProgramOverview("prog-1", { userId: "u-1" }), {
        wrapper: makeWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.data).toEqual(programOverviewFixture);
      });
      expect(getProgramOverviewMock).not.toHaveBeenCalled();
    });

    it("useActivePrograms re-fetches after the 1-minute staleTime expires", async () => {
      queryClient.setQueryData(queryKeys.activePrograms, activeProgramsFixture, {
        updatedAt: Date.now() - 61 * 1000,
      });

      renderHook(() => useActivePrograms(), {
        wrapper: makeWrapper(queryClient),
      });

      await waitFor(() => {
        expect(fetchActiveProgramsMock).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("mutation cache invalidation", () => {
    it("useSetPrimaryProgram invalidates activePrograms on success", async () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(() => useSetPrimaryProgram(), {
        wrapper: makeWrapper(queryClient),
      });

      await result.current.mutateAsync("prog-2");

      expect(setPrimaryProgramMock).toHaveBeenCalledTimes(1);
      expect(setPrimaryProgramMock.mock.calls[0][0]).toBe("prog-2");
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.activePrograms });
    });

    it("useUpdateNotificationPreferences rolls back optimistic update on error", async () => {
      queryClient.setQueryData(queryKeys.notificationPreferences, notificationPreferencesFixture);
      updateNotificationPreferencesMock.mockRejectedValueOnce(new Error("save failed"));
      const { result } = renderHook(() => useUpdateNotificationPreferences(), {
        wrapper: makeWrapper(queryClient),
      });

      await expect(result.current.mutateAsync({ reminderEnabled: false })).rejects.toThrow("save failed");

      expect(queryClient.getQueryData(queryKeys.notificationPreferences)).toEqual(notificationPreferencesFixture);
    });
  });
});
