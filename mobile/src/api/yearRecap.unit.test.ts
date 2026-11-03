import { expect, it, vi } from "vitest";
import { authGetJson } from "./client";
import { getYearRecap } from "./yearRecap";
vi.mock("./client", () => ({ authGetJson: vi.fn() }));
it("requests the selected recap with the device timezone through the authenticated client", async () => {
  vi.mocked(authGetJson).mockResolvedValue({ ok: true, year: 2026, count: 214 });
  expect(await getYearRecap(2026)).toEqual({ ok: true, year: 2026, count: 214 });
  expect(authGetJson).toHaveBeenCalledWith(`/api/users/me/year-recap?year=2026&timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")}`);
});
