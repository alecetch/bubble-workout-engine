import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { OnboardingScaffold } from "../../components/onboarding/OnboardingScaffold";
import { EquipmentCategorySection } from "../../components/onboarding/EquipmentCategorySection";
import { PressableScale } from "../../components/interaction/PressableScale";
import { useEquipmentItems, useReferenceData } from "../../api/hooks";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { toTitleCase } from "../../utils/text";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";

type Props = NativeStackScreenProps<OnboardingStackParamList, "Step2EquipmentDetail">;

type EquipmentCatalogItem = {
  code: string;
  label: string;
  category: string | null;
};

function dedupeEquipmentItems(items: EquipmentCatalogItem[]): EquipmentCatalogItem[] {
  const byCode = new Map<string, EquipmentCatalogItem>();
  items.forEach((item) => {
    const existing = byCode.get(item.code);
    if (!existing) {
      byCode.set(item.code, item);
      return;
    }
    byCode.set(item.code, {
      code: existing.code,
      label: existing.label || item.label,
      category: existing.category ?? item.category,
    });
  });
  return Array.from(byCode.values());
}

export function Step2EquipmentDetailScreen({ navigation }: Props): React.JSX.Element {
  const referenceDataQuery = useReferenceData();

  const draft = useOnboardingStore((state) => state.draft);
  const setDraft = useOnboardingStore((state) => state.setDraft);

  const selectedPresetCode = draft.equipmentPresetCode;
  const equipmentItemsQuery = useEquipmentItems(selectedPresetCode);

  const [search, setSearch] = useState("");
  const [collapsedByCategory, setCollapsedByCategory] = useState<Record<string, boolean>>({});

  const presetOptions = useMemo(
    () =>
      (referenceDataQuery.data?.equipmentPresets ?? []).map((preset) => ({
        value: preset.code,
        title: preset.label,
      })),
    [referenceDataQuery.data?.equipmentPresets],
  );

  const selectedPresetTitle = useMemo(
    () => presetOptions.find((preset) => preset.value === selectedPresetCode)?.title ?? "this preset",
    [presetOptions, selectedPresetCode],
  );

  const fullCatalogItems = useMemo<EquipmentCatalogItem[] | null>(() => {
    const raw = referenceDataQuery.data as unknown as Record<string, unknown> | undefined;
    const maybeItems = raw?.equipmentItems ?? raw?.equipment_items;
    if (!Array.isArray(maybeItems)) return null;
    const mapped = maybeItems
      .map((item) => {
        const record = item as Record<string, unknown>;
        const code = String(record.code ?? "").trim();
        if (!code) return null;
        const label = String(record.label ?? code);
        const categoryRaw = record.category;
        const category = typeof categoryRaw === "string" && categoryRaw.trim() ? categoryRaw.trim() : null;
        return { code, label, category };
      })
      .filter((item): item is EquipmentCatalogItem => Boolean(item));
    const deduped = dedupeEquipmentItems(mapped);
    return deduped.length > 0 ? deduped : null;
  }, [referenceDataQuery.data]);

  const presetItems = useMemo<EquipmentCatalogItem[]>(
    () =>
      dedupeEquipmentItems(
        (equipmentItemsQuery.data?.items ?? []).map((item) => ({
          code: item.code,
          label: item.label,
          category: item.category,
        })),
      ),
    [equipmentItemsQuery.data?.items],
  );

  const catalogSourceItems = useMemo(
    () => fullCatalogItems ?? presetItems,
    [fullCatalogItems, presetItems],
  );

  const hasFullCatalog = Boolean(fullCatalogItems && fullCatalogItems.length > 0);

  const groupedCategoryOptions = useMemo(() => {
    const byCategory: Record<string, Array<{ value: string; label: string }>> = {};
    const query = search.trim().toLowerCase();
    catalogSourceItems.forEach((item) => {
      const displayLabel = toTitleCase(item.label);
      if (query && !displayLabel.toLowerCase().includes(query)) return;
      const category = item.category ? toTitleCase(item.category) : "Other";
      byCategory[category] = byCategory[category] ?? [];
      byCategory[category].push({ value: item.code, label: displayLabel });
    });
    return Object.entries(byCategory)
      .map(([category, options]) => ({
        category,
        options: options.sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [catalogSourceItems, search]);

  useEffect(() => {
    const keys = groupedCategoryOptions.map((group) => group.category);
    setCollapsedByCategory((current) => {
      const next: Record<string, boolean> = {};
      keys.forEach((key) => {
        next[key] = current[key] ?? false;
      });
      return next;
    });
  }, [groupedCategoryOptions]);

  const toggleEquipmentItem = (code: string): void => {
    const selectedEquipmentCodes = draft.selectedEquipmentCodes.includes(code)
      ? draft.selectedEquipmentCodes.filter((item) => item !== code)
      : [...draft.selectedEquipmentCodes, code];
    setDraft({ selectedEquipmentCodes });
  };

  const subtitle = `You're set up for ${selectedPresetTitle}. Add or remove items to match what you actually have.`;

  const handleDone = (): void => {
    navigation.goBack();
  };

  return (
    <OnboardingScaffold
      step={2}
      title="Your equipment"
      subtitle={subtitle}
      errorBannerVisible={false}
      onBack={handleDone}
      onNext={handleDone}
      nextLabel="Done"
      nextDisabled={false}
      isSaving={false}
    >
      {equipmentItemsQuery.isLoading ? (
        <Text style={styles.statusText}>Loading equipment list…</Text>
      ) : equipmentItemsQuery.isError || catalogSourceItems.length === 0 ? (
        <View style={styles.retryRow}>
          <Text style={styles.errorText}>No equipment available.</Text>
          <PressableScale
            style={styles.retryButton}
            onPress={() => {
              void equipmentItemsQuery.refetch();
            }}
          >
            <Text style={styles.retryLabel}>Retry</Text>
          </PressableScale>
        </View>
      ) : (
        <>
          <View style={styles.helperBox}>
            <Text style={styles.helperText}>
              {`Below is a typical equipment setup for ${selectedPresetTitle}. You can add or remove items to match what you actually have available.`}
            </Text>
            <Text style={styles.helperSubtext}>
              Tip: if you have extra kit (e.g., a BikeErg at home), add it from the categories below.
            </Text>
          </View>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search equipment"
            placeholderTextColor={colors.textSecondary}
            textContentType="none"
            autoComplete="off"
            style={styles.searchInput}
          />

          {groupedCategoryOptions.map((group) => (
            <EquipmentCategorySection
              key={group.category}
              category={group.category}
              options={group.options}
              selectedValues={draft.selectedEquipmentCodes}
              collapsed={Boolean(collapsedByCategory[group.category])}
              onToggleCollapsed={() => {
                setCollapsedByCategory((current) => ({
                  ...current,
                  [group.category]: !current[group.category],
                }));
              }}
              onToggleItem={toggleEquipmentItem}
            />
          ))}

          {groupedCategoryOptions.length === 0 ? (
            <Text style={styles.statusText}>No equipment matches your search.</Text>
          ) : null}

          {!hasFullCatalog ? (
            <Text style={styles.catalogFallbackText}>
              More equipment options will appear here once the full catalog endpoint is connected.
            </Text>
          ) : null}
        </>
      )}
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  statusText: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    ...typography.small,
  },
  helperBox: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  helperText: {
    color: colors.textPrimary,
    ...typography.small,
  },
  helperSubtext: {
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
  catalogFallbackText: {
    color: colors.textSecondary,
    ...typography.small,
  },
  retryRow: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  retryButton: {
    alignSelf: "flex-start",
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  retryLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
  errorText: {
    marginTop: spacing.sm,
    color: colors.warning,
    ...typography.small,
  },
});
