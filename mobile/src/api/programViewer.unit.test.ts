import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProgramOverview } from "./programViewer";
import { authGetJson } from "./client";

vi.mock("./client", () => ({
  authGetJson: vi.fn(),
  authPatchJson: vi.fn(),
}));

const authGetJsonMock = vi.mocked(authGetJson);

function rawOverview(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    program: { id: "prog-1", title: "Strength Block", summary: "Build" },
    weeks: [{ id: "week-1", week_number: 1, focus: "Base" }],
    calendar_days: [
      {
        id: "cal-1",
        calendar_date: "2026-05-01",
        program_day_id: "day-1",
        is_training_day: true,
        week_number: 1,
      },
    ],
    selected_day: {
      program_day_id: "day-1",
      day_label: "Day 1",
      day_type: "strength",
      session_duration_mins: 45,
      equipment_slugs: ["barbell"],
    },
    ...overrides,
  };
}

describe("programViewer overview normalization", () => {
  beforeEach(() => {
    authGetJsonMock.mockReset();
  });

  it("normalizes a complete overview response", async () => {
    authGetJsonMock.mockResolvedValueOnce(rawOverview());
    const overview = await getProgramOverview("prog-1", {});
    expect(overview.program.title).toBe("Strength Block");
    expect(overview.weeks).toHaveLength(1);
    expect(overview.calendarDays).toHaveLength(1);
  });

  it("maps is_skipped to isSkipped", async () => {
    authGetJsonMock.mockResolvedValueOnce(
      rawOverview({ calendar_days: [{ calendar_date: "2026-05-01", program_day_id: "day-1", is_skipped: true }] }),
    );
    const overview = await getProgramOverview("prog-1", {});
    expect(overview.calendarDays[0].isSkipped).toBe(true);
  });

  it("defaults missing is_skipped to false", async () => {
    authGetJsonMock.mockResolvedValueOnce(rawOverview());
    const overview = await getProgramOverview("prog-1", {});
    expect(overview.calendarDays[0].isSkipped).toBe(false);
  });

  it("defaults missing calendar days to an empty array", async () => {
    authGetJsonMock.mockResolvedValueOnce(rawOverview({ calendar_days: undefined }));
    const overview = await getProgramOverview("prog-1", {});
    expect(overview.calendarDays).toEqual([]);
  });

  it("falls back from scheduled_date to calendar_date", async () => {
    authGetJsonMock.mockResolvedValueOnce(
      rawOverview({
        calendar_days: [
          {
            scheduled_date: null,
            calendar_date: "2026-05-01",
            program_day_id: "day-1",
          },
        ],
      }),
    );
    const overview = await getProgramOverview("prog-1", {});
    expect(overview.calendarDays[0].scheduledDate).toBe("2026-05-01");
  });

  it("handles a null selectedDayPreview without crashing", async () => {
    authGetJsonMock.mockResolvedValueOnce(rawOverview({ selected_day: null }));
    const overview = await getProgramOverview("prog-1", {});
    expect(overview.selectedDayPreview).toBeUndefined();
  });

  it("normalizes equipment slugs on the selected day preview", async () => {
    authGetJsonMock.mockResolvedValueOnce(
      rawOverview({ selected_day: { program_day_id: "day-1", equipment_slugs: ["rack", "bands"] } }),
    );
    const overview = await getProgramOverview("prog-1", {});
    expect(overview.selectedDayPreview?.equipmentSlugs).toEqual(["rack", "bands"]);
  });

  it("coerces numeric session duration strings", async () => {
    authGetJsonMock.mockResolvedValueOnce(
      rawOverview({ selected_day: { program_day_id: "day-1", session_duration: "45" } }),
    );
    const overview = await getProgramOverview("prog-1", {});
    expect(overview.selectedDayPreview?.sessionDuration).toBe(45);
  });
});
