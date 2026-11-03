import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LogOutsideSessionSheet } from "./LogOutsideSessionSheet";
import { authPostJson } from "../../api/client";
import { renderWithProviders } from "../../__test-utils__";

vi.unmock("@tanstack/react-query");
vi.mock("../../api/client", () => ({ authPostJson: vi.fn() }));
vi.mock("../interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress, accessibilityLabel, accessibilityState }: any) =>
    <button disabled={disabled} aria-label={accessibilityLabel} aria-pressed={accessibilityState?.selected} onClick={onPress}>{children}</button>,
}));
beforeEach(() => { vi.mocked(authPostJson).mockReset(); });

it("starts with 45 minutes, today and the activity choices", () => {
  renderWithProviders(<LogOutsideSessionSheet onClose={vi.fn()} />);
  expect(screen.getByText("Duration: 45 minutes")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Strength elsewhere" })).toBeInTheDocument();
});
it("requires an activity before submitting", () => {
  renderWithProviders(<LogOutsideSessionSheet onClose={vi.fn()} />);
  fireEvent.click(screen.getByText("Log it"));
  expect(screen.getByText("Choose an activity first.")).toBeInTheDocument();
  expect(authPostJson).not.toHaveBeenCalled();
});
it("logs yesterday's 40-minute run, invalidates both views and shows the server's updated count", async () => {
  const close = vi.fn();
  vi.mocked(authPostJson).mockResolvedValue({ ok: true, year_progress: { count: 88 } });
  const { queryClient } = renderWithProviders(<LogOutsideSessionSheet onClose={close} />);
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  fireEvent.click(screen.getByText("Run"));
  fireEvent.click(screen.getByRole("button", { name: "Decrease duration" }));
  fireEvent.click(screen.getByText("Yesterday"));
  fireEvent.click(screen.getByText("Log it"));
  await screen.findByText("Day 88 is in.");
  const date = new Date(); date.setDate(date.getDate() - 1);
  const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  expect(authPostJson).toHaveBeenCalledWith("/api/users/me/training-sessions", { activity_type: "run", duration_min: 40, local_date: localDate, timezone: expect.any(String) });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["yearProgress"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["outsideSessions"] });
  fireEvent.click(screen.getByText("Done"));
  expect(close).toHaveBeenCalledOnce();
});
it("shows an API error and lets the user retry without losing choices", async () => {
  vi.mocked(authPostJson).mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce({ year_progress: { count: 4 } });
  renderWithProviders(<LogOutsideSessionSheet onClose={vi.fn()} />);
  fireEvent.click(screen.getByText("Swim"));
  fireEvent.click(screen.getByText("Log it"));
  await screen.findByText("Connection lost");
  expect(screen.getByRole("button", { name: "Swim" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByText("Log it"));
  await screen.findByText("Day 4 is in.");
});
it("keeps the stepper inside 20 to 300 minutes", () => {
  renderWithProviders(<LogOutsideSessionSheet onClose={vi.fn()} />);
  const decrease = screen.getByRole("button", { name: "Decrease duration" });
  for (let i = 0; i < 8; i++) fireEvent.click(decrease);
  expect(screen.getByText("Duration: 20 minutes")).toBeInTheDocument();
  expect(decrease).toBeDisabled();
  const increase = screen.getByRole("button", { name: "Increase duration" });
  for (let i = 0; i < 60; i++) fireEvent.click(increase);
  expect(screen.getByText("Duration: 300 minutes")).toBeInTheDocument();
  expect(increase).toBeDisabled();
});
it("blocks duplicate submissions and closing while the request is pending", async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(authPostJson).mockImplementation(() => new Promise(done => { resolve = done; }));
  renderWithProviders(<LogOutsideSessionSheet onClose={vi.fn()} />);
  fireEvent.click(screen.getByText("Run"));
  fireEvent.click(screen.getByText("Log it"));
  fireEvent.click(screen.getByText("Logging..."));
  expect(screen.getByText("Cancel").closest("button")).toBeDisabled();
  await waitFor(() => expect(authPostJson).toHaveBeenCalledOnce());
  resolve({ year_progress: { count: 1 } });
  await screen.findByText("Day 1 is in.");
});
