# Onboarding QA Checklist

## Smoke Tests

1. Entry bootstrap flow
- Open onboarding entry with no linked profile.
- Confirm profile is created and linked once.
- Confirm app routes to the first incomplete step.

2. Resume flow
- With partially completed data in profile, reopen onboarding.
- Confirm app routes to Step 1, 2, 3, or done path deterministically.

3. Reduce motion
- Enable OS reduce motion.
- Confirm press scale animation is disabled.
- Confirm progress bar width updates without animated timing.

4. Step transitions
- Navigate Step1 -> Step2 -> Step3.
- Confirm transition style is slide-from-right with fade-like native motion.
- Confirm back gesture/action reverses correctly.

## Step 1 (Goals)

1. Required validation
- Leave goals/fitness/injury empty and tap Next.
- Confirm error banner shows, heavy haptic triggers, first invalid section scroll/pulses.

2. Injury exclusivity
- Select "No known issues", then select another injury.
- Confirm exclusivity is enforced in state.

3. Save path
- Fill valid values and tap Next.
- Confirm PATCH succeeds and navigates to Step2.
- Confirm navbar shows saving state and disables back/next while pending.

## Step 2 (Equipment)

1. Preset prefill
- Select each preset.
- Confirm inline "Prefilling equipment list..." appears.
- Confirm equipment item codes are populated from API data.

2. Prefill failure handling
- Simulate preset items API failure.
- Confirm inline error displays and Next is disabled.

3. Completion
- With valid preset + equipment codes, tap Next.
- Confirm step validation passes, onboardingStepCompleted updates to at least 2, and routes to Step3.

## Step 3 (Schedule & Metrics)

1. Required validation
- Leave required fields empty and tap Finish.
- Confirm banner + heavy haptic + scroll/pulse to first invalid section.

2. Under-18 blocking
- Select age range "Under 18".
- Confirm red blocking message appears.
- Confirm Finish is disabled and cannot proceed.

3. Finish save
- Enter valid values and tap Finish.
- Confirm schedule constraints are normalized.
- Confirm PATCH payload includes onboardingStepCompleted=3 and onboardingCompletedAt ISO timestamp.
- Confirm navigation to ProgramReview placeholder.

## Error/Retry

1. Entry errors
- Simulate `/me` or profile fetch failure.
- Confirm retry view appears.
- Confirm Retry restarts loading flow.

2. Save errors
- Simulate PATCH failures on each step.
- Confirm inline/user-facing error appears and user remains on current step.

## Regression Checks

1. Sticky nav save state
- During any mutation, confirm spinner + "Saving…" text is shown.
- Confirm both back and next are disabled while saving.

2. No duplicate bootstrap
- Verify create/link profile runs once per entry session (no loops).
