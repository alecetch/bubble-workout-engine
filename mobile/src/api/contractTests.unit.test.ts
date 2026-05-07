import { beforeEach, describe, expect, it, vi } from "vitest";
import activeProgramsFixture from "./__fixtures__/activePrograms.json";
import historyTimelineFixture from "./__fixtures__/historyTimeline.json";
import programDayFullFixture from "./__fixtures__/programDayFull.json";
import programEndCheckFixture from "./__fixtures__/programEndCheck.json";
import programOverviewFixture from "./__fixtures__/programOverview.json";
import prsFeedFixture from "./__fixtures__/prsFeed.json";
import sessionHistoryMetricsFixture from "./__fixtures__/sessionHistoryMetrics.json";
import { authGetJson } from "./client";
import { fetchActivePrograms } from "./activePrograms";
import {
  normalizePrsFeed,
  normalizeSessionHistoryMetrics,
  normalizeTimeline,
} from "./historyNormalizers";
import { getProgramEndCheck } from "./programCompletion";
import { getProgramDayFull, getProgramOverview } from "./programViewer";

vi.mock("./client", () => ({
  authGetJson: vi.fn(),
  authPatchJson: vi.fn(),
  authPostJson: vi.fn(),
}));

const authGetJsonMock = vi.mocked(authGetJson);

function stubAuthGetJson(responseBody: unknown) {
  authGetJsonMock.mockResolvedValueOnce(responseBody);
}

describe("mobile API contract normalizers", () => {
  beforeEach(() => {
    authGetJsonMock.mockReset();
  });

  describe("program overview", () => {
    it("maps program title from the raw program payload", async () => {
      stubAuthGetJson(programOverviewFixture);

      const result = await getProgramOverview("prog-1", {});

      expect(result.program.title).toBe("Strength Block");
    });

    it("maps week_number to weekNumber", async () => {
      stubAuthGetJson(programOverviewFixture);

      const result = await getProgramOverview("prog-1", {});

      expect(result.weeks[0].weekNumber).toBe(1);
    });

    it("maps nested calendar day program_day_id to programDayId", async () => {
      stubAuthGetJson(programOverviewFixture);

      const result = await getProgramOverview("prog-1", {});

      expect(result.calendarDays[0].programDayId).toBe("day-1");
    });

    it("preserves null hero media from the raw program payload", async () => {
      stubAuthGetJson(programOverviewFixture);

      const result = await getProgramOverview("prog-1", {});

      expect(result.program.heroMedia).toBeNull();
    });
  });

  describe("program day full", () => {
    it("maps day_label to day.label", async () => {
      stubAuthGetJson(programDayFullFixture);

      const result = await getProgramDayFull("day-1", {});

      expect(result.day.label).toBe("Lower Body");
    });

    it("normalizes adaptation_decision snake_case fields", async () => {
      stubAuthGetJson(programDayFullFixture);

      const result = await getProgramDayFull("day-1", {});

      expect(result.segments[0].exercises[0].adaptationDecision?.outcome).toBe("increase_load");
      expect(result.segments[0].exercises[0].adaptationDecision?.primaryLever).toBe("load");
    });

    it("returns null adaptationDecision when adaptation_decision is null", async () => {
      stubAuthGetJson(programDayFullFixture);

      const result = await getProgramDayFull("day-1", {});

      expect(result.segments[0].exercises[1].adaptationDecision).toBeNull();
    });

    it("maps coaching_cues_json arrays without dropping cue text", async () => {
      stubAuthGetJson(programDayFullFixture);

      const result = await getProgramDayFull("day-1", {});

      expect(result.segments[0].exercises[0].coachingCuesJson?.[0]).toBe("Brace your core");
    });
  });

  describe("active programs", () => {
    it("maps primary_program_id from the active programs payload", async () => {
      stubAuthGetJson(activeProgramsFixture);

      const result = await fetchActivePrograms();

      expect(result.primary_program_id).toBe("prog-1");
    });

    it("maps programs array with is_primary booleans", async () => {
      stubAuthGetJson(activeProgramsFixture);

      const result = await fetchActivePrograms();

      expect(result.programs[0].is_primary).toBe(true);
      expect(result.programs[1].is_primary).toBe(false);
    });

    it("returns an empty programs array when the API returns no programs", async () => {
      stubAuthGetJson({ ...activeProgramsFixture, primary_program_id: null, programs: [] });

      const result = await fetchActivePrograms();

      expect(result.programs).toHaveLength(0);
    });
  });

  describe("session history metrics", () => {
    it("maps sessions_count to sessionsCount", () => {
      const result = normalizeSessionHistoryMetrics(sessionHistoryMetricsFixture);

      expect(result.sessionsCount).toBe(12);
    });

    it("normalizes nested strength_upper_28d.best_e1rm_kg", () => {
      const result = normalizeSessionHistoryMetrics(sessionHistoryMetricsFixture);

      expect(result.strengthUpper28d?.bestE1rmKg).toBe(100);
    });

    it("returns null for a null strength region", () => {
      const result = normalizeSessionHistoryMetrics(sessionHistoryMetricsFixture);

      expect(result.strengthLower28d).toBeNull();
    });
  });

  describe("PR feed", () => {
    it("maps estimated_e1rm_kg to estimatedE1rmKg", () => {
      const result = normalizePrsFeed(prsFeedFixture);

      expect(result.rows[0].estimatedE1rmKg).toBe(117);
    });

    it("preserves PR row count", () => {
      const result = normalizePrsFeed(prsFeedFixture);

      expect(result.rows).toHaveLength(prsFeedFixture.rows.length);
    });
  });

  describe("history timeline", () => {
    it("maps next_cursor to nextCursor", () => {
      const result = normalizeTimeline(historyTimelineFixture);

      expect(result.nextCursor?.cursorId).toBe("cursor-abc123");
    });

    it("maps timeline day_label to dayLabel", () => {
      const result = normalizeTimeline(historyTimelineFixture);

      expect(result.items[0].dayLabel).toBe("Lower Body");
    });
  });

  describe("program end check", () => {
    it("maps lifecycle_status to lifecycleStatus", async () => {
      stubAuthGetJson(programEndCheckFixture);

      const result = await getProgramEndCheck("prog-1");

      expect(result.lifecycleStatus).toBe("completed");
    });

    it("maps completion counters and skip eligibility", async () => {
      stubAuthGetJson(programEndCheckFixture);

      const result = await getProgramEndCheck("prog-1");

      expect(result.completedDays).toBe(22);
      expect(result.canCompleteWithSkips).toBe(true);
    });
  });
});
