import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Alert } from "react-native";
import { beforeEach, expect, it, vi } from "vitest";
import { DiagnosticsSheet } from "./DiagnosticsSheet";
import { isCrashReportingEnabled, sendTestError, triggerNativeCrash } from "../../lib/crashReporting";

vi.mock("../../lib/crashReporting", () => ({
  isCrashReportingEnabled: vi.fn(() => true),
  getCrashReportingEnvironment: () => "beta",
  sendTestError: vi.fn(),
  triggerNativeCrash: vi.fn(),
}));

beforeEach(() => { vi.clearAllMocks(); vi.mocked(isCrashReportingEnabled).mockReturnValue(true); });

it("shows reporting and environment without ever displaying the DSN", () => {
  vi.stubEnv("EXPO_PUBLIC_SENTRY_DSN", "https://private@example.com/1");
  const { container } = render(<DiagnosticsSheet visible onClose={vi.fn()} />);
  expect(screen.getByText("Crash reporting: on")).toBeInTheDocument();
  expect(screen.getByText("Environment: beta")).toBeInTheDocument();
  expect(container.innerHTML).not.toContain("private@example.com");
  vi.unstubAllEnvs();
});

it("sends a test error and acknowledges it", () => {
  render(<DiagnosticsSheet visible onClose={vi.fn()} />);
  fireEvent.click(screen.getByLabelText("Send test error"));
  expect(sendTestError).toHaveBeenCalledOnce();
  expect(screen.getByText("Test error sent")).toBeInTheDocument();
});

it("requires explicit Crash confirmation and leaves Cancel harmless", () => {
  const alert = vi.spyOn(Alert, "alert").mockImplementation(() => {});
  render(<DiagnosticsSheet visible onClose={vi.fn()} />);
  fireEvent.click(screen.getByLabelText("Test native crash"));
  expect(alert).toHaveBeenCalledWith("Test native crash", "This will close the app. Continue?", expect.any(Array));
  const buttons = alert.mock.calls[0][2]!;
  act(() => buttons.find(b => b.text === "Cancel")?.onPress?.());
  expect(triggerNativeCrash).not.toHaveBeenCalled();
  act(() => buttons.find(b => b.text === "Crash")?.onPress?.());
  expect(triggerNativeCrash).toHaveBeenCalledOnce();
  alert.mockRestore();
});

it("disables both tests and explains why when reporting is off", () => {
  vi.mocked(isCrashReportingEnabled).mockReturnValue(false);
  render(<DiagnosticsSheet visible onClose={vi.fn()} />);
  expect(screen.getByText("Crash reporting: off (no DSN in this build)")).toBeInTheDocument();
  expect(screen.getByText(/Test controls require/)).toBeInTheDocument();
  for (const label of ["Send test error", "Test native crash"]) {
    expect(screen.getByLabelText(label)).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByLabelText(label));
  }
  expect(sendTestError).not.toHaveBeenCalled();
  expect(triggerNativeCrash).not.toHaveBeenCalled();
});

it("closes and resets the acknowledgement on reopening", () => {
  const onClose = vi.fn();
  const { rerender } = render(<DiagnosticsSheet visible onClose={onClose} />);
  fireEvent.click(screen.getByLabelText("Send test error"));
  fireEvent.click(screen.getByLabelText("Close diagnostics"));
  expect(onClose).toHaveBeenCalledOnce();
  rerender(<DiagnosticsSheet visible={false} onClose={onClose} />);
  rerender(<DiagnosticsSheet visible onClose={onClose} />);
  expect(screen.queryByText("Test error sent")).not.toBeInTheDocument();
});
