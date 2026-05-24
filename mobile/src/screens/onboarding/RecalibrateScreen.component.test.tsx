import React from "react";
import { axe } from "jest-axe";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RecalibrateScreenB } from "./RecalibrateScreen";

const {
  useMeMock,
  useActiveProgramsMock,
  useClientProfileMock,
  useEquipmentItemsMock,
  useReferenceDataMock,
  useUpdateClientProfileMock,
  updateProfileMutateAsyncMock,
  resetFromProfileMock,
  navigationNavigateMock,
  navigationGoBackMock,
} = vi.hoisted(() => ({
  useMeMock: vi.fn(),
  useActiveProgramsMock: vi.fn(),
  useClientProfileMock: vi.fn(),
  useEquipmentItemsMock: vi.fn(),
  useReferenceDataMock: vi.fn(),
  useUpdateClientProfileMock: vi.fn(),
  updateProfileMutateAsyncMock: vi.fn(),
  resetFromProfileMock: vi.fn(),
  navigationNavigateMock: vi.fn(),
  navigationGoBackMock: vi.fn(),
}));

vi.mock("../../api/hooks", () => ({
  useMe: useMeMock,
  useActivePrograms: useActiveProgramsMock,
  useClientProfile: useClientProfileMock,
  useEquipmentItems: useEquipmentItemsMock,
  useReferenceData: useReferenceDataMock,
  useUpdateClientProfile: useUpdateClientProfileMock,
}));

vi.mock("../../api/programDayActions", () => ({
  startEquipmentSubstitution: vi.fn(),
}));

vi.mock("../../state/onboarding/onboardingStore", () => ({
  useOnboardingStore: (selector: (state: { resetFromProfile: typeof resetFromProfileMock }) => unknown) =>
    selector({ resetFromProfile: resetFromProfileMock }),
}));

vi.mock("../../state/session/sessionStore", () => ({
  useSessionStore: (selector: (state: { activeProgramId: string | null }) => unknown) =>
    selector({ activeProgramId: "program-1" }),
}));

vi.mock("../../components/onboarding/OnboardingScaffold", () => ({
  OnboardingScaffold: ({
    children,
    onBack,
    onNext,
    nextLabel,
    nextDisabled,
  }: {
    children: React.ReactNode;
    onBack: () => void;
    onNext: () => void;
    nextLabel: string;
    nextDisabled: boolean;
  }) => (
    <div>
      {children}
      <button type="button" onClick={onBack}>
        Back
      </button>
      <button type="button" disabled={nextDisabled} onClick={onNext}>
        {nextLabel}
      </button>
    </div>
  ),
}));

vi.mock("../../components/onboarding/SectionCard", () => ({
  SectionCard: ({ title, children }: { title?: string; children: React.ReactNode }) => (
    <section>
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  ),
}));

vi.mock("../../components/onboarding/PillGrid", () => ({
  PillGrid: ({
    options,
    selectedValues,
    onToggle,
  }: {
    options: Array<{ label: string; value: string }>;
    selectedValues: string[];
    onToggle: (value: string) => void;
  }) => (
    <div>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={selectedValues.includes(option.value)}
          onClick={() => onToggle(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../../components/onboarding/DayChipRow", () => ({
  DayChipRow: () => null,
}));

vi.mock("../../components/onboarding/EquipmentCategorySection", () => ({
  EquipmentCategorySection: () => null,
}));

vi.mock("../../components/onboarding/MultilineField", () => ({
  MultilineField: () => null,
}));

vi.mock("../../components/onboarding/NumericField", () => ({
  NumericField: ({ label, testID, value, onChangeText }: any) => (
    <label>
      {label}
      <input data-testid={testID} value={value ?? ""} onChange={(event) => onChangeText?.(event.currentTarget.value)} />
    </label>
  ),
}));

vi.mock("../../components/onboarding/PresetCardList", () => ({
  PresetCardList: () => null,
}));

vi.mock("../../components/onboarding/SelectField", () => ({
  SelectField: () => null,
}));

const profile = {
  id: "profile-1",
  userId: "user-1",
  goals: ["Strength"],
  fitnessLevel: "Intermediate",
  preferredDays: ["Mon", "Wed"],
  scheduleConstraints: "No Sundays",
  minutesPerSession: 50,
  heightCm: 180,
  weightKg: 82,
  sex: "Male",
  ageRange: "25-34",
  equipmentPreset: "commercial_gym",
  equipmentItemCodes: ["barbell"],
  injuryFlags: [],
  goalNotes: "Build muscle",
  onboardingStepCompleted: 3,
};

function renderScreen(selectedCategories = ["goals"]) {
  return render(
    <RecalibrateScreenB
      navigation={{
        navigate: navigationNavigateMock,
        goBack: navigationGoBackMock,
        popToTop: vi.fn(),
      } as never}
      route={{
        key: "RecalibrateB",
        name: "RecalibrateB",
        params: { selectedCategories },
      } as never}
    />,
  );
}

describe("RecalibrateScreenB", () => {
  beforeEach(() => {
    useMeMock.mockReturnValue({
      data: { id: "user-1", clientProfileId: "profile-1" },
      isLoading: false,
    });
    useActiveProgramsMock.mockReturnValue({
      data: { primary_program_id: "primary-program-1", programs: [], today_sessions: [] },
      isLoading: false,
    });
    useClientProfileMock.mockReturnValue({
      data: profile,
      isLoading: false,
      isError: false,
    });
    useReferenceDataMock.mockReturnValue({
      data: { equipmentPresets: [] },
      isLoading: false,
    });
    useEquipmentItemsMock.mockReturnValue({
      data: { items: [] },
      isLoading: false,
    });
    updateProfileMutateAsyncMock.mockReset();
    updateProfileMutateAsyncMock.mockResolvedValue({
      ...profile,
      goals: ["Hypertrophy"],
    });
    useUpdateClientProfileMock.mockReturnValue({
      mutateAsync: updateProfileMutateAsyncMock,
      isPending: false,
    });
    resetFromProfileMock.mockReset();
    navigationNavigateMock.mockReset();
    navigationGoBackMock.mockReset();
  });
  it("has no accessibility violations in the default render state", async () => {
    renderScreen();
    await act(async () => {});
    document.body.firstElementChild?.setAttribute("role", "main");
    expect(await axe(document.body)).toHaveNoViolations();
  });


  it("seeds ProgramReview with newly selected goals before generating", async () => {
    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: "Strength" }));
    fireEvent.click(screen.getByRole("button", { name: "Hypertrophy" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate new program" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and generate" }));

    await waitFor(() => {
      expect(resetFromProfileMock).toHaveBeenCalledWith(expect.objectContaining({
        goals: ["Hypertrophy"],
        preferred_days: ["Mon", "Wed"],
        minutes_per_session: 50,
        equipment_preset_slug: "commercial_gym",
        equipment_items_slugs: ["barbell"],
      }));
      expect(navigationNavigateMock).toHaveBeenCalledWith("ProgramReview", { preserveDraft: true });
    });
  });

  it("opens split review after schedule recalibration even when day count is unchanged", async () => {
    renderScreen(["schedule"]);

    fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(navigationNavigateMock).toHaveBeenCalledWith("SplitReview", {
        fromRecalibrate: true,
        programId: "program-1",
        daysPerWeek: 2,
      });
    });
  });

  it("disables saving while profile data is loading", () => {
    useClientProfileMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderScreen();

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByText("Goals")).toBeInTheDocument();
  });

  it("handles profile query errors without crashing when no visual retry is surfaced", () => {
    useClientProfileMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: "profile failed" },
    });

    renderScreen();

    expect(screen.getByText("Goals")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).not.toBeDisabled();
  });

  it("shows an error when saving before generation fails", async () => {
    updateProfileMutateAsyncMock.mockRejectedValueOnce(new Error("generate failed"));
    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: "Generate new program" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and generate" }));

    expect(await screen.findByText("generate failed")).toBeInTheDocument();
    expect(navigationNavigateMock).not.toHaveBeenCalledWith("ProgramReview", { preserveDraft: true });
  });

  it("keeps validation local when no recalibration categories are selected", () => {
    renderScreen([]);

    expect(screen.getByText("No recalibration categories selected.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(updateProfileMutateAsyncMock).not.toHaveBeenCalled();
  });

  it("shows metric and imperial toggles in the metrics section", async () => {
    renderScreen(["metrics"]);

    expect(await screen.findByText("Metric (cm / kg)")).toBeInTheDocument();
    expect(screen.getByText("Imperial (ft, in / lbs)")).toBeInTheDocument();
  });

  it("switches metrics section to imperial height fields", async () => {
    renderScreen(["metrics"]);

    fireEvent.click(await screen.findByText("Imperial (ft, in / lbs)"));

    expect(screen.getByTestId("height-ft-input")).toBeInTheDocument();
  });
});
