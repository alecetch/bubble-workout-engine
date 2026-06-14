import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../../components/Shell";
import { FormPanel } from "../../components/FormPanel";
import { TextInput } from "../../components/TextInput";
import { SelectInput } from "../../components/SelectInput";
import { SegmentedControl } from "../../components/SegmentedControl";
import { MultiSelectChipGroup } from "../../components/MultiSelectChipGroup";
import { PerformanceInputRow } from "../../components/PerformanceInputRow";
import type { PerformanceRowValue } from "../../components/PerformanceInputRow";
import { TimeInput } from "../../components/TimeInput";
import { PrivacyNotice } from "../../components/PrivacyNotice";
import { PrimaryButton } from "../../components/PrimaryButton";
import { SecondaryButton } from "../../components/SecondaryButton";
import { parseTimeToSeconds } from "../../utils/time";
import { submitRunningAnalysis } from "../../utils/runningApi";
import type { RunningAnalysisRequest } from "../../utils/runningApi";
import styles from "./RunningProfilerFormPage.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PERFORMANCE_ROWS: Array<{ distance: string; label: string; sub: string }> = [
  { distance: "5k", label: "5km", sub: "" },
  { distance: "10k", label: "10km", sub: "" },
  { distance: "half_marathon", label: "Half Marathon", sub: "21.1km" },
  { distance: "marathon", label: "Marathon", sub: "42.2km" },
];

const DEFAULT_PERF = (): PerformanceRowValue => ({
  timeRaw: "",
  approxDate: "",
  recency: "current",
});

export function RunningProfilerFormPage() {
  const navigate = useNavigate();

  // Section 1: About You
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("male");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [backgrounds, setBackgrounds] = useState<string[]>([]);
  const [yearsTraining, setYearsTraining] = useState("");

  // Section 2: Training Overview
  const [weeklyRunningVolume, setWeeklyRunningVolume] = useState("");
  const [runsPerWeek, setRunsPerWeek] = useState("");
  const [strengthSessions, setStrengthSessions] = useState("");
  const [hybridSessions, setHybridSessions] = useState("");
  const [primaryGoals, setPrimaryGoals] = useState<string[]>([]);
  const [currentConcern, setCurrentConcern] = useState("");

  // Section 3: Performances
  const [perfValues, setPerfValues] = useState<Record<string, PerformanceRowValue>>({
    "5k": DEFAULT_PERF(),
    "10k": DEFAULT_PERF(),
    half_marathon: DEFAULT_PERF(),
    marathon: DEFAULT_PERF(),
  });

  // Section 4: Context
  const [typicalTerrain, setTypicalTerrain] = useState("mixed");
  const [injuryLimitations, setInjuryLimitations] = useState("no");
  const [bodyCompositionGoal, setBodyCompositionGoal] = useState("");
  const [runningLimiter, setRunningLimiter] = useState("");
  const [mainCompetitionGoal, setMainCompetitionGoal] = useState("");
  const [target5k, setTarget5k] = useState("");
  const [target10k, setTarget10k] = useState("");
  const [targetHyrox, setTargetHyrox] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!email || !EMAIL_RE.test(email.trim())) {
      errs.email = "Valid email is required.";
    }
    const ageNum = parseInt(age, 10);
    if (!age || isNaN(ageNum) || ageNum < 16 || ageNum > 85) {
      errs.age = "Enter your age (16–85).";
    }
    const hasPerf = PERFORMANCE_ROWS.some((r) => perfValues[r.distance]?.timeRaw.trim());
    if (!hasPerf) {
      errs.performances = "Enter at least one performance time.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    setSubmitError(null);

    const performances = PERFORMANCE_ROWS.filter((r) => perfValues[r.distance]?.timeRaw.trim()).map((r) => {
      const pv = perfValues[r.distance];
      const timeSeconds = parseTimeToSeconds(pv.timeRaw) ?? 0;
      return {
        distance: r.distance,
        timeSeconds,
        approxDate: pv.approxDate || undefined,
        recency: pv.recency,
      };
    });

    const payload: RunningAnalysisRequest = {
      athlete: {
        name: name.trim() || undefined,
        email: email.trim(),
        age: parseInt(age, 10),
        gender: gender as "male" | "female",
        heightCm: heightCm ? parseInt(heightCm, 10) : undefined,
        weightKg: weightKg ? parseFloat(weightKg) : undefined,
      },
      trainingProfile: {
        backgrounds,
        yearsTraining: yearsTraining || undefined,
        weeklyRunningVolume: weeklyRunningVolume || undefined,
        runsPerWeek: runsPerWeek || undefined,
        strengthSessionsPerWeek: strengthSessions || undefined,
        hybridSessionsPerWeek: hybridSessions || undefined,
        primaryGoals,
        currentConcern: currentConcern || undefined,
      },
      performances,
      context: {
        typicalTerrain: typicalTerrain || undefined,
        injuryLimitations: injuryLimitations || undefined,
        bodyCompositionGoal: bodyCompositionGoal || undefined,
        runningLimiter: runningLimiter || undefined,
        mainCompetitionGoal: mainCompetitionGoal || undefined,
        target5kSeconds: target5k ? parseTimeToSeconds(target5k) ?? undefined : undefined,
        target10kSeconds: target10k ? parseTimeToSeconds(target10k) ?? undefined : undefined,
        targetHyroxSeconds: targetHyrox ? parseTimeToSeconds(targetHyrox) ?? undefined : undefined,
        additionalContext: additionalContext.trim() || undefined,
      },
      marketingConsent: false,
    };

    try {
      const response = await submitRunningAnalysis(payload);
      void navigate("/running-profiler/results", {
        state: { response, email: email.trim() },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setSubmitError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <div className={styles.page}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 28 }}>
          Running &amp; Hybrid Performance Profile
        </h1>

        {/* Section 1: About You */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>1</div>
            <div className={styles.sectionTitle}>About You</div>
          </div>
          <FormPanel>
            <div className={styles.grid2}>
              <TextInput
                label="Your Name"
                placeholder="Optional"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <TextInput
                label="Email Address"
                type="email"
                required
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
              />
              <TextInput
                label="Age"
                type="number"
                required
                placeholder="e.g. 45"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                error={errors.age}
              />
              <SegmentedControl
                label="Gender"
                required
                options={[
                  { value: "male", label: "Male" },
                  { value: "female", label: "Female" },
                ]}
                value={gender}
                onChange={setGender}
              />
              <TextInput
                label="Height (cm)"
                type="number"
                placeholder="Optional, e.g. 178"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
              />
              <TextInput
                label="Weight (kg)"
                type="number"
                placeholder="Optional, e.g. 80"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
              />
              <div className={styles.grid2Full}>
                <MultiSelectChipGroup
                  label="Training Background"
                  options={[
                    { value: "hyrox", label: "HYROX" },
                    { value: "deka", label: "DEKA" },
                    { value: "crossfit", label: "CrossFit" },
                    { value: "strength_training", label: "Strength Training" },
                    { value: "team_sports", label: "Team Sports" },
                    { value: "running", label: "Running" },
                    { value: "other", label: "Other" },
                  ]}
                  values={backgrounds}
                  onChange={setBackgrounds}
                />
              </div>
              <div className={styles.grid2Full}>
                <SelectInput
                  label="Years Training Consistently"
                  options={[
                    { value: "", label: "Select..." },
                    { value: "lt_1", label: "Less than 1 year" },
                    { value: "1_3", label: "1–3 years" },
                    { value: "3_5", label: "3–5 years" },
                    { value: "5_10", label: "5–10 years" },
                    { value: "10_plus", label: "10+ years" },
                  ]}
                  value={yearsTraining}
                  onChange={(e) => setYearsTraining(e.target.value)}
                />
              </div>
            </div>
          </FormPanel>
        </div>

        {/* Section 2: Training Overview */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>2</div>
            <div className={styles.sectionTitle}>Training Overview</div>
          </div>
          <FormPanel>
            <div className={styles.grid2}>
              <SelectInput
                label="Weekly Running Volume"
                options={[
                  { value: "", label: "Select..." },
                  { value: "0_10", label: "0–10 km" },
                  { value: "11_20", label: "11–20 km" },
                  { value: "21_35", label: "21–35 km" },
                  { value: "36_50", label: "36–50 km" },
                  { value: "51_70", label: "51–70 km" },
                  { value: "70_plus", label: "70+ km" },
                ]}
                value={weeklyRunningVolume}
                onChange={(e) => setWeeklyRunningVolume(e.target.value)}
              />
              <SelectInput
                label="Runs Per Week"
                options={[
                  { value: "", label: "Select..." },
                  { value: "0_1", label: "0–1" },
                  { value: "2", label: "2" },
                  { value: "3", label: "3" },
                  { value: "4", label: "4" },
                  { value: "5_plus", label: "5+" },
                ]}
                value={runsPerWeek}
                onChange={(e) => setRunsPerWeek(e.target.value)}
              />
              <SelectInput
                label="Strength Sessions / Week"
                options={[
                  { value: "", label: "Select..." },
                  { value: "0_1", label: "0–1" },
                  { value: "2_3", label: "2–3" },
                  { value: "4_5", label: "4–5" },
                  { value: "6_plus", label: "6+" },
                ]}
                value={strengthSessions}
                onChange={(e) => setStrengthSessions(e.target.value)}
              />
              <SelectInput
                label="Hybrid Sessions / Week"
                options={[
                  { value: "", label: "Select..." },
                  { value: "0", label: "0" },
                  { value: "1", label: "1" },
                  { value: "2", label: "2" },
                  { value: "3_plus", label: "3+" },
                ]}
                value={hybridSessions}
                onChange={(e) => setHybridSessions(e.target.value)}
              />
              <div className={styles.grid2Full}>
                <MultiSelectChipGroup
                  label="Primary Goals"
                  maxSelect={3}
                  options={[
                    { value: "improve_hyrox", label: "Improve HYROX" },
                    { value: "get_faster_5k_10k", label: "Faster 5k/10k" },
                    { value: "maintain_build_muscle", label: "Maintain/Build Muscle" },
                    { value: "improve_endurance", label: "Improve Endurance" },
                    { value: "lose_body_fat", label: "Lose Body Fat" },
                    { value: "stay_injury_free", label: "Stay Injury Free" },
                    { value: "general_fitness", label: "General Fitness" },
                  ]}
                  values={primaryGoals}
                  onChange={setPrimaryGoals}
                />
              </div>
              <div className={styles.grid2Full}>
                <SelectInput
                  label="Current Concern (optional)"
                  options={[
                    { value: "", label: "None / not sure" },
                    {
                      value: "running_hurts_strength_muscle",
                      label: "Running is hurting my strength or muscle",
                    },
                    {
                      value: "not_getting_faster",
                      label: "I'm not getting faster despite training",
                    },
                    {
                      value: "injury_setbacks",
                      label: "Injury setbacks are disrupting progress",
                    },
                    {
                      value: "recovery_issues",
                      label: "Poor recovery between sessions",
                    },
                    {
                      value: "not_sure_what_to_prioritise",
                      label: "Not sure what to prioritise",
                    },
                  ]}
                  value={currentConcern}
                  onChange={(e) => setCurrentConcern(e.target.value)}
                />
              </div>
            </div>
          </FormPanel>
        </div>

        {/* Section 3: Performances */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>3</div>
            <div className={styles.sectionTitle}>Performance Snapshot</div>
          </div>
          <FormPanel>
            <div className={styles.perfNote}>
              Old results are treated as historical context only and will not be
              used as your primary predictor.
            </div>
            {errors.performances && (
              <p style={{ color: "var(--accent-red)", fontSize: 13, marginBottom: 12 }}>
                {errors.performances}
              </p>
            )}
            <div className={styles.perfHeader}>
              <span className={styles.perfHeaderLabel}>Distance</span>
              <span className={styles.perfHeaderLabel}>Time</span>
              <span className={styles.perfHeaderLabel}>Approx Date</span>
              <span className={styles.perfHeaderLabel}>Recency</span>
            </div>
            {PERFORMANCE_ROWS.map((row) => (
              <PerformanceInputRow
                key={row.distance}
                distance={row.distance}
                label={row.label}
                sub={row.sub}
                value={perfValues[row.distance]}
                onChange={(val) =>
                  setPerfValues((prev) => ({ ...prev, [row.distance]: val }))
                }
              />
            ))}
          </FormPanel>
        </div>

        {/* Section 4: Context */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>4</div>
            <div className={styles.sectionTitle}>More Context</div>
          </div>
          <FormPanel>
            <div className={styles.grid2}>
              <SelectInput
                label="Typical Terrain"
                options={[
                  { value: "flat", label: "Flat / road" },
                  { value: "hilly", label: "Hilly" },
                  { value: "trail", label: "Trail" },
                  { value: "treadmill", label: "Treadmill" },
                  { value: "mixed", label: "Mixed" },
                ]}
                value={typicalTerrain}
                onChange={(e) => setTypicalTerrain(e.target.value)}
              />
              <SelectInput
                label="Injury Limitations"
                options={[
                  { value: "no", label: "None" },
                  { value: "minor_niggles", label: "Minor niggles" },
                  { value: "knee_ankle_foot", label: "Knee / ankle / foot" },
                  { value: "hip_back", label: "Hip / back" },
                  { value: "other", label: "Other" },
                ]}
                value={injuryLimitations}
                onChange={(e) => setInjuryLimitations(e.target.value)}
              />
              <SelectInput
                label="Body Composition Goal"
                options={[
                  { value: "", label: "Select..." },
                  { value: "maintain_muscle_recomp", label: "Maintain muscle / recomp" },
                  { value: "build_muscle", label: "Build muscle" },
                  { value: "lose_fat", label: "Lose fat" },
                  { value: "performance_only", label: "Performance only" },
                ]}
                value={bodyCompositionGoal}
                onChange={(e) => setBodyCompositionGoal(e.target.value)}
              />
              <SelectInput
                label="What limits your running most?"
                options={[
                  { value: "", label: "Not sure" },
                  { value: "time", label: "Time to train" },
                  { value: "joints", label: "Joint concerns" },
                  { value: "recovery", label: "Recovery" },
                  { value: "motivation", label: "Motivation" },
                  { value: "breathing_engine", label: "Breathing / engine" },
                  { value: "legs_fatigue", label: "Leg fatigue" },
                  { value: "not_sure", label: "Not sure" },
                ]}
                value={runningLimiter}
                onChange={(e) => setRunningLimiter(e.target.value)}
              />
              <SelectInput
                label="Main Competition Goal"
                options={[
                  { value: "", label: "None / general fitness" },
                  { value: "hyrox", label: "HYROX" },
                  { value: "deka", label: "DEKA" },
                  { value: "crossfit", label: "CrossFit" },
                  { value: "5k_10k_race", label: "5k / 10k Race" },
                  { value: "half_marathon", label: "Half Marathon" },
                  { value: "marathon", label: "Marathon" },
                ]}
                value={mainCompetitionGoal}
                onChange={(e) => setMainCompetitionGoal(e.target.value)}
              />
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <TimeInput
                    label="Target 5k"
                    placeholder="e.g. 22:00"
                    value={target5k}
                    onChange={(e) => setTarget5k(e.target.value)}
                  />
                  <TimeInput
                    label="Target 10k"
                    placeholder="e.g. 46:00"
                    value={target10k}
                    onChange={(e) => setTarget10k(e.target.value)}
                  />
                  <TimeInput
                    label="Target HYROX"
                    placeholder="e.g. 1:15:00"
                    value={targetHyrox}
                    onChange={(e) => setTargetHyrox(e.target.value)}
                  />
                </div>
              </div>
              <div className={styles.grid2Full}>
                <div className={styles.fieldLabel}>Additional Context (optional)</div>
                <textarea
                  className={styles.textarea}
                  placeholder="Anything else we should know about your training, goals, or constraints..."
                  maxLength={500}
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <PrivacyNotice />
            </div>

            {submitError && (
              <p
                style={{
                  marginTop: 12,
                  padding: "12px 16px",
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 13,
                  color: "var(--accent-red)",
                }}
              >
                {submitError}
              </p>
            )}

            <div className={styles.actions}>
              <SecondaryButton
                type="button"
                onClick={() => void navigate("/running-profiler")}
              >
                ← Back
              </SecondaryButton>
              <PrimaryButton
                type="button"
                loading={loading}
                disabled={loading}
                onClick={() => void handleSubmit()}
              >
                Analyse My Performance →
              </PrimaryButton>
            </div>
          </FormPanel>
        </div>
      </div>
    </Shell>
  );
}
