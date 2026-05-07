import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../../api/client";
import { ResetPasswordCodeScreen } from "./ResetPasswordCodeScreen";

vi.mock("../../api/client", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
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

const apiFetchMock = vi.mocked(apiFetch);

function makeNav() {
  return { navigate: vi.fn(), goBack: vi.fn(), replace: vi.fn() };
}

function renderCode(params = { email: "user@example.com" }) {
  const navigation = makeNav();
  render(
    <ResetPasswordCodeScreen
      navigation={navigation as any}
      route={{ params } as any}
    />,
  );
  return navigation;
}

function fillValidResetForm(password = "newpassword123"): void {
  fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123456" } });
  fireEvent.change(screen.getByPlaceholderText("Create password"), { target: { value: password } });
  fireEvent.change(screen.getByPlaceholderText("Re-enter password"), { target: { value: password } });
}

describe("ResetPasswordCodeScreen", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(undefined);
  });

  it("renders code input, two password inputs, and Reset password button", () => {
    renderCode();

    expect(screen.getByPlaceholderText("000000")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Create password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Re-enter password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset password" })).toBeInTheDocument();
  });

  it("submit shows validation error and does not call apiFetch when code is fewer than 6 digits", async () => {
    renderCode();

    fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123" } });
    fireEvent.change(screen.getByPlaceholderText("Create password"), { target: { value: "newpassword123" } });
    fireEvent.change(screen.getByPlaceholderText("Re-enter password"), { target: { value: "newpassword123" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Enter the 6-digit code from your email.")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("submit shows a mismatch error when password and confirm password differ", async () => {
    renderCode();

    fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123456" } });
    fireEvent.change(screen.getByPlaceholderText("Create password"), { target: { value: "abcdefgh" } });
    fireEvent.change(screen.getByPlaceholderText("Re-enter password"), { target: { value: "xxxxxxxx" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("submit shows password min-length error when password is fewer than 8 chars", async () => {
    renderCode();

    fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123456" } });
    fireEvent.change(screen.getByPlaceholderText("Create password"), { target: { value: "short" } });
    fireEvent.change(screen.getByPlaceholderText("Re-enter password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Password must be at least 8 characters.")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("successful submit renders success view", async () => {
    renderCode();

    fillValidResetForm();
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Password updated")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith("/api/auth/reset-password", {
      method: "POST",
      body: {
        email: "user@example.com",
        code: "123456",
        new_password: "newpassword123",
      },
    });
  });

  it("disables the Reset password button while the request is in flight", async () => {
    apiFetchMock.mockReturnValueOnce(new Promise(() => {}));
    renderCode();

    fillValidResetForm();
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByRole("button", { name: "Resetting..." })).toBeDisabled();
  });

  it("ApiError(400) shows invalid-or-expired code error message", async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError(400, "bad code"));
    renderCode();

    fillValidResetForm();
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Invalid or expired code. Please request a new one.")).toBeInTheDocument();
  });

  it("paste auto-sync sets confirmPassword to match a pasted password", () => {
    renderCode();
    const confirmPasswordInput = screen.getByPlaceholderText("Re-enter password") as HTMLInputElement;

    fireEvent.change(confirmPasswordInput, { target: { value: "ab" } });
    fireEvent.change(screen.getByPlaceholderText("Create password"), {
      target: { value: "newpassword123" },
    });

    expect(confirmPasswordInput.value).toBe("newpassword123");
  });

  it("Resend code button calls navigation.goBack", () => {
    const navigation = renderCode();

    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
