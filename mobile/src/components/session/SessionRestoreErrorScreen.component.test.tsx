import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionRestoreErrorScreen } from "./SessionRestoreErrorScreen";
import { useIsOffline } from "../../lib/network";
vi.mock("../../lib/network", () => ({ useIsOffline: vi.fn() }));
beforeEach(() => vi.mocked(useIsOffline).mockReturnValue(false));
describe("SessionRestoreErrorScreen", () => {
  it("renders honest recovery copy with retry and sign-out actions", () => {
    const onRetry = vi.fn(); const onSignOut = vi.fn();
    render(<SessionRestoreErrorScreen onRetry={onRetry} onSignOut={onSignOut} isRetrying={false} />);
    expect(screen.getByText("Can't reach Forma")).toBeInTheDocument();
    expect(screen.getByText("Check your connection. You're still signed in.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
  it("disables retry and shows progress while retrying, but allows sign out", () => {
    const onRetry = vi.fn(); const onSignOut = vi.fn();
    render(<SessionRestoreErrorScreen onRetry={onRetry} onSignOut={onSignOut} isRetrying />);
    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
    expect(screen.getByLabelText("Retrying session restoration")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
  it("notifies reconnect once even while retry is busy; the parent owns deduplication", () => {
    const onRetry = vi.fn(); const props = { onRetry, onSignOut: vi.fn(), isRetrying: true };
    vi.mocked(useIsOffline).mockReturnValue(true);
    const { rerender } = render(<SessionRestoreErrorScreen {...props} />);
    vi.mocked(useIsOffline).mockReturnValue(false);
    rerender(<SessionRestoreErrorScreen {...props} />);
    rerender(<SessionRestoreErrorScreen {...props} />);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it("retries once per offline-to-online transition, never just on render", () => {
    const onRetry = vi.fn(); const props = { onRetry, onSignOut: vi.fn(), isRetrying: false };
    vi.mocked(useIsOffline).mockReturnValue(true);
    const { rerender } = render(<SessionRestoreErrorScreen {...props} />);
    expect(onRetry).not.toHaveBeenCalled();
    vi.mocked(useIsOffline).mockReturnValue(false);
    rerender(<SessionRestoreErrorScreen {...props} />);
    rerender(<SessionRestoreErrorScreen {...props} />);
    expect(onRetry).toHaveBeenCalledTimes(1);
    vi.mocked(useIsOffline).mockReturnValue(true); rerender(<SessionRestoreErrorScreen {...props} />);
    vi.mocked(useIsOffline).mockReturnValue(false); rerender(<SessionRestoreErrorScreen {...props} />);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });
});
