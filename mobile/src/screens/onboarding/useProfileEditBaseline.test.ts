/** @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useClientProfile } from "../../api/hooks";
import { useProfileEditBaseline } from "./useProfileEditBaseline";

vi.mock("../../api/hooks", () => ({ useClientProfile: vi.fn() }));

it("freezes the original equipment and day count across profile cache updates", () => {
  const items = ["barbell", "bench"];
  vi.mocked(useClientProfile).mockReturnValue({ data: { equipmentPreset: "gym", equipmentItemCodes: items, preferredDays: ["Mon", "Wed"] } } as any);
  const { result, rerender } = renderHook(() => useProfileEditBaseline("profile-1", true));
  items.push("cable");
  vi.mocked(useClientProfile).mockReturnValue({ data: { equipmentPreset: "home", equipmentItemCodes: [], preferredDays: ["Fri"] } } as any);
  rerender();
  expect(result.current).toEqual({ preset: "gym", items: ["barbell", "bench"], dayCount: 2 });
});

it("does not request a profile during first-run onboarding", () => {
  vi.mocked(useClientProfile).mockReturnValue({ data: undefined } as any);
  const { result } = renderHook(() => useProfileEditBaseline("profile-1", false));
  expect(useClientProfile).toHaveBeenLastCalledWith(null);
  expect(result.current).toBeNull();
});
