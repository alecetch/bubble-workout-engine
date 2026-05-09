import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach } from "vitest";
import { EquipmentOverrideSheet } from "./EquipmentOverrideSheet";

const {
  useMeMock,
  useProgramEquipmentMock,
  useRegenerateDaysMock,
  useUpdateClientProfileMock,
  useReferenceDataMock,
  useEquipmentItemsMock,
  regenerateMutateAsyncMock,
  updateClientProfileMutateAsyncMock,
} = vi.hoisted(() => ({
  useMeMock: vi.fn(),
  useProgramEquipmentMock: vi.fn(),
  useRegenerateDaysMock: vi.fn(),
  useUpdateClientProfileMock: vi.fn(),
  useReferenceDataMock: vi.fn(),
  useEquipmentItemsMock: vi.fn(),
  regenerateMutateAsyncMock: vi.fn(),
  updateClientProfileMutateAsyncMock: vi.fn(),
}));

vi.mock("../../api/hooks", () => ({
  useMe: useMeMock,
  useProgramEquipment: useProgramEquipmentMock,
  useRegenerateDays: useRegenerateDaysMock,
  useUpdateClientProfile: useUpdateClientProfileMock,
  useReferenceData: useReferenceDataMock,
  useEquipmentItems: useEquipmentItemsMock,
}));

vi.mock("../onboarding/PresetCardList", () => ({
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

vi.mock("../onboarding/EquipmentCategorySection", () => ({
  EquipmentCategorySection: () => null,
}));

vi.mock("../interaction/PressableScale", () => ({
  PressableScale: ({
    children,
    onPress,
    disabled,
    accessibilityLabel,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    accessibilityLabel?: string;
  }) => (
    <button
      type="button"
      disabled={disabled}
      aria-label={accessibilityLabel}
      onClick={() => onPress?.()}
    >
      {children}
    </button>
  ),
}));

const defaultProps = {
  visible: true,
  onClose: vi.fn(),
  onApplied: vi.fn(),
  programId: "prog-1",
  programDayId: "day-1",
  scheduledWeekday: "Mon",
  scheduledWeekdayLabel: "Mondays",
  weekNumber: 1,
  currentPresetSlug: "commercial_gym",
  currentItemSlugs: ["barbell"],
};

function renderSheet(props: Partial<React.ComponentProps<typeof EquipmentOverrideSheet>> = {}) {
  return render(<EquipmentOverrideSheet {...defaultProps} {...props} />);
}

function clickButton(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

afterEach(() => {
  cleanup();
});

describe("EquipmentOverrideSheet", () => {
  beforeEach(() => {
    regenerateMutateAsyncMock.mockReset();
    updateClientProfileMutateAsyncMock.mockReset();
    regenerateMutateAsyncMock.mockResolvedValue({
      regenerated: 1,
      skipped: 0,
      partiallyLogged: 0,
      dayIds: ["day-1"],
    });
    updateClientProfileMutateAsyncMock.mockResolvedValue({});

    useMeMock.mockReturnValue({
      data: { id: "user-1", clientProfileId: "profile-1" },
      isLoading: false,
    });
    useProgramEquipmentMock.mockReturnValue({
      data: {
        profileDefault: {
          equipmentPresetSlug: "commercial_gym",
          equipmentItemSlugs: ["barbell"],
        },
        futureDays: [
          { programDayId: "day-2", scheduledWeekday: "Wed", weekNumber: 1 },
        ],
      },
      isLoading: false,
      refetch: vi.fn().mockResolvedValue({
        data: {
          profileDefault: {
            equipmentPresetSlug: "commercial_gym",
            equipmentItemSlugs: ["barbell"],
          },
          futureDays: [
            { programDayId: "day-2", scheduledWeekday: "Wed", weekNumber: 1 },
          ],
        },
      }),
    });
    useReferenceDataMock.mockReturnValue({
      data: {
        equipmentPresets: [
          { code: "commercial_gym", label: "Commercial Gym" },
          { code: "bodyweight", label: "No Equipment" },
        ],
      },
      isLoading: false,
    });
    useEquipmentItemsMock.mockReturnValue({
      data: { items: [] },
      isLoading: false,
    });
    useRegenerateDaysMock.mockReturnValue({
      mutateAsync: regenerateMutateAsyncMock,
      isPending: false,
    });
    useUpdateClientProfileMock.mockReturnValue({
      mutateAsync: updateClientProfileMutateAsyncMock,
      isPending: false,
    });
  });

  it("renders the preset list on mount", () => {
    renderSheet();

    expect(screen.getByText("Commercial Gym")).toBeInTheDocument();
    expect(screen.getByText("No Equipment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
  });

  it("moves to the scope step when Apply is tapped", () => {
    renderSheet();

    clickButton("Apply");

    expect(screen.getByText(/Apply to/i)).toBeInTheDocument();
  });

  it("calls regenerate with only the current day for Today only", async () => {
    renderSheet();

    clickButton("Apply");
    clickButton("Today only");

    await waitFor(() => {
      expect(regenerateMutateAsyncMock).toHaveBeenCalledWith({
        dayIds: ["day-1"],
        equipmentPresetSlug: "commercial_gym",
        equipmentItemSlugs: ["barbell"],
      });
    });
  });

  it("moves to the confirm-global step without regenerating immediately for All future workouts", () => {
    renderSheet();

    clickButton("Apply");
    clickButton("All future workouts");

    expect(screen.getByText("Yes, update my default")).toBeInTheDocument();
    expect(regenerateMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("updates the client profile before regenerating on the confirm-global yes path", async () => {
    renderSheet();

    clickButton("Apply");
    clickButton("All future workouts");
    clickButton("Yes, update my default");

    await waitFor(() => {
      expect(updateClientProfileMutateAsyncMock).toHaveBeenCalled();
      expect(regenerateMutateAsyncMock).toHaveBeenCalled();
    });

    expect(updateClientProfileMutateAsyncMock.mock.invocationCallOrder[0]).toBeLessThan(
      regenerateMutateAsyncMock.mock.invocationCallOrder[0],
    );
  });

  it("regenerates without patching the profile on the confirm-global no path", async () => {
    renderSheet();

    clickButton("Apply");
    clickButton("All future workouts");
    clickButton("No, just update these workouts");

    await waitFor(() => {
      expect(regenerateMutateAsyncMock).toHaveBeenCalled();
    });
    expect(updateClientProfileMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("calls onClose when the backdrop is pressed", () => {
    const onClose = vi.fn();
    renderSheet({ onClose });

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);

    expect(onClose).toHaveBeenCalled();
  });

  it("stays on the scope step and shows the error when regeneration fails", async () => {
    regenerateMutateAsyncMock.mockRejectedValueOnce(new Error("Network error"));
    renderSheet();

    clickButton("Apply");
    clickButton("Today only");

    await waitFor(() => {
      expect(screen.getByText(/Apply to/i)).toBeInTheDocument();
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });
});
