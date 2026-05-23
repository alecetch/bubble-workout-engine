import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { OnboardingScaffold } from "../../components/onboarding/OnboardingScaffold";
import { SectionCard } from "../../components/onboarding/SectionCard";
import { NumericField } from "../../components/onboarding/NumericField";
import { hapticHeavy } from "../../components/interaction/haptics";
import { useMe, useUpdateClientProfile } from "../../api/hooks";
import { recordConsent, submitCheckIn } from "../../api/physique";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { parseNumberOrNull } from "../../utils/numbers";
import {
  cmToFeetInches,
  feetInchesToCm,
  kgToLbs,
  lbsToKg,
} from "../../utils/unitConversions";
import {
  clearPendingPhysiqueUpload,
  setPendingPhysiqueUpload,
} from "../../utils/pendingPhysiqueUpload";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";

type Props = NativeStackScreenProps<OnboardingStackParamList, "Step4BodyMetrics">;
type UnitSystem = "metric" | "imperial";

export function Step4BodyMetricsScreen({ navigation }: Props): React.JSX.Element {
  const meQuery = useMe();
  const profileId = meQuery.data?.clientProfileId ?? "";
  const updateClientProfile = useUpdateClientProfile(profileId || "");

  const draft = useOnboardingStore((state) => state.draft);
  const setDraft = useOnboardingStore((state) => state.setDraft);
  const isSaving = useOnboardingStore((state) => state.isSaving);
  const setIsSaving = useOnboardingStore((state) => state.setIsSaving);
  const setFieldErrors = useOnboardingStore((state) => state.setFieldErrors);

  const [unitSystem, setUnitSystem] = useState<UnitSystem>(
    draft.preferredUnit === "lbs" ? "imperial" : "metric",
  );
  const [heightCmInput, setHeightCmInput] = useState(
    draft.heightCm == null ? "" : String(draft.heightCm),
  );
  const [weightKgInput, setWeightKgInput] = useState(
    draft.weightKg == null ? "" : String(draft.weightKg),
  );
  const initImperial = useMemo(() => {
    const height = cmToFeetInches(draft.heightCm);
    const lbs = kgToLbs(draft.weightKg);
    return {
      feet: height ? String(height.feet) : "",
      inches: height ? String(height.inches) : "",
      lbs: lbs ? String(lbs) : "",
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [heightFtInput, setHeightFtInput] = useState(initImperial.feet);
  const [heightInInput, setHeightInInput] = useState(initImperial.inches);
  const [weightLbsInput, setWeightLbsInput] = useState(initImperial.lbs);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  function switchToMetric(): void {
    const cm = feetInchesToCm(
      parseNumberOrNull(heightFtInput),
      parseNumberOrNull(heightInInput),
    );
    const kg = lbsToKg(parseNumberOrNull(weightLbsInput));
    setHeightCmInput(cm == null ? "" : String(cm));
    setWeightKgInput(kg == null ? "" : String(kg));
    setDraft({ preferredUnit: "kg" });
    setUnitSystem("metric");
  }

  function switchToImperial(): void {
    const imp = cmToFeetInches(parseNumberOrNull(heightCmInput));
    const lbs = kgToLbs(parseNumberOrNull(weightKgInput));
    setHeightFtInput(imp ? String(imp.feet) : "");
    setHeightInInput(imp ? String(imp.inches) : "");
    setWeightLbsInput(lbs == null ? "" : String(lbs));
    setDraft({ preferredUnit: "lbs" });
    setUnitSystem("imperial");
  }

  function currentHeightCm(): number | null {
    if (unitSystem === "metric") {
      const value = parseNumberOrNull(heightCmInput);
      return value == null ? null : Math.round(value);
    }
    return feetInchesToCm(parseNumberOrNull(heightFtInput), parseNumberOrNull(heightInInput));
  }

  function currentWeightKg(): number | null {
    if (unitSystem === "metric") {
      const value = parseNumberOrNull(weightKgInput);
      return value == null ? null : Number(value.toFixed(1));
    }
    return lbsToKg(parseNumberOrNull(weightLbsInput));
  }

  async function pickFromLibrary(): Promise<void> {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function takePhoto(): Promise<void> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function startBackgroundPhotoUpload(uri: string): Promise<void> {
    setIsUploadingPhoto(true);
    try {
      await setPendingPhysiqueUpload(uri);
      await recordConsent();
      await submitCheckIn(uri, { skipAnalysis: true });
      await clearPendingPhysiqueUpload();
    } catch {
      // The URI stays queued for retry from the physique check-in screen.
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  async function handleFinish(): Promise<void> {
    if (!profileId) {
      await hapticHeavy();
      setFieldErrors({ heightCm: "Unable to save profile right now. Please retry." });
      return;
    }

    const heightCm = currentHeightCm();
    const weightKg = currentWeightKg();
    setDraft({ heightCm, weightKg });

    try {
      setIsSaving(true);
      await updateClientProfile.mutateAsync({
        heightCm,
        weightKg,
        preferredUnit: unitSystem === "imperial" ? "lbs" : "kg",
        onboardingStepCompleted: 4,
        onboardingCompletedAt: new Date().toISOString(),
      });
      if (photoUri) {
        void startBackgroundPhotoUpload(photoUri);
      }
      navigation.navigate("SplitReview", {
        daysPerWeek: draft.preferredDays.length || undefined,
      });
    } catch {
      await hapticHeavy();
      setFieldErrors({ heightCm: "Unable to save this step. Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <OnboardingScaffold
      step={4}
      title="Body metrics"
      subtitle="Optional details that help calibrate load targets and track where you started."
      errorBannerVisible={false}
      onBack={() => navigation.replace("Step3Schedule")}
      onNext={() => {
        void handleFinish();
      }}
      nextLabel="Finish"
      nextDisabled={isSaving || meQuery.isLoading}
      isSaving={isSaving}
    >
      <View style={styles.unitToggle}>
        <Pressable
          style={[styles.unitBtn, unitSystem === "metric" && styles.unitBtnActive]}
          onPress={switchToMetric}
        >
          <Text style={[styles.unitBtnLabel, unitSystem === "metric" && styles.unitBtnLabelActive]}>
            Metric (cm / kg)
          </Text>
        </Pressable>
        <Pressable
          style={[styles.unitBtn, unitSystem === "imperial" && styles.unitBtnActive]}
          onPress={switchToImperial}
        >
          <Text style={[styles.unitBtnLabel, unitSystem === "imperial" && styles.unitBtnLabelActive]}>
            Imperial (ft, in / lbs)
          </Text>
        </Pressable>
      </View>

      <SectionCard title="Body metrics" subtitle="Optional - helps personalise load targets.">
        {unitSystem === "metric" ? (
          <>
            <NumericField
              label="Height (cm)"
              testID="height-cm-input"
              value={heightCmInput}
              onChangeText={setHeightCmInput}
              placeholder="e.g. 175"
            />
            <NumericField
              label="Weight (kg)"
              testID="weight-kg-input"
              value={weightKgInput}
              onChangeText={setWeightKgInput}
              placeholder="e.g. 72.5"
            />
          </>
        ) : (
          <>
            <View style={styles.ftInRow}>
              <View style={styles.ftField}>
                <NumericField
                  label="Height (ft)"
                  testID="height-ft-input"
                  value={heightFtInput}
                  onChangeText={setHeightFtInput}
                  placeholder="5"
                />
              </View>
              <View style={styles.inField}>
                <NumericField
                  label="(in)"
                  testID="height-in-input"
                  value={heightInInput}
                  onChangeText={setHeightInInput}
                  placeholder="11"
                />
              </View>
            </View>
            <NumericField
              label="Weight (lbs)"
              testID="weight-lbs-input"
              value={weightLbsInput}
              onChangeText={setWeightLbsInput}
              placeholder="e.g. 160"
            />
          </>
        )}
      </SectionCard>

      <SectionCard
        title="Starting photo"
        subtitle="Optional - capture a private baseline to track progress over time."
      >
        {photoUri ? (
          <View style={styles.photoPreviewRow}>
            <Image
              testID="starting-photo-preview"
              source={{ uri: photoUri }}
              style={styles.photoThumb}
              resizeMode="cover"
            />
            <Pressable style={styles.clearPhoto} onPress={() => setPhotoUri(null)}>
              <Text style={styles.clearPhotoLabel}>Remove</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.photoButtonRow}>
            <Pressable style={styles.photoBtn} onPress={() => void takePhoto()}>
              <Text style={styles.photoBtnLabel}>Camera</Text>
            </Pressable>
            <Pressable style={styles.photoBtn} onPress={() => void pickFromLibrary()}>
              <Text style={styles.photoBtnLabel}>Library</Text>
            </Pressable>
          </View>
        )}
        {isUploadingPhoto ? (
          <ActivityIndicator size="small" color={colors.accent} style={styles.photoSpinner} />
        ) : null}
      </SectionCard>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  unitToggle: {
    flexDirection: "row",
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: spacing.sm,
  },
  unitBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  unitBtnActive: {
    backgroundColor: colors.accent,
  },
  unitBtnLabel: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  unitBtnLabelActive: {
    color: colors.background,
  },
  ftInRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  ftField: {
    flex: 1,
  },
  inField: {
    flex: 1,
  },
  photoButtonRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  photoBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  photoBtnLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  photoPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  photoThumb: {
    width: 84,
    height: 112,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  clearPhoto: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  clearPhotoLabel: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
  },
  photoSpinner: {
    marginTop: spacing.sm,
  },
});
