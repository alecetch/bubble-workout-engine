import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useMutation } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/client";
import { clearTokens } from "../../api/tokenStorage";
import { useSessionStore } from "../../state/session/sessionStore";
import { ChangePasswordScreen } from "./ChangePasswordScreen";

vi.mock("../../api/accountApi", () => ({
  changePassword: vi.fn(),
}));

vi.mock("../../api/tokenStorage", () => ({
  clearTokens: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../state/session/sessionStore", () => ({
  useSessionStore: vi.fn(),
}));

vi.mock("../../api/client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    details?: unknown;

    constructor(status: number, message: string, details?: unknown) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.details = details;
    }
  },
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const mutateMock = vi.fn();
const clearSessionMock = vi.fn();
let capturedOnSuccess: (() => Promise<void>) | undefined;
let capturedOnError: ((error: unknown) => void) | undefined;

function installUseMutationMock(overrides: Record<string, unknown> = {}) {
  vi.mocked(useMutation).mockImplementation(({ onSuccess, onError }: any) => {
    capturedOnSuccess = onSuccess;
    capturedOnError = onError;
    return {
      mutate: mutateMock,
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
      ...overrides,
    } as any;
  });
}

function renderScreen() {
  const navigation = { navigate: vi.fn(), goBack: vi.fn(), replace: vi.fn() };
  render(<ChangePasswordScreen navigation={navigation as any} route={{} as any} />);
  return navigation;
}

function fillPasswords(current = "oldpassword", next = "newpassword", confirm = "newpassword") {
  fireEvent.change(screen.getByPlaceholderText("Current password"), { target: { value: current } });
  fireEvent.change(screen.getByPlaceholderText("New password"), { target: { value: next } });
  fireEvent.change(screen.getByPlaceholderText("Confirm new password"), { target: { value: confirm } });
}

describe("ChangePasswordScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mutateMock.mockReset();
    clearSessionMock.mockReset();
    vi.mocked(clearTokens).mockClear();
    capturedOnSuccess = undefined;
    capturedOnError = undefined;
    vi.mocked(useSessionStore).mockImplementation((selector: any) =>
      selector({ clearSession: clearSessionMock }),
    );
    installUseMutationMock();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders current password, new password, confirm password fields and Submit button", () => {
    renderScreen();

    expect(screen.getByPlaceholderText("Current password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("New password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Confirm new password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update Password" })).toBeInTheDocument();
  });

  it("shows passwords do not match error and does not call mutate", () => {
    renderScreen();

    fillPasswords("oldpassword", "abcdefgh", "zzzzzzzz");
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));

    expect(screen.getByText("New passwords do not match.")).toBeInTheDocument();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("shows min-length error when new password is fewer than 8 chars", () => {
    renderScreen();

    fillPasswords("oldpassword", "short", "short");
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));

    expect(screen.getByText("New password must be at least 8 characters.")).toBeInTheDocument();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("shows Current password is incorrect error for invalid_credentials ApiError", () => {
    renderScreen();

    fillPasswords();
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));
    act(() => {
      capturedOnError?.(new ApiError(401, "wrong", { code: "invalid_credentials" }));
    });

    expect(screen.getByText("Current password is incorrect.")).toBeInTheDocument();
  });

  it("on success shows success message and calls navigation.goBack after timeout", async () => {
    const navigation = renderScreen();

    fillPasswords();
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));
    await act(async () => {
      await capturedOnSuccess?.();
    });

    expect(screen.getByText("Password updated.")).toBeInTheDocument();
    expect(clearTokens).toHaveBeenCalledTimes(1);
    expect(clearSessionMock).toHaveBeenCalledTimes(1);

    act(() => {
      vi.runAllTimers();
    });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it("Submit button is disabled when isPending is true", () => {
    installUseMutationMock({ isPending: true });

    renderScreen();

    expect(
      screen
        .getAllByRole("button", { name: "" })
        .some((button) => button.hasAttribute("disabled")),
    ).toBe(true);
  });
});
