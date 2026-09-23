# iOS release sign-off

Decision (2026-09-23): accept the Android-only E2E gap conditionally, with a physical-device sign-off gate for every iOS release candidate. Add macOS smoke CI as a separate follow-up. Green Android CI is not iOS release approval.

## Required release sequence

1. Build and upload an internal TestFlight candidate. Internal tester distribution is permitted so the exact binary can be tested; do not enable external distribution or submit for App Store review yet.
2. Obtain its exact EAS build ID, source commit, app version and build number from the build details. Check these against the installed TestFlight binary. Never substitute the latest build automatically.
3. Run every check below on a physical iPhone using that candidate and its actual environment flags. Record screenshots/video/logs in a durable private issue or release record; avoid credentials and personal data.
4. Copy `signoff.example.json` to `<version>-<build-number>.json`, replace placeholders, and record the actual tester, device, iOS version, UTC test time, evidence URL and each result. No skipped required checks. When notification tap-through is off, set its check to `disabled`; when on, it must pass.
5. Commit the completed record through review. From `mobile`, run `npm run check:ios-signoff -- ../releases/ios/<record>.json <build-id> <source-sha>`.
6. Run **iOS release readiness** in GitHub Actions on the branch containing the reviewed record, supplying that path, build ID and source SHA. It validates the attestation, audits the candidate source and archives the record. Include the successful run URL and committed JSON link in release notes.
7. Only then promote that exact TestFlight candidate to external testers / App Store review. A changed binary, commit or enabled feature flag needs new verification. Records expire for release eligibility after seven days; their history remains in Git. After artifact expiry, the committed record and evidence link remain the durable source.

This workflow does not publish, change App Store permissions, or verify that a person truthfully performed device checks. The release owner must enforce the successful-run requirement when promoting in App Store Connect. Direct console actions remain outside repository enforcement. There is no completed sign-off in the example and no current release is approved by this change.

## Physical-device checks

- `auth_keychain`: log in, force quit, relaunch, verify authentication persists; log out and confirm protected screens are inaccessible.
- `notification_allow`: with permission genuinely undetermined, exercise the native Allow prompt; registration and app navigation work.
- `notification_deny`: separately exercise Don't Allow; app remains usable without token registration. Turning notifications off in Settings is not equivalent to resetting the first-time prompt. Use a suitable fresh test installation/device and record how the permission state was established.
- `universal_link_cold` / `universal_link_warm`: tap a valid `https://getformai.com/ref/<CODE>` link from Notes/Messages with the candidate terminated and running; confirm native launch and referral capture.
- `workout_complete`: log in, open a program, start a workout, log a set and complete the day.
- `rapid_loading_unmount`: repeatedly navigate away while dashboard/day data loads; no native exception or stuck screen.
- `technique_media`: open technique guidance and exercise media, close and reopen, and navigate back; no native crash.
- `notification_tap_through`: keep the flag disabled unless separately tested; if enabled in this candidate, verify real notification navigation from foreground/background/terminated states.

Use an installed standalone/TestFlight build, not Expo Go, for release evidence. Simulator-only checks cannot satisfy this gate.

## Automation and remaining gap

Normal CI checks production mobile source for `expo-av` imports and Reanimated repeats without an explicit positive finite count. This deliberately conservative static rule covers all production mobile source, broader than the program-flow minimum. It is not a native runtime test or a proof against all ways of constructing a loop. Tests and test utilities are excluded.

The audit found and removed the reintroduced infinite SkeletonBlock shimmer. No production expo-av imports were found. Notification tap-through remains opt-in. expo-video is present and still needs real-device verification.

Follow-up: `docs/planning/ticket-ios-maestro-smoke-ci.md` (3-5 engineering days plus a week of CI observation).

References: [EAS CLI build inspection](https://docs.expo.dev/eas/cli/) and [GitHub workflow artifacts](https://docs.github.com/actions/configuring-and-managing-workflows/persisting-workflow-data-using-artifacts).
