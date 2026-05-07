import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountNameScreen } from "./AccountNameScreen";

vi.mock("../../api/accountApi", () => ({
  updateDisplayName: vi.fn(),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const mutateMock = vi.fn();
const setQueryDataMock = vi.fn();
let capturedOnSuccess: ((data: string) => void) | undefined;

function installUseMutationMock(overrides: Record<string, unknown> = {}) {
  vi.mocked(useMutation).mockImplementation(({ onSuccess }: any) => {
    capturedOnSuccess = onSuccess;
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

function renderScreen(params = { currentName: "Alice" }) {
  const navigation = { navigate: vi.fn(), goBack: vi.fn() };
  render(
    <AccountNameScreen
      navigation={navigation as any}
      route={{ params } as any}
    />,
  );
  return navigation;
}

describe("AccountNameScreen", () => {
  beforeEach(() => {
    mutateMock.mockReset();
    setQueryDataMock.mockReset();
    capturedOnSuccess = undefined;
    vi.mocked(useQueryClient).mockReturnValue({ setQueryData: setQueryDataMock } as any);
    installUseMutationMock();
  });

  it("input is pre-populated with current name from route params", () => {
    renderScreen();

    expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
  });

  it("Save button is disabled while mutation is pending", () => {
    installUseMutationMock({ isPending: true });

    renderScreen();

    expect(
      screen
        .getAllByRole("button", { name: "" })
        .some((button) => button.hasAttribute("disabled")),
    ).toBe(true);
  });

  it("shows validation error and does not call mutate when input is empty", () => {
    renderScreen();

    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Name must be 1-60 characters.")).toBeInTheDocument();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("shows validation error when input exceeds 60 characters", () => {
    renderScreen();

    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "a".repeat(61) } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Name must be 1-60 characters.")).toBeInTheDocument();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("calls mutate with valid input and navigates back on success", () => {
    const navigation = renderScreen();

    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: " Bob " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    capturedOnSuccess?.("Bob");

    expect(mutateMock).toHaveBeenCalledWith("Bob");
    expect(setQueryDataMock).toHaveBeenCalledWith(["accountInfo"], expect.any(Function));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
