import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Alert } from "react-native";
import { DayPreviewCard } from "./DayPreviewCard";

vi.mock("@react-native-community/datetimepicker", () => ({
  default: ({ minimumDate }: { minimumDate?: Date }) => (
    <div data-testid="date-time-picker" data-minimum-date={minimumDate?.toISOString() ?? ""} />
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
        equipmentSlugs: ["barbell"],
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

  it("closes the session options sheet before showing the reschedule date picker", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Session options" }));
    expect(screen.getByText("Skip this session")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reschedule/i }));

    expect(screen.queryByText("Skip this session")).not.toBeInTheDocument();
    expect(screen.getByTestId("date-time-picker")).toBeInTheDocument();
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
