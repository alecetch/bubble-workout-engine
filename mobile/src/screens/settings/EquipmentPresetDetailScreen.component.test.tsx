import React from "react";
import { axe } from "jest-axe";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EquipmentPresetDetailScreen } from "./EquipmentPresetDetailScreen";
import { useEquipmentItems } from "../../api/hooks";

const { useEquipmentItemsMock, setOptionsMock, navigateMock, refetchMock } = vi.hoisted(() => ({
  useEquipmentItemsMock: vi.fn(),
  setOptionsMock: vi.fn(),
  navigateMock: vi.fn(),
  refetchMock: vi.fn(),
}));

vi.mock("../../api/hooks", () => ({
  useEquipmentItems: useEquipmentItemsMock,
}));

vi.mock("../../components/interaction/PressableScale", () => ({
  PressableScale: ({ accessibilityLabel, children, disabled, onPress }: any) => (
    <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

const useEquipmentItemsHookMock = vi.mocked(useEquipmentItems);

function renderScreen(params = {}) {
  return render(
    <EquipmentPresetDetailScreen
      navigation={{ setOptions: setOptionsMock, navigate: navigateMock } as never}
      route={{
        key: "EquipmentPresetDetail",
        name: "EquipmentPresetDetail",
        params: {
          presetCode: "commercial_gym",
          presetLabel: "Commercial Gym",
          isCurrentPreset: false,
          ...params,
        },
      } as never}
    />,
  );
}

describe("EquipmentPresetDetailScreen", () => {
  beforeEach(() => {
    setOptionsMock.mockReset();
    navigateMock.mockReset();
    refetchMock.mockReset();
    refetchMock.mockResolvedValue({});
    useEquipmentItemsHookMock.mockReturnValue({
      data: {
        preset: "commercial_gym",
        items: [
          { id: "1", externalId: null, code: "barbell", label: "Barbell", category: "strength" },
          { id: "2", externalId: null, code: "rower", label: "Rower", category: "conditioning" },
        ],
      },
      isLoading: false,
      isError: false,
      isSuccess: true,
      refetch: refetchMock,
    } as any);
  });

  it("has no accessibility violations in the default render state", async () => {
    renderScreen();
    await act(async () => {});
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it("renders grouped equipment for the preset", () => {
    renderScreen();

    expect(screen.getByText("Commercial Gym")).toBeInTheDocument();
    expect(screen.getByText("Conditioning")).toBeInTheDocument();
    expect(screen.getByText("Strength")).toBeInTheDocument();
    expect(screen.getByText("Barbell")).toBeInTheDocument();
    expect(screen.getByText("Rower")).toBeInTheDocument();
  });

  it("returns the selected preset to EquipmentSettings", () => {
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Use this preset" }));

    expect(navigateMock).toHaveBeenCalledWith("EquipmentSettings", {
      presetCodeToApply: "commercial_gym",
    });
  });

  it("shows loading state", () => {
    useEquipmentItemsHookMock.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
      isSuccess: false,
      refetch: refetchMock,
    } as any);

    renderScreen();

    expect(screen.getByText("Loading preset equipment...")).toBeInTheDocument();
  });

  it("can retry after an equipment load error", async () => {
    useEquipmentItemsHookMock.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      isSuccess: false,
      refetch: refetchMock,
    } as any);

    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(refetchMock).toHaveBeenCalledTimes(1));
  });
});
