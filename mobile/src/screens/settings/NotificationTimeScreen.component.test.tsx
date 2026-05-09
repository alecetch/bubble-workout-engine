import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { updateNotificationPreferences } from "../../api/notifications";
import { NotificationTimeScreen } from "./NotificationTimeScreen";

vi.mock("../../api/notifications", () => ({
  updateNotificationPreferences: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ children, disabled, onPress }: any) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  const ReactModule = await import("react");

  return {
    ...actual,
    FlatList: ({ data, keyExtractor, renderItem }: any) =>
      ReactModule.createElement(
        "div",
        null,
        data.map((item: unknown, index: number) =>
          ReactModule.createElement(
            ReactModule.Fragment,
            { key: keyExtractor?.(item, index) ?? String(index) },
            renderItem({ item, index }),
          ),
        ),
      ),
  };
});

const mutateMock = vi.fn();
const invalidateQueriesMock = vi.fn();
let capturedMutationFn: ((time: string) => Promise<unknown>) | undefined;
let capturedOnError: ((error: unknown) => void) | undefined;
let dateTimeFormatSpy: { mockRestore: () => void };

function installUseMutationMock(overrides: Record<string, unknown> = {}) {
  vi.mocked(useMutation).mockImplementation(({ mutationFn, onError }: any) => {
    capturedMutationFn = mutationFn;
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

function renderScreen(params = { currentTime: "08:00" }) {
  const navigation = { navigate: vi.fn(), goBack: vi.fn() };
  render(
    <NotificationTimeScreen
      navigation={navigation as any}
      route={{ params } as any}
    />,
  );
  return navigation;
}

describe("NotificationTimeScreen", () => {
  beforeEach(() => {
    mutateMock.mockReset();
    invalidateQueriesMock.mockReset();
    vi.mocked(updateNotificationPreferences).mockClear();
    capturedMutationFn = undefined;
    capturedOnError = undefined;
    vi.mocked(useQueryClient).mockReturnValue({ invalidateQueries: invalidateQueriesMock } as any);
    dateTimeFormatSpy = vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "America/New_York" }),
    } as any);
    installUseMutationMock();
  });

  afterEach(() => {
    dateTimeFormatSpy.mockRestore();
  });

  it("renders first and last time slot options", () => {
    renderScreen();

    expect(screen.getByText("12:00 AM")).toBeInTheDocument();
    expect(screen.getByText("11:30 PM")).toBeInTheDocument();
  });

  it("tapping a time slot then clicking Save calls mutate with the selected time", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "10:00 AM" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mutateMock).toHaveBeenCalledWith("10:00");
  });

  it("disables Save button while mutation is pending", () => {
    installUseMutationMock({ isPending: true });

    renderScreen();

    expect(
      screen
        .getAllByRole("button", { name: "" })
        .some((button) => button.hasAttribute("disabled")),
    ).toBe(true);
  });

  it("Save mutation function uses selected time and device timezone", async () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "10:00 AM" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await capturedMutationFn?.("10:00");

    expect(updateNotificationPreferences).toHaveBeenCalledWith({
      reminderTimeLocalHhmm: "10:00",
      reminderTimezone: "America/New_York",
    });
  });

  it("shows error text when onError is invoked", () => {
    renderScreen();

    act(() => {
      capturedOnError?.(new Error("server error"));
    });

    expect(screen.getByText("Couldn't save reminder time. Try again.")).toBeInTheDocument();
  });
});
