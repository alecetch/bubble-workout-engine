import { describe, expect, it, vi } from "vitest";
import { toLocalIsoDate, localTrainingFields } from "./localDate";

describe("local training date", () => {
  it("uses local calendar components near midnight instead of the UTC date", () => {
    const date = new Date("2026-03-01T00:30Z");
    vi.spyOn(date, "getFullYear").mockReturnValue(2026);
    vi.spyOn(date, "getMonth").mockReturnValue(1);
    vi.spyOn(date, "getDate").mockReturnValue(28);
    expect(toLocalIsoDate(date)).toBe("2026-02-28");
  });

  it("sends a padded date and device timezone together", () => {
    expect(localTrainingFields()).toEqual({ local_date: toLocalIsoDate(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  });
});
