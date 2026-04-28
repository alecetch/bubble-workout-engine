import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EquipmentSettingsScreen } from "./EquipmentSettingsScreen";
import { getProgramEquipment } from "../../api/equipmentRegen";

const {
  useMeMock,
  useActiveProgramsMock,
  useClientProfileMock,
  useReferenceDataMock,
  useEquipmentItemsMock,
  useUpdateClientProfileMock,
  useRegenerateDaysMock,
  updateClientProfileMutateAsyncMock,
  regenerateMutateAsyncMock,
  setOptionsMock,
  goBackMock,
} = vi.hoisted(() => ({
  useMeMock: vi.fn(),
  useActiveProgramsMock: vi.fn(),
  useClientProfileMock: vi.fn(),
  useReferenceDataMock: vi.fn(),
  useEquipmentItemsMock: vi.fn(),
  useUpdateClientProfileMock: vi.fn(),
  useRegenerateDaysMock: vi.fn(),
  updateClientProfileMutateAsyncMock: vi.fn(),
  regenerateMutateAsyncMock: vi.fn(),
  setOptionsMock: vi.fn(),
  goBackMock: vi.fn(),
}));

vi.mock("../../api/hooks", () => ({
  useMe: useMeMock,
  useActivePrograms: useActiveProgramsMock,
  useClientProfile: useClientProfileMock,
  useReferenceData: useReferenceDataMock,
  useEquipmentItems: useEquipmentItemsMock,
  useUpdateClientProfile: useUpdateClientProfileMock,
  useRegenerateDays: useRegenerateDaysMock,
}));

vi.mock("../../api/equipmentRegen", () => ({
  getProgramEquipment: vi.fn(),
}));

vi.mock("../../components/onboarding/PresetCardList", () => ({
  PresetCardList: ({
    options,
    onSelect,
  }: {
    options: Array<{ value: string; title: string }>;
    onSelect: (value: string) => void;
  }) => (
    <div>
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onSelect(option.value)}>
          {option.title}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../../components/onboarding/EquipmentCategorySection", () => ({
  EquipmentCategorySection: () => null,
}));

vi.mock("@react-navigation/native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@react-navigation/native")>();
  return {
    ...actual,
    useNavigation: () => ({ setOptions: setOptionsMock, goBack: goBackMock }),
  };
});

function renderScreen() {
  return render(
    <EquipmentSettingsScreen
      navigation={{ setOptions: setOptionsMock, goBack: goBackMock } as never}
      route={{ key: "EquipmentSettings", name: "EquipmentSettings" } as never}
    />,
  );
}

function clickButton(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("EquipmentSettingsScreen", () => {
  beforeEach(() => {
    setOptionsMock.mockReset();
    goBackMock.mockReset();
    updateClientProfileMutateAsyncMock.mockReset();
    regenerateMutateAsyncMock.mockReset();
    vi.mocked(getProgramEquipment).mockReset();

    updateClientProfileMutateAsyncMock.mockResolvedValue({});
    regenerateMutateAsyncMock.mockResolvedValue({
      regenerated: 1,
      skipped: 0,
      partiallyLogged: 0,
      dayIds: ["day-1"],
    });
    vi.mocked(getProgramEquipment).mockResolvedValue({
      profileDefault: {
        equipmentPresetSlug: "commercial_gym",
        equipmentItemSlugs: ["barbell"],
      },
      futureDays: [],
    });

    useMeMock.mockReturnValue({
      data: { id: "user-1", clientProfileId: "profile-1" },
      isLoading: false,
    });
    useActiveProgramsMock.mockReturnValue({
      data: { ok: true, primary_program_id: "prog-1", programs: [], today_sessions: [] },
      isLoading: false,
    });
    useClientProfileMock.mockReturnValue({
      data: { equipmentPreset: "commercial_gym", equipmentItemCodes: ["barbell"] },
      isLoading: false,
      isError: false,
    });
    useReferenceDataMock.mockReturnValue({
      data: {
        equipmentPresets: [
          { code: "commercial_gym", label: "Commercial Gym" },
          { code: "bodyweight", label: "No Equipment" },
        ],
      },
      isLoading: false,
      isError: false,
    });
    const commercialEquipmentResponse = {
      data: {
        items: [{ code: "barbell", label: "Barbell", category: null }],
      },
      isLoading: false,
    };
    const emptyEquipmentResponse = {
      data: {
        items: [],
      },
      isLoading: false,
    };
    useEquipmentItemsMock.mockImplementation((presetCode: string | null) => ({
      ...(presetCode === "commercial_gym" ? commercialEquipmentResponse : emptyEquipmentResponse),
    }));
    useUpdateClientProfileMock.mockReturnValue({
      mutateAsync: updateClientProfileMutateAsyncMock,
      isPending: false,
    });
    useRegenerateDaysMock.mockReturnValue({
      mutateAsync: regenerateMutateAsyncMock,
      isPending: false,
    });
  });

  it("renders with the current preset selected from the profile", () => {
    renderScreen();

    expect(screen.getByText("Commercial Gym")).toBeInTheDocument();
  });

  it("does not open the save confirmation on initial load", () => {
    renderScreen();

    clickButton("Save changes");

    expect(screen.queryByText("Apply equipment changes?")).not.toBeInTheDocument();
    expect(updateClientProfileMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("enables saving after a different preset is selected", async () => {
    renderScreen();

    clickButton("No Equipment");
    clickButton("Save changes");

    expect(await screen.findByText("Apply equipment changes?")).toBeInTheDocument();
  });

  it("returns to the non-dirty state when the original preset is restored", () => {
    renderScreen();

    clickButton("No Equipment");
    clickButton("Commercial Gym");
    clickButton("Save changes");

    expect(screen.queryByText("Apply equipment changes?")).not.toBeInTheDocument();
  });

  it("patches the profile and then regenerates on the yes path", async () => {
    vi.mocked(getProgramEquipment).mockResolvedValueOnce({
      profileDefault: {
        equipmentPresetSlug: "bodyweight",
        equipmentItemSlugs: [],
      },
      futureDays: [{
        programDayId: "day-2",
        scheduledDate: "2026-05-06",
        scheduledWeekday: "Wed",
        weekNumber: 1,
        equipmentOverridePresetSlug: null,
        equipmentOverrideItemSlugs: null,
      }],
    });

    renderScreen();

    clickButton("No Equipment");
    clickButton("Save changes");
    clickButton("Yes, update all future workouts");

    await waitFor(() => {
      expect(updateClientProfileMutateAsyncMock).toHaveBeenCalledWith({
        equipmentPreset: "bodyweight",
        equipmentItemCodes: [],
      });
      expect(regenerateMutateAsyncMock).toHaveBeenCalled();
    });

    expect(updateClientProfileMutateAsyncMock.mock.invocationCallOrder[0]).toBeLessThan(
      regenerateMutateAsyncMock.mock.invocationCallOrder[0],
    );
  });

  it("patches only the profile on the no-regen path", async () => {
    renderScreen();

    clickButton("No Equipment");
    clickButton("Save changes");
    clickButton("No, change only my default");

    await waitFor(() => {
      expect(updateClientProfileMutateAsyncMock).toHaveBeenCalledWith({
        equipmentPreset: "bodyweight",
        equipmentItemCodes: [],
      });
    });
    expect(regenerateMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("shows the regen-specific error if the profile save succeeds but regeneration fails", async () => {
    regenerateMutateAsyncMock.mockRejectedValueOnce(new Error("regen failed"));
    vi.mocked(getProgramEquipment).mockResolvedValueOnce({
      profileDefault: {
        equipmentPresetSlug: "bodyweight",
        equipmentItemSlugs: [],
      },
      futureDays: [{
        programDayId: "day-2",
        scheduledDate: "2026-05-06",
        scheduledWeekday: "Wed",
        weekNumber: 1,
        equipmentOverridePresetSlug: null,
        equipmentOverrideItemSlugs: null,
      }],
    });

    renderScreen();

    clickButton("No Equipment");
    clickButton("Save changes");
    clickButton("Yes, update all future workouts");

    await waitFor(() => {
      expect(screen.getByText(
        "Equipment updated but regeneration failed. Try changing equipment from a specific workout day.",
      )).toBeInTheDocument();
    });
  });
});
