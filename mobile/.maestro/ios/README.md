# iOS simulator smoke CI

Run **Actions > iOS Maestro smoke > Run workflow**. The workflow must first exist on the default branch for GitHub to offer dispatch; select the feature branch when validating subsequent changes. This is dispatch-only and is not a required merge or production-deploy check. The dispatcher (`github.actor`) owns triage for that run.

## Toolchain and build

- Standard `macos-26` ARM runner; Xcode **26.6**, iOS **26.5**, iPhone **17** simulator. Missing pinned tools/runtimes fail visibly; no silent latest-version fallback.
- Node **22.23.2**, Temurin **17.0.12+7**, CocoaPods **1.17.0**, Maestro **2.5.1**, Flyway **10.22.0**. Expo/React Native are resolved by the committed mobile lockfile (SDK 57). PostgreSQL **16** is a runner-local Homebrew installation; its patch version follows Homebrew.
- Expo prebuild generates a Release `.app` with bundled JavaScript, ARM64 simulator architecture and `CODE_SIGNING_ALLOWED=NO`. No Apple signing secrets, EAS credentials, development launcher or Metro server are needed.
- Local HTTP is allowed only in the generated simulator Info.plist. The bundle targets `http://127.0.0.1:3000`; it must never be distributed as a production app.
- App cache keys include platform, architecture, Xcode/runtime, mobile inputs, build script and workflow. There are no partial restore keys and no cached simulator/Keychain state. `cold_build=true` bypasses cache read/write.
- Postgres runs in a fresh runner-temp data directory. Native Flyway applies the repository migrations, then the existing E2E provisioning script creates an active Strength Block account through the local API. No production credentials, AI key, payment key or remote API is provided.

The chosen versions match the [runner inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md) and [Expo SDK 57 build image](https://docs.expo.dev/build-reference/infrastructure/). Compatibility still requires the first actual macOS run; this Windows implementation session cannot establish native compatibility.

## Assertions and isolation

Each case gets a newly created simulator, not just `clearState` or an uninstall (which can preserve Keychain data):

| Case | Required evidence |
| --- | --- |
| Allow | Fresh notification dialog, tap Allow, authenticated program loaded, dashboard navigation, force quit/relaunch without a second login |
| Deny | Separate fresh notification dialog, tap Don't Allow, same authenticated navigation and persistence assertions |
| Cold link | Open `formai://ref/ABCD2345` before the first launch; registration displays that referral code |
| Warm link | Launch to Welcome first, then open `formai://ref/WXYZ6789`; registration displays the new code |

Permissions begin `unset`, and the prompt assertion is mandatory. No optional assertion can hide a missing prompt or failed login. Referral tests verify URL handling and referral data reaching registration, not automatic navigation to registration or associated-domain delivery.

Startup and each Maestro invocation have timeouts. There are zero product retries so flakes remain visible; downloads have at most two retries. A failing Maestro exit or timeout exits the job after diagnostics/teardown. Each simulator is shut down/deleted; the workflow always attempts API/Postgres teardown and artifact upload. Hard runner cancellation can prevent cleanup steps, but all fixtures are disposable and local to that runner.

## Negative controls and reliability trial

Dispatch once with `failure_injection=login`, then once with `failure_injection=navigation`. Each must finish **red**, with a failing login/program assertion in the artifacts. These inputs intentionally do not change fixture credentials or create a matching program. A green negative-control run is a test-infrastructure defect. The local runner tests use stubbed commands to verify exit propagation/cleanup; they do not replace these native negative controls.

Dispatch with `cold_build=true`, then twice on identical source with it false (populate and hit cache). Download `ios-smoke-<run>-<attempt>` for JUnit, Maestro traces/screenshots, final screenshots, app simulator logs, crash reports, API/migration/build logs and `metrics.json`. Build duration is present for completed cold builds; cached builds are identified explicitly. No automatic retries mask failures.

For at least one week, dispatch representative mobile PR heads covering auth, navigation and native dependency changes. Maintain a record of run URL, SHA, dispatcher, cache state, build/total seconds, observed billing, result and failure classification. For unchanged-SHA reruns, classify a failure as flaky only when investigation supports that diagnosis; report flaky first attempts / all non-injected first attempts. Exclude intentional negative controls. Do not make this required until both controls fail correctly, all four cases pass, and the week of measured reliability is reviewed.

## Cost and remaining validation

Repository visibility was checked via the GitHub API on 2026-09-23: **public**. [GitHub's policy](https://docs.github.com/en/billing/concepts/product-billing/github-actions) makes standard hosted runner compute free for public repositories. The first run still needs to confirm runner availability and actual usage. Artifact/storage and future visibility/runner changes need separate billing review. Metrics deliberately mark billing unverified; optionally set repository variable `IOS_SMOKE_MACOS_RATE_USD` to the verified effective rate (including `0`) to estimate compute cost. Estimates round measured minutes up and exclude setup before measurement and artifact storage.

No Apple build, real simulator run, measured cold/warm timing, live negative-control result or week-long flake rate has been recorded yet. Keep the ticket's native acceptance open until those artifacts exist.

Physical iPhone sign-off remains required for real push delivery, Keychain behavior, universal links and release readiness. `EXPO_PUBLIC_ENABLE_NOTIFICATION_TAP_THROUGH=false` remains enforced for this suite. Simulator success does not authorize enabling notification tap-through.

## Local regression commands

```sh
node --test mobile/scripts/__tests__/ios-smoke-ci.test.mjs mobile/scripts/__tests__/ios-smoke-runner.test.mjs
cd mobile
npx tsc --noEmit
npx vitest run src/navigation/referralLinks.test.ts src/state/session/restoreSession.test.ts src/api/client.sessionExpiry.test.ts
node scripts/check-ios-safety.mjs
node scripts/check-a11y-regression.mjs
```

Runner tests execute the real orchestration shell with fake `xcrun`/Maestro/timeout commands and assert successful and failed process exits and teardown. They use Bash (Git Bash on Windows), not a simulator.
