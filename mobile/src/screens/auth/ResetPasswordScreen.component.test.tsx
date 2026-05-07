import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../api/client";
import { ResetPasswordScreen } from "./ResetPasswordScreen";

vi.mock("../../api/client", () => ({
  apiFetch: vi.fn(),
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

function renderScreen() {
  const navigation = makeNav();
  render(<ResetPasswordScreen navigation={navigation as any} route={{ params: {} } as any} />);
  return navigation;
}

function enterEmail(email = " User@Example.COM "): void {
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: email } });
}

describe("ResetPasswordScreen", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue(undefined);
  });

  it("renders email input and Send reset code button", () => {
    renderScreen();

    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset code" })).toBeInTheDocument();
  });

  it("does not call apiFetch and shows a validation error when email is empty", async () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Send reset code" }));

    expect(await screen.findByText("Enter your email address.")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("calls apiFetch and navigates to ResetPasswordCode on success", async () => {
    const navigation = renderScreen();

    enterEmail();
    fireEvent.click(screen.getByRole("button", { name: "Send reset code" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("/api/auth/forgot-password", {
        method: "POST",
        body: { email: "user@example.com" },
      });
      expect(navigation.navigate).toHaveBeenCalledWith("ResetPasswordCode", {
        email: "user@example.com",
      });
    });
  });

  it("navigates to ResetPasswordCode even when apiFetch rejects", async () => {
    apiFetchMock.mockRejectedValueOnce(new Error("Network error"));
    const navigation = renderScreen();

    enterEmail("user@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Send reset code" }));

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith("ResetPasswordCode", {
        email: "user@example.com",
      });
    });
  });

  it("shows no inline error message on network failure", async () => {
    apiFetchMock.mockRejectedValueOnce(new Error("Network error"));
    const navigation = renderScreen();

    enterEmail("user@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Send reset code" }));

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith("ResetPasswordCode", {
        email: "user@example.com",
      });
    });
    expect(screen.queryByText("Network error")).not.toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Enter your email address.")).not.toBeInTheDocument();
  });

  it("Back button calls navigation.goBack", () => {
    const navigation = renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
