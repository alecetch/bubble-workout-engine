import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { OnboardingScaffold } from "../../components/onboarding/OnboardingScaffold";
import { DayChipRow } from "../../components/onboarding/DayChipRow";
import { EquipmentCategorySection } from "../../components/onboarding/EquipmentCategorySection";
import { MultilineField } from "../../components/onboarding/MultilineField";
import { NumericField } from "../../components/onboarding/NumericField";
import { PillGrid } from "../../components/onboarding/PillGrid";
import { PresetCardList } from "../../components/onboarding/PresetCardList";
import { SectionCard } from "../../components/onboarding/SectionCard";
import { SelectField } from "../../components/onboarding/SelectField";
import { useClientProfile, useEquipmentItems, useMe, useReferenceData, useUpdateClientProfile } from "../../api/hooks";
import { startEquipmentSubstitution } from "../../api/programDayActions";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import {
  AGE_RANGES,
  DAYS_OF_WEEK,
  FITNESS_LEVELS,
  GOAL_TYPES,
  MINUTES_PER_SESSION,
  SEX_OPTIONS,
  type AgeRange,
  type DayOfWeek,
  type EquipmentPreset,
  type FitnessLevel,
  type GoalType,
  type MinutesPerSession,
  type OnboardingDraft,
  type Sex,
} from "../../state/onboarding/types";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { toTitleCase } from "../../utils/text";

export type ChangeCategory = "goals" | "schedule" | "equipment" | "metrics";

const CHANGE_CATEGORIES: Array<{ value: ChangeCategory; label: string }> = [
  { value: "goals", label: "Goals" },
  { value: "schedule", label: "Schedule" },
  { value: "equipment", label: "Equipment" },
  { value: "metrics", label: "Body metrics" },
];

type RecalibrateAProps = NativeStackScreenProps<OnboardingStackParamList, "RecalibrateA">;
type RecalibrateBProps = NativeStackScreenProps<OnboardingStackParamList, "RecalibrateB">;

type EquipmentCatalogItem = {
  code: string;
  label: string;
  category: string | null;
};

function toSlug(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toggleValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function mapGoals(values: unknown): GoalType[] {
  const aliases = new Map<string, GoalType>([
    ["strength", "Strength"],
    ["hypertrophy", "Hypertrophy"],
    ["conditioning", "Conditioning"],
    ["hyrox", "HYROX Workout"],
    ["hyrox_workout", "HYROX Workout"],
    ["hyrox_competition", "HYROX Workout"],
  ]);
  const raw = Array.isArray(values) ? values : [];
  return Array.from(new Set(raw.map((value) => aliases.get(toSlug(value))).filter((value): value is GoalType => Boolean(value))));
}

function mapFitness(value: unknown): FitnessLevel | null {
  const slug = toSlug(value);
  return FITNESS_LEVELS.find((item) => toSlug(item) === slug) ?? null;
}

function mapDays(values: unknown): DayOfWeek[] {
  const aliases = new Map<string, DayOfWeek>([
    ["mon", "Mon"],
    ["monday", "Mon"],
    ["tue", "Tues"],
    ["tues", "Tues"],
    ["tuesday", "Tues"],
    ["wed", "Wed"],
    ["wednesday", "Wed"],
    ["thu", "Thurs"],
    ["thur", "Thurs"],
    ["thurs", "Thurs"],
    ["thursday", "Thurs"],
    ["fri", "Fri"],
    ["friday", "Fri"],
    ["sat", "Sat"],
    ["saturday", "Sat"],
    ["sun", "Sun"],
    ["sunday", "Sun"],
  ]);
  const raw = Array.isArray(values) ? values : [];
  return Array.from(new Set(raw.map((value) => aliases.get(toSlug(value))).filter((value): value is DayOfWeek => Boolean(value))));
}

function mapSex(value: unknown): Sex | null {
  const slug = toSlug(value);
  return SEX_OPTIONS.find((item) => toSlug(item) === slug) ?? null;
}

function mapAge(value: unknown): AgeRange | null {
  const slug = toSlug(value);
  return AGE_RANGES.find((item) => toSlug(item) === slug) ?? null;
}

function mapMinutes(value: unknown): MinutesPerSession | null {
  const numeric = Number(value);
  return MINUTES_PER_SESSION.includes(numeric as MinutesPerSession) ? (numeric as MinutesPerSession) : null;
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function dedupeEquipmentItems(items: EquipmentCatalogItem[]): EquipmentCatalogItem[] {
  return Array.from(new Map(items.map((item) => [item.code, item])).values());
}

function useEquipmentCatalog(selectedPresetCode: string | null) {
  const referenceDataQuery = useReferenceData();
  const equipmentItemsQuery = useEquipmentItems(selectedPresetCode);

  const presetOptions = useMemo(
    () => (referenceDataQuery.data?.equipmentPresets ?? []).map((preset) => ({ value: preset.code, title: preset.label })),
    [referenceDataQuery.data?.equipmentPresets],
  );

  const fullCatalogItems = useMemo<EquipmentCatalogItem[]>(() => {
    const raw = referenceDataQuery.data as unknown as Record<string, unknown> | undefined;
    const maybeItems = raw?.equipmentItems ?? raw?.equipment_items;
    if (!Array.isArray(maybeItems)) return [];
    return dedupeEquipmentItems(
      maybeItems
        .map((item) => {
          const row = item as Record<string, unknown>;
          const code = String(row.code ?? "").trim();
          if (!code) return null;
          return {
            code,
            label: String(row.label ?? code),
            category: typeof row.category === "string" && row.category.trim() ? row.category.trim() : null,
          };
        })
        .filter((item): item is EquipmentCatalogItem => Boolean(item)),
    );
  }, [referenceDataQuery.data]);

  const presetItems = useMemo<EquipmentCatalogItem[]>(
    () => dedupeEquipmentItems((equipmentItemsQuery.data?.items ?? []).map((item) => ({
      code: item.code,
      label: item.label,
      category: item.category,
    }))),
    [equipmentItemsQuery.data?.items],
  );

  return {
    referenceDataQuery,
    equipmentItemsQuery,
    presetOptions,
    catalogItems: fullCatalogItems.length > 0 ? fullCatalogItems : presetItems,
  };
}

export function RecalibrateScreenA({ navigation }: RecalibrateAProps): React.JSX.Element {
  const [selectedCategories, setSelectedCategories] = useState<ChangeCategory[]>([]);

  return (
    <OnboardingScaffold
      step={1}
      title="Recalibrate"
      subtitle="Choose what has changed so we only adjust what matters."
      errorBannerVisible={false}
      onBack={() => navigation.goBack()}
      onNext={() => navigation.navigate("RecalibrateB", { selectedCategories })}
      nextLabel="Next"
      nextDisabled={selectedCategories.length === 0}
      isSaving={false}
    >
      <SectionCard title="What changed?">
        <PillGrid
          options={CHANGE_CATEGORIES}
          selectedValues={selectedCategories}
          onToggle={(value) => setSelectedCategories((current) => toggleValue(current, value as ChangeCategory))}
        />
      </SectionCard>
    </OnboardingScaffold>
  );
}

export function RecalibrateScreenB({ route, navigation }: RecalibrateBProps): React.JSX.Element {
  const selectedCategories = route.params.selectedCategories ?? [];
  const includes = (category: ChangeCategory): boolean => selectedCategories.includes(category);

  const meQuery = useMe();
  const profileId = meQuery.data?.clientProfileId ?? "";
  const profileQuery = useClientProfile(profileId);
  const updateProfile = useUpdateClientProfile(profileId);
  const activeProgramId = useSessionStore((state) => state.activeProgramId);
  const resetFromProfile = useOnboardingStore((state) => state.resetFromProfile);

  const [draft, setDraftState] = useState<Partial<OnboardingDraft>>({});
  const [seededProfileId, setSeededProfileId] = useState<string | null>(null);
  const [programAction, setProgramAction] = useState<"keep" | "regenerate">("keep");
  const [equipmentChanged, setEquipmentChanged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsedByCategory, setCollapsedByCategory] = useState<Record<string, boolean>>({});

  const {
    referenceDataQuery,
    equipmentItemsQuery,
    presetOptions,
    catalogItems,
  } = useEquipmentCatalog(draft.equipmentPresetCode ?? null);

  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile || seededProfileId === profile.id) return;
    setDraftState({
      goals: mapGoals(profile.goals),
      fitnessLevel: mapFitness(profile.fitnessLevel),
      preferredDays: mapDays(profile.preferredDays),
      scheduleConstraints: String(profile.scheduleConstraints ?? ""),
      minutesPerSession: mapMinutes(profile.minutesPerSession),
      heightCm: numberOrNull(profile.heightCm),
      weightKg: numberOrNull(profile.weightKg),
      sex: mapSex(profile.sex),
      ageRange: mapAge(profile.ageRange),
      equipmentPresetCode: String(profile.equipmentPreset ?? profile.equipmentPresetCode ?? "") || null,
      selectedEquipmentCodes: Array.isArray(profile.equipmentItemCodes)
        ? profile.equipmentItemCodes.map(String)
        : [],
    });
    setSeededProfileId(profile.id);
  }, [profileQuery.data, seededProfileId]);

  useEffect(() => {
    if (!draft.equipmentPresetCode || !equipmentChanged || !equipmentItemsQuery.data) return;
    setDraft({
      selectedEquipmentCodes: equipmentItemsQuery.data.items.map((item) => item.code).filter(Boolean),
    });
  }, [draft.equipmentPresetCode, equipmentChanged, equipmentItemsQuery.data]);

  const groupedEquipmentOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    const groups: Record<string, Array<{ value: string; label: string }>> = {};
    catalogItems.forEach((item) => {
      const label = toTitleCase(item.label);
      if (query && !label.toLowerCase().includes(query)) return;
      const category = item.category ? toTitleCase(item.category) : "Other";
      groups[category] = groups[category] ?? [];
      groups[category].push({ value: item.code, label });
    });
    return Object.entries(groups)
      .map(([category, options]) => ({
        category,
        options: options.sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [catalogItems, search]);

  function setDraft(patch: Partial<OnboardingDraft>): void {
    setDraftState((current) => ({ ...current, ...patch }));
  }

  function markEquipmentPatch(patch: Partial<OnboardingDraft>): void {
    setEquipmentChanged(true);
    setDraft(patch);
  }

  async function handleSave(): Promise<void> {
    if (!profileId || selectedCategories.length === 0 || isSaving) return;
    setIsSaving(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {};
      if (includes("goals")) payload.goals = draft.goals ?? [];
      if (includes("schedule")) {
        payload.preferredDays = draft.preferredDays ?? [];
        payload.minutesPerSession = draft.minutesPerSession ?? null;
        payload.scheduleConstraints = draft.scheduleConstraints ?? "";
      }
      if (includes("equipment")) {
        payload.equipmentPreset = draft.equipmentPresetCode ?? null;
        payload.equipmentItemCodes = draft.selectedEquipmentCodes ?? [];
      }
      if (includes("metrics")) {
        payload.heightCm = draft.heightCm ?? null;
        payload.weightKg = draft.weightKg ?? null;
        payload.sex = draft.sex ?? null;
        payload.ageRange = draft.ageRange ?? null;
        payload.fitnessLevel = draft.fitnessLevel ?? null;
      }

      const updatedProfile = await updateProfile.mutateAsync(
        payload as Parameters<typeof updateProfile.mutateAsync>[0],
      );

      if (includes("goals") && programAction === "regenerate") {
        resetFromProfile({
          goals: draft.goals ?? mapGoals(updatedProfile.goals),
          fitnessLevel: draft.fitnessLevel ?? mapFitness(updatedProfile.fitnessLevel),
          preferred_days: draft.preferredDays ?? mapDays(updatedProfile.preferredDays),
          scheduleConstraints: draft.scheduleConstraints ?? updatedProfile.scheduleConstraints,
          minutes_per_session: draft.minutesPerSession ?? mapMinutes(updatedProfile.minutesPerSession),
          heightCm: draft.heightCm ?? numberOrNull(updatedProfile.heightCm),
          weightKg: draft.weightKg ?? numberOrNull(updatedProfile.weightKg),
          sex: draft.sex ?? mapSex(updatedProfile.sex),
          ageRange: draft.ageRange ?? mapAge(updatedProfile.ageRange),
          equipment_preset_slug: draft.equipmentPresetCode ?? updatedProfile.equipmentPreset ?? null,
          equipment_items_slugs: draft.selectedEquipmentCodes ?? updatedProfile.equipmentItemCodes ?? [],
          injuryFlags: updatedProfile.injuryFlags ?? [],
          goalNotes: updatedProfile.goalNotes ?? null,
          onboardingStepCompleted: updatedProfile.onboardingStepCompleted ?? 0,
        });
        navigation.navigate("ProgramReview", { preserveDraft: true });
        return;
      }

      if (includes("equipment") && equipmentChanged && activeProgramId && (draft.selectedEquipmentCodes?.length ?? 0) > 0) {
        const { jobId } = await startEquipmentSubstitution(activeProgramId, draft.selectedEquipmentCodes ?? []);
        navigation.navigate("SubstitutionProgress", { programId: activeProgramId, jobId });
        return;
      }

      if (activeProgramId) {
        navigation.navigate("ProgramDashboard", { programId: activeProgramId });
      } else {
        navigation.popToTop();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const nextLabel = includes("goals") && programAction === "regenerate" ? "Save and generate" : "Save changes";
  const nextDisabled = isSaving || selectedCategories.length === 0 || meQuery.isLoading || profileQuery.isLoading;

  return (
    <OnboardingScaffold
      step={2}
      title="Recalibrate"
      subtitle="Update the fields that have changed."
      errorBannerVisible={Boolean(error)}
      onBack={() => navigation.goBack()}
      onNext={() => void handleSave()}
      nextLabel={nextLabel}
      nextDisabled={nextDisabled}
      isSaving={isSaving}
    >
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {includes("goals") ? (
        <>
          <SectionCard title="Goals">
            <PillGrid
              options={GOAL_TYPES.map((goal) => ({ label: goal, value: goal }))}
              selectedValues={draft.goals ?? []}
              onToggle={(value) => setDraft({ goals: toggleValue(draft.goals ?? [], value as GoalType) })}
            />
          </SectionCard>
          <SectionCard title="What do you want to do with your program?">
            <PillGrid
              options={[
                { label: "Keep current program", value: "keep" },
                { label: "Generate new program", value: "regenerate" },
              ]}
              selectedValues={[programAction]}
              onToggle={(value) => setProgramAction(value as "keep" | "regenerate")}
            />
          </SectionCard>
        </>
      ) : null}

      {includes("schedule") ? (
        <>
          <SectionCard title="Preferred training days">
            <DayChipRow
              days={DAYS_OF_WEEK.map((day) => ({ label: day, value: day }))}
              selectedValues={draft.preferredDays ?? []}
              onToggle={(value) => setDraft({ preferredDays: toggleValue(draft.preferredDays ?? [], value as DayOfWeek) })}
            />
          </SectionCard>
          <SectionCard title="Session length">
            <SelectField
              label="Minutes per session"
              placeholder="Select duration"
              valueLabel={draft.minutesPerSession ? `${draft.minutesPerSession} min` : undefined}
              options={MINUTES_PER_SESSION.map((minutes) => ({ label: `${minutes} min`, value: String(minutes) }))}
              onSelect={(value) => setDraft({ minutesPerSession: Number(value) as MinutesPerSession })}
            />
          </SectionCard>
          <SectionCard title="Any constraints?">
            <MultilineField
              label="Schedule constraints"
              placeholder="e.g. no early mornings, rest on Sundays..."
              value={draft.scheduleConstraints ?? ""}
              onChangeText={(value) => setDraft({ scheduleConstraints: value })}
            />
          </SectionCard>
        </>
      ) : null}

      {includes("equipment") ? (
        <SectionCard title="Equipment">
          <PresetCardList
            options={presetOptions}
            selectedValue={draft.equipmentPresetCode ?? null}
            onSelect={(value) => markEquipmentPatch({ equipmentPresetCode: value as EquipmentPreset, selectedEquipmentCodes: [] })}
          />
          {referenceDataQuery.isLoading ? <Text style={styles.statusText}>Loading equipment...</Text> : null}
          {draft.equipmentPresetCode && equipmentItemsQuery.isLoading ? <Text style={styles.statusText}>Loading preset items...</Text> : null}
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search equipment"
            placeholderTextColor={colors.textSecondary}
            style={styles.searchInput}
          />
          {groupedEquipmentOptions.map((group) => (
            <EquipmentCategorySection
              key={group.category}
              category={group.category}
              options={group.options}
              selectedValues={draft.selectedEquipmentCodes ?? []}
              collapsed={Boolean(collapsedByCategory[group.category])}
              onToggleCollapsed={() => setCollapsedByCategory((current) => ({
                ...current,
                [group.category]: !current[group.category],
              }))}
              onToggleItem={(code) => markEquipmentPatch({
                selectedEquipmentCodes: toggleValue(draft.selectedEquipmentCodes ?? [], code),
              })}
            />
          ))}
        </SectionCard>
      ) : null}

      {includes("metrics") ? (
        <>
          <SectionCard title="Body measurements">
            <NumericField
              label="Height (cm)"
              value={draft.heightCm == null ? "" : String(draft.heightCm)}
              onChangeText={(value) => setDraft({ heightCm: numberOrNull(value) })}
            />
            <NumericField
              label="Weight (kg)"
              value={draft.weightKg == null ? "" : String(draft.weightKg)}
              onChangeText={(value) => setDraft({ weightKg: numberOrNull(value) })}
            />
          </SectionCard>
          <SectionCard title="About you">
            <SelectField
              label="Sex"
              placeholder="Select sex"
              valueLabel={draft.sex ?? undefined}
              options={SEX_OPTIONS.map((sex) => ({ label: sex, value: sex }))}
              onSelect={(value) => setDraft({ sex: value as Sex })}
            />
            <SelectField
              label="Age range"
              placeholder="Select age range"
              valueLabel={draft.ageRange ?? undefined}
              options={AGE_RANGES.map((age) => ({ label: age, value: age }))}
              onSelect={(value) => setDraft({ ageRange: value as AgeRange })}
            />
            <SelectField
              label="Fitness level"
              placeholder="Select fitness level"
              valueLabel={draft.fitnessLevel ?? undefined}
              options={FITNESS_LEVELS.map((level) => ({ label: level, value: level }))}
              onSelect={(value) => setDraft({ fitnessLevel: value as FitnessLevel })}
            />
          </SectionCard>
        </>
      ) : null}

      {selectedCategories.length === 0 ? (
        <Text style={styles.statusText}>No recalibration categories selected.</Text>
      ) : null}
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: colors.warning,
    ...typography.small,
  },
  statusText: {
    color: colors.textSecondary,
    ...typography.small,
  },
  searchInput: {
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    ...typography.body,
  },
});
