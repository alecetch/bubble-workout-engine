import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { YearMomentCards, yearMomentStorageKey } from "./YearMomentCards";
const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }));
vi.mock("@react-navigation/native", async () => {
  const React = await import("react");
  return { useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]) };
});
vi.mock("../interaction/PressableScale", () => ({ PressableScale: ({ children, onPress, disabled, accessibilityLabel }: any) => <button aria-label={accessibilityLabel} disabled={disabled} onClick={onPress}>{children}</button> }));
beforeEach(() => {
  storage.clear();
  vi.mocked(AsyncStorage.getItem).mockReset().mockImplementation(async key => storage.get(key) ?? null);
  vi.mocked(AsyncStorage.setItem).mockReset().mockImplementation(async (key, value) => { storage.set(key, value); });
});
it("keeps annual recap dismissal scoped to the account", async () => {
  const open = vi.fn();
  const view = render(<YearMomentCards userId="one" todayLocal="2026-12-28" previousCount={0} onOpenRecap={open} />);
  fireEvent.click(await screen.findByText("Your 2026 recap is ready")); expect(open).toHaveBeenCalledWith(2026);
  fireEvent.click(screen.getByRole("button", { name: "Dismiss 2026 recap banner" }));
  await waitFor(() => expect(screen.queryByText("Your 2026 recap is ready")).not.toBeInTheDocument());
  expect(storage.get(yearMomentStorageKey("one", 2026, "recap-dismissed"))).toBe("1");
  view.rerender(<YearMomentCards userId="two" todayLocal="2026-12-28" previousCount={0} onOpenRecap={open} />);
  expect(await screen.findByText("Your 2026 recap is ready")).toBeInTheDocument();
});
it("marks the January moment on display even if it isn't dismissed", async () => {
  const open = vi.fn();
  const view = render(<YearMomentCards userId="one" todayLocal="2027-01-14" previousCount={214} onOpenRecap={open} />);
  expect(await screen.findByText("2027 starts now. Last year: 214. Day 1 is today.")).toBeInTheDocument();
  await waitFor(() => expect(storage.get(yearMomentStorageKey("one", 2027, "reset-seen"))).toBe("1"));
  fireEvent.click(screen.getByText("See your 2026 recap")); expect(open).toHaveBeenCalledWith(2026);
  view.unmount(); render(<YearMomentCards userId="one" todayLocal="2027-01-14" previousCount={214} onOpenRecap={open} />);
  await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledTimes(4));
  expect(screen.queryByText(/starts now/)).not.toBeInTheDocument();
});
it("retains the recap after a storage write failure and lets dismissal retry", async () => {
  vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("Storage full"));
  render(<YearMomentCards userId="one" todayLocal="2026-12-28" previousCount={0} onOpenRecap={vi.fn()} />);
  await screen.findByText("Your 2026 recap is ready");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss 2026 recap banner" }));
  await screen.findByText("Couldn't save your year moment. Try again.");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss 2026 recap banner" }));
  await waitFor(() => expect(screen.queryByText("Your 2026 recap is ready")).not.toBeInTheDocument());
});
it("reports storage read failures with retry", async () => {
  vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("Storage unavailable"));
  render(<YearMomentCards userId="one" todayLocal="2026-12-28" previousCount={0} onOpenRecap={vi.fn()} />);
  fireEvent.click(await screen.findByText("Retry year moment"));
  expect(await screen.findByText("Your 2026 recap is ready")).toBeInTheDocument();
});
