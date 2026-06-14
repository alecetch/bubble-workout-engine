import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { FormPanel } from "../components/FormPanel";
import { TextInput } from "../components/TextInput";
import { SegmentedControl } from "../components/SegmentedControl";
import { TimeInput } from "../components/TimeInput";
import { PrimaryButton } from "../components/PrimaryButton";
import { loadDraft, saveDraft } from "../utils/storage";
import { parseTimeToSeconds, formatSeconds } from "../utils/time";
import { trackEvent } from "../utils/api";
import type { HyroxCalculatorDraft } from "../types";
import styles from "./RaceDetailsPage.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RaceDetailsPage() {
  const navigate = useNavigate();
  const draft = loadDraft();

  const [name, setName] = useState(draft?.athlete?.name ?? "");
  const [email, setEmail] = useState(draft?.athlete?.email ?? "");
  const [gender, setGender] = useState<"male" | "female">(
    draft?.athlete?.gender ?? "male",
  );
  const [age, setAge] = useState(
    draft?.athlete?.ageOnRaceDay ? String(draft.athlete.ageOnRaceDay) : "",
  );
  const [raceName, setRaceName] = useState(draft?.race?.raceName ?? "");
  const [raceDate, setRaceDate] = useState(draft?.race?.raceDate ?? "");
  const [division, setDivision] = useState<
    "open" | "pro" | "doubles" | "relay"
  >(draft?.race?.division ?? "open");
  const [finishTime, setFinishTime] = useState(
    draft?.race?.finishTimeSeconds
      ? formatSeconds(draft.race.finishTimeSeconds)
      : "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    trackEvent("hyrox_calculator_started");
  }, []);

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!email || !EMAIL_RE.test(email.trim())) {
      errs.email = "Valid email address is required.";
    }

    const ageNum = parseInt(age, 10);
    if (!age || isNaN(ageNum) || ageNum < 16 || ageNum > 80) {
      errs.age = "Enter your age (16–80).";
    }

    const parsedFinish = parseTimeToSeconds(finishTime);
    if (!finishTime || parsedFinish === null) {
      errs.finishTime = "Enter finish time, e.g. 1:25:17 or 85:17";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    if (!validate()) return;

    const finishSeconds = parseTimeToSeconds(finishTime) ?? 0;
    const updated: Partial<HyroxCalculatorDraft> = {
      athlete: {
        name: name.trim() || undefined,
        email: email.trim(),
        gender,
        ageOnRaceDay: parseInt(age, 10),
      },
      race: {
        raceName: raceName.trim() || undefined,
        raceDate: raceDate || undefined,
        division,
        finishTimeSeconds: finishSeconds,
      },
    };
    saveDraft(updated);
    trackEvent("race_details_completed");
    void navigate("/hyrox-calculator/splits");
  }

  return (
    <Shell>
      <div className={styles.layout}>
        {/* Left pitch column */}
        <div className={styles.pitchCol}>
          <div className={styles.eyebrow}>Forma — Performance Engineer</div>
          <h1 className={styles.headline}>
            Data in.
            <br />
            Insight out.
            <br />
            Performance up.
          </h1>
          <p className={styles.subline}>
            Enter your HYROX race result and get a personalised performance
            analysis delivered to your inbox — free.
          </p>
          <ul className={styles.bullets}>
            {[
              "Identify your biggest time limiter across 16 segments",
              "Benchmark against athletes in your age group and division",
              "Get a clear training focus for your next event",
              "Understand your run/work balance and roxzone",
            ].map((b) => (
              <li key={b} className={styles.bullet}>
                <span className={styles.bulletIcon}>→</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Link
              to="/hyrox-calculator/sample-report"
              className={styles.externalLink}
            >
              View Sample Report →
            </Link>
            <a
              href="https://results.hyrox.com"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.externalLink}
            >
              Need your results? Visit results.hyrox.com ↗
            </a>
          </div>
        </div>

        {/* Right form column */}
        <div className={styles.formCol}>
          <FormPanel>
            <h2 className={styles.formTitle}>Your Race Details</h2>
            <div className={styles.fields}>
              <TextInput
                label="Athlete Name"
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
              <div className={styles.row2}>
                <SegmentedControl
                  label="Gender"
                  required
                  options={[
                    { value: "male", label: "Male" },
                    { value: "female", label: "Female" },
                  ]}
                  value={gender}
                  onChange={(v) => setGender(v as "male" | "female")}
                />
                <TextInput
                  label="Age on Race Day"
                  type="number"
                  required
                  placeholder="e.g. 35"
                  min={16}
                  max={80}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  error={errors.age}
                />
              </div>
              <TextInput
                label="Race Name"
                placeholder="e.g. HYROX Manchester"
                value={raceName}
                onChange={(e) => setRaceName(e.target.value)}
              />
              <TextInput
                label="Race Date"
                type="date"
                value={raceDate}
                onChange={(e) => setRaceDate(e.target.value)}
              />
              <SegmentedControl
                label="Division"
                required
                options={[
                  { value: "open", label: "Open" },
                  { value: "pro", label: "Pro" },
                  { value: "doubles", label: "Doubles" },
                  { value: "relay", label: "Relay" },
                ]}
                value={division}
                onChange={(v) =>
                  setDivision(v as "open" | "pro" | "doubles" | "relay")
                }
              />
              <TimeInput
                label="Finish Time"
                required
                placeholder="1:25:17 or 85:17"
                hint="HH:MM:SS or MM:SS (e.g. 85:17 for 1h 25m 17s)"
                value={finishTime}
                onChange={(e) => setFinishTime(e.target.value)}
                error={errors.finishTime}
              />

              <div className={styles.actions}>
                <PrimaryButton type="button" fullWidth onClick={handleNext}>
                  Next: Enter Your Splits →
                </PrimaryButton>
              </div>
            </div>
          </FormPanel>
        </div>
      </div>
    </Shell>
  );
}
