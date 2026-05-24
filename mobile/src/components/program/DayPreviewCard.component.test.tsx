import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Alert } from "react-native";
import { DayPreviewCard } from "./DayPreviewCard";

vi.mock("@react-native-community/datetimepicker", () => ({
  default: ({
    minimumDate,
    themeVariant,
    textColor,
    accentColor,
  }: {
    minimumDate?: Date;
    themeVariant?: string;
    textColor?: string;
    accentColor?: string;
  }) => (
    <div
      data-testid="date-time-picker"
      data-minimum-date={minimumDate?.toISOString() ?? ""}
      data-theme-variant={themeVariant ?? ""}
      data-text-color={textColor ?? ""}
      data-accent-color={accentColor ?? ""}
    />
  ),
}));

vi.mock("../interaction/PressableScale", () => ({
  PressableScale: ({
    children,
    onPress,
    disabled,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

vi.mock("../../api/programDayActions", () => ({
  rescheduleProgramDay: vi.fn().mockResolvedValue({}),
  skipProgramDay: vi.fn().mockResolvedValue({}),
}));

function renderCard(
  preview: Partial<React.ComponentProps<typeof DayPreviewCard>["preview"]> = {},
) {
  return render(
    <DayPreviewCard
      programId="program-1"
      preview={{
        programDayId: "day-1",
        label: "Day 1",
        type: "Strength",
        sessionDuration: 45,
        equipmentNames: ["Barbell and plates"],
        ...preview,
      }}
      onStartWorkout={vi.fn()}
    />,
  );
}

describe("DayPreviewCard", () => {
  beforeEach(() => {
    vi.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the compact day label without metadata row labels", () => {
    renderCard();

    expect(screen.getByText("Day Preview")).toBeInTheDocument();
    expect(screen.getByText("Day 1")).toBeInTheDocument();
    expect(screen.queryByText("Label")).not.toBeInTheDocument();
    expect(screen.queryByText("Type")).not.toBeInTheDocument();
    expect(screen.queryByText("Duration")).not.toBeInTheDocument();
  });

  it("renders duration as a compact pill when present", () => {
    renderCard();

    expect(screen.getByText("45 min")).toBeInTheDocument();
  });

  it("omits duration when the preview has no duration", () => {
    renderCard({ sessionDuration: undefined });

    expect(screen.queryByText(/min/)).not.toBeInTheDocument();
  });

  it("renders equipment names without slug title-casing", () => {
    renderCard({ equipmentNames: ["Barbell and plates", "TRX straps"] });

    expect(screen.getByText("Barbell and plates")).toBeInTheDocument();
    expect(screen.getByText("TRX straps")).toBeInTheDocument();
  });

  it("shows the empty equipment state when no equipment names are set", () => {
    renderCard({ equipmentNames: [] });

    expect(screen.getByText("Not set")).toBeInTheDocument();
  });

  it("closes the session options sheet before showing the reschedule date picker", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Session options" }));
    expect(screen.getByText("Skip this session")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reschedule/i }));

    expect(screen.queryByText("Skip this session")).not.toBeInTheDocument();
    expect(screen.getByTestId("date-time-picker")).toBeInTheDocument();
  });

  it("renders the reschedule picker with readable dark-theme colors", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Session options" }));
    fireEvent.click(screen.getByRole("button", { name: /Reschedule/i }));

    const picker = screen.getByTestId("date-time-picker");
    expect(picker).toHaveAttribute("data-theme-variant", "dark");
    expect(picker).toHaveAttribute("data-text-color", "#F8FAFC");
    expect(picker).toHaveAttribute("data-accent-color", "#3B82F6");
  });

  it("shows the standard confirmation before skipping an incomplete session", () => {
    renderCard({ isCompleted: false });

    fireEvent.click(screen.getByRole("button", { name: "Session options" }));
    fireEvent.click(screen.getByRole("button", { name: /Skip this session/i }));

    expect(Alert.alert).toHaveBeenCalledWith(
      "Mark this session as skipped?",
      "It won't count toward your required sessions.",
      expect.any(Array),
    );
  });

  it("warns when skipping an already completed session", () => {
    renderCard({ isCompleted: true });

    fireEvent.click(screen.getByRole("button", { name: "Session options" }));
    fireEvent.click(screen.getByRole("button", { name: /Skip this session/i }));

    expect(Alert.alert).toHaveBeenCalledWith(
      "Session already completed",
      "This session has exercises logged and is marked complete. Are you sure you want to skip it? This will remove it from your required sessions.",
      expect.any(Array),
    );
  });
});
