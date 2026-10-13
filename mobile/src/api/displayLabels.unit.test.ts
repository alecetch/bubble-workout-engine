import { beforeEach, expect, it, vi } from "vitest";
import { authGetJson } from "./client";
import { getProgramDayFull, getProgramOverview } from "./programViewer";
import { getProgramCompletionSummary } from "./programCompletion";
import { fetchActivePrograms, fetchCombinedCalendar, fetchSessionsByDate } from "./activePrograms";
import { useSplitRecommendation } from "./hooks/programHooks";
import { useQuery } from "@tanstack/react-query";

vi.mock("./client", () => ({ authGetJson: vi.fn(), authPatchJson: vi.fn(), authPostJson: vi.fn() }));

const getJson = vi.mocked(authGetJson);
beforeEach(() => getJson.mockReset());

it("prefers API labels in overview and day responses while retaining slugs and stored titles", async () => {
  getJson.mockResolvedValueOnce({ program: { id: "p", program_type: "strength", program_type_label: "API Strength" } });
  const overview = await getProgramOverview("p", {});
  expect(overview.program.programTypeLabel).toBe("API Strength");
  getJson.mockResolvedValueOnce({ day: { program_day_id: "d", day_type: "strength", focus_type: "full", day_type_label: "API Strength", day_focus_label: "API Full Body", day_label: "Existing stored title" } });
  const { day } = await getProgramDayFull("d", {});
  expect(day.typeLabel).toBe("API Strength");
  expect(day.focusLabel).toBe("API Full Body");
  expect(day.type).toBe("strength");
  expect(day.label).toBe("Existing stored title");
});

it("falls back to semantic labels for older overview and day responses", async () => {
  getJson.mockResolvedValueOnce({ program: { id: "p", program_type: "hyrox" } });
  expect((await getProgramOverview("p", {})).program.programTypeLabel).toBe("HYROX");
  getJson.mockResolvedValueOnce({ day: { program_day_id: "d", day_type: "strength", focus_type: "full" } });
  const { day } = await getProgramDayFull("d", {});
  expect(day.typeLabel).toBe("Strength");
  expect(day.focusLabel).toBe("Full Body");
});

it.each([true, false])("normalizes labels across active programs, sessions and calendars (API label present: %s)", async hasLabel => {
  const row = { program_type: "hyrox", ...(hasLabel ? { program_type_label: "API HYROX" } : {}) };
  const expected = hasLabel ? "API HYROX" : "HYROX";
  getJson.mockResolvedValueOnce({ programs: [row], today_sessions: [row] });
  const active = await fetchActivePrograms();
  expect(active.programs[0].programTypeLabel).toBe(expected);
  expect(active.programs[0].program_type).toBe("hyrox");
  expect(active.today_sessions[0].programTypeLabel).toBe(expected);
  getJson.mockResolvedValueOnce({ days: [{ sessions: [row] }] });
  expect((await fetchCombinedCalendar()).days[0].sessions[0].programTypeLabel).toBe(expected);
  getJson.mockResolvedValueOnce({ sessions: [row] });
  expect((await fetchSessionsByDate("2026-10-13")).sessions[0].programTypeLabel).toBe(expected);
});

it.each([true, false])("normalizes completion labels (API label present: %s)", async hasLabel => {
  getJson.mockResolvedValueOnce({ program_type: "hyrox", ...(hasLabel ? { program_type_label: "API HYROX" } : {}) });
  const summary = await getProgramCompletionSummary("p");
  expect(summary.programTypeLabel).toBe(hasLabel ? "API HYROX" : "HYROX");
  expect(summary.programType).toBe("hyrox");
});

it.each([true, false])("normalizes split recommendation labels (API label present: %s)", async hasLabel => {
  getJson.mockResolvedValueOnce({ programType: "hyrox", ...(hasLabel ? { program_type_label: "API HYROX" } : {}) });
  // The global query mock captures options without rendering a component.
  useSplitRecommendation({ programType: "hyrox", daysPerWeek: 3 });
  const options = vi.mocked(useQuery).mock.calls.at(-1)?.[0];
  const result = await (options?.queryFn as () => Promise<{ programTypeLabel: string }>)();
  expect(result.programTypeLabel).toBe(hasLabel ? "API HYROX" : "HYROX");
});
