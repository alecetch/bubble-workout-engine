import React from "react";
import { axe } from "jest-axe";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnitPickerScreen } from "./UnitPickerScreen";
import { getPreferredHeightUnit, getPreferredUnit, updatePreferredHeightUnit, updatePreferredUnit } from "../../api/profileApi";
import { createTestQueryClient, renderWithProviders } from "../../__test-utils__";

vi.unmock("@tanstack/react-query");
vi.mock("../../api/profileApi", () => ({
  getPreferredUnit: vi.fn(), getPreferredHeightUnit: vi.fn(),
  updatePreferredUnit: vi.fn(), updatePreferredHeightUnit: vi.fn(),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: ({ name }: any) => <span data-testid={name} /> }));
vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityRole, accessibilityState, accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" role={accessibilityRole} aria-checked={accessibilityState?.checked}
      aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>{children}</button>
  ),
}));

function renderScreen(cached = true) {
  const queryClient = createTestQueryClient();
  if (cached) {
    queryClient.setQueryData(["preferredUnit"], "lbs");
    queryClient.setQueryData(["preferredHeightUnit"], "cm");
  }
  const navigation = { goBack: vi.fn() };
  renderWithProviders(<UnitPickerScreen navigation={navigation as any}
    route={{ params: { currentUnit: "lbs", currentHeightUnit: "cm" } } as any} />, { queryClient });
  return queryClient;
}
const row = (label: RegExp) => screen.getByRole("radio", { name: label });
const cases = [
  { label: /kg.*Kilograms/, original: /lb.*Pounds/, update: updatePreferredUnit, key: "preferredUnit", next: "kg", previous: "lbs" },
  { label: /ft.*Feet/, original: /cm.*Centimetres/, update: updatePreferredHeightUnit, key: "preferredHeightUnit", next: "ft", previous: "cm" },
];

describe("UnitPickerScreen", () => {
  beforeEach(() => {
    vi.mocked(updatePreferredUnit).mockReset().mockResolvedValue(undefined);
    vi.mocked(updatePreferredHeightUnit).mockReset().mockResolvedValue(undefined);
    vi.mocked(getPreferredUnit).mockReset().mockResolvedValue("lbs");
    vi.mocked(getPreferredHeightUnit).mockReset().mockResolvedValue("cm");
  });
  it("has no accessibility violations and explains shared units", async () => {
    renderScreen();
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
    expect(screen.getByText("Used for body weight and training weights.")).toBeInTheDocument();
    expect(screen.getByText("Weights and heights are shown and entered in the units you choose. Your saved history isn't changed.")).toBeInTheDocument();
    expect(getPreferredUnit).not.toHaveBeenCalled();
    expect(getPreferredHeightUnit).not.toHaveBeenCalled();
  });
  it.each(cases)("optimistically selects $next, puts the spinner on that row and keeps the saved choice", async ({ label, original, update, key, next }) => {
    let resolve!: () => void;
    vi.mocked(update).mockReturnValue(new Promise<void>(done => { resolve = done; }));
    const queryClient = renderScreen();
    fireEvent.click(row(label));
    await waitFor(() => expect(update).toHaveBeenCalledWith(next));
    expect(row(label)).toHaveAttribute("aria-checked", "true");
    expect(row(original)).toHaveAttribute("aria-checked", "false");
    expect(row(label)).toBeDisabled();
    expect(row(original)).toBeDisabled();
    expect(within(row(label)).getByRole("progressbar")).toBeInTheDocument();
    expect(within(row(original)).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(queryClient.getQueryData([key])).toBe(next);
    await act(async () => resolve());
    await waitFor(() => expect(row(label)).not.toBeDisabled());
    expect(row(label)).toHaveAttribute("aria-checked", "true");
  });
  it.each(cases)("rolls back a failed $next save and clears the error on the next tap", async ({ label, original, update, key, previous }) => {
    vi.mocked(update).mockRejectedValueOnce(new Error("Offline"));
    const queryClient = renderScreen();
    fireEvent.click(row(label));
    await screen.findByText("Couldn't change units. Check your connection and try again.");
    expect(row(original)).toHaveAttribute("aria-checked", "true");
    expect(row(label)).toHaveAttribute("aria-checked", "false");
    expect(queryClient.getQueryData([key])).toBe(previous);
    fireEvent.click(row(original));
    expect(screen.queryByText(/Couldn't change units/)).not.toBeInTheDocument();
    expect(update).toHaveBeenCalledTimes(1);
  });
  it("does not save already selected options", () => {
    renderScreen();
    fireEvent.click(row(/lb.*Pounds/));
    fireEvent.click(row(/cm.*Centimetres/));
    expect(updatePreferredUnit).not.toHaveBeenCalled();
    expect(updatePreferredHeightUnit).not.toHaveBeenCalled();
  });
  it("observes cache updates instead of fixed route params", async () => {
    const queryClient = renderScreen();
    act(() => { queryClient.setQueryData(["preferredUnit"], "kg"); queryClient.setQueryData(["preferredHeightUnit"], "ft"); });
    await waitFor(() => expect(row(/kg.*Kilograms/)).toHaveAttribute("aria-checked", "true"));
    expect(row(/ft.*Feet/)).toHaveAttribute("aria-checked", "true");
  });
  it("uses route values until uncached preferences resolve", async () => {
    let resolve!: (unit: "kg" | "lbs") => void;
    vi.mocked(getPreferredUnit).mockReturnValue(new Promise(done => { resolve = done; }));
    renderScreen(false);
    expect(row(/lb.*Pounds/)).toHaveAttribute("aria-checked", "true");
    await act(async () => resolve("kg"));
    await waitFor(() => expect(row(/kg.*Kilograms/)).toHaveAttribute("aria-checked", "true"));
  });
});
