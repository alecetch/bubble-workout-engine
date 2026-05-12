import React from "react";
import { axe } from "jest-axe";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnitPickerScreen } from "./UnitPickerScreen";

vi.mock("../../api/profileApi", () => ({
  updatePreferredUnit: vi.fn(),
  updatePreferredHeightUnit: vi.fn(),
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: any) => <span data-icon={name} data-testid={name} />,
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const weightMutateMock = vi.fn();
const heightMutateMock = vi.fn();
const setQueryDataMock = vi.fn();
let mutationCallCount = 0;

function installUseMutationMock() {
  vi.mocked(useMutation).mockImplementation(() => {
    mutationCallCount += 1;
    const mutate = mutationCallCount === 1 ? weightMutateMock : heightMutateMock;
    return {
      mutate,
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    } as any;
  });
}

function renderScreen(params = { currentUnit: "kg", currentHeightUnit: "cm" }) {
  mutationCallCount = 0;
  const navigation = { navigate: vi.fn(), goBack: vi.fn() };
  render(
    <UnitPickerScreen
      navigation={navigation as any}
      route={{ params } as any}
    />,
  );
  return navigation;
}

function rowFor(labelPattern: RegExp): HTMLElement {
  return screen.getByText(labelPattern).closest("button") as HTMLElement;
}

describe("UnitPickerScreen", () => {
  beforeEach(() => {
    weightMutateMock.mockReset();
    heightMutateMock.mockReset();
    setQueryDataMock.mockReset();
    mutationCallCount = 0;
    vi.mocked(useQueryClient).mockReturnValue({ setQueryData: setQueryDataMock } as any);
    installUseMutationMock();
  });
  it("has no accessibility violations in the default render state", async () => {
    renderScreen();
    await act(async () => {});
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });


  it("renders WEIGHT section with kg and lbs options; kg is shown as selected", () => {
    renderScreen();

    expect(screen.getByText("WEIGHT")).toBeInTheDocument();
    expect(screen.getByText(/kg.*Kilograms/)).toBeInTheDocument();
    expect(screen.getByText(/lbs.*Pounds/)).toBeInTheDocument();
    expect(within(rowFor(/kg.*Kilograms/)).getByTestId("radio-button-on")).toBeInTheDocument();
    expect(within(rowFor(/lbs.*Pounds/)).getByTestId("radio-button-off")).toBeInTheDocument();
  });

  it("renders HEIGHT section with cm and ft options; cm is shown as selected", () => {
    renderScreen();

    expect(screen.getByText("HEIGHT")).toBeInTheDocument();
    expect(screen.getByText(/cm.*Centimetres/)).toBeInTheDocument();
    expect(screen.getByText(/ft.*Feet & inches/)).toBeInTheDocument();
    expect(within(rowFor(/cm.*Centimetres/)).getByTestId("radio-button-on")).toBeInTheDocument();
    expect(within(rowFor(/ft.*Feet & inches/)).getByTestId("radio-button-off")).toBeInTheDocument();
  });

  it("tapping lbs immediately calls the weight mutation with lbs", () => {
    renderScreen();

    fireEvent.click(rowFor(/lbs.*Pounds/));

    expect(weightMutateMock).toHaveBeenCalledWith("lbs");
    expect(heightMutateMock).not.toHaveBeenCalled();
  });

  it("tapping ft immediately calls the height mutation with ft", () => {
    renderScreen();

    fireEvent.click(rowFor(/ft.*Feet & inches/));

    expect(heightMutateMock).toHaveBeenCalledWith("ft");
    expect(weightMutateMock).not.toHaveBeenCalled();
  });
});
