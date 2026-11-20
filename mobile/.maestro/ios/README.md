# iOS simulator smoke CI

Run **Actions > iOS Maestro smoke > Run workflow** and select the branch to verify. The workflow also runs nightly on the default branch (`main`) at **03:00 UTC**. Scheduled runs use `failure_injection=none` and `cold_build=false`. Run a fresh smoke before each EAS iOS release build and link the result in release evidence. It is not a required PR or production-deploy check; physical-iPhone sign-off remains the release gate. The dispatcher, or release owner for scheduled runs, owns triage.

## Toolchain and build

- Standard `macos-26` ARM runner; pinned Xcode 26.6, iOS 26.5, iPhone 17 simulator. Missing tools/runtimes fail visibly.
- Node comes from the repository `.nvmrc` (Node 24); Expo SDK 58 and React Native resolve from the committed mobile lockfile. Temurin 17.0.12+7, CocoaPods 1.17.0, Maestro 2.5.1 and Flyway 10.22.0 remain pinned. PostgreSQL 16 is runner-local Homebrew; its patch version follows Homebrew.
- Expo prebuild generates a Release ARM64 simulator `.app` with bundled JavaScript. The simulator build uses **ad-hoc signing**: `CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO`, preserving project entitlements. No Apple account, signing certificate, EAS credentials, Metro or development launcher is needed.
- Signing matters for expo-secure-store/Keychain access. After building, `codesign -d --entitlements :- <app>` must succeed and show `keychain-access-groups` or `application-identifier`. Otherwise the build fails with a clear error. Inspect `entitlements.txt` in the artifacts. The app cache key includes `adhoc-v2`; old unsigned apps cannot be reused. There are no partial cache restores or cached simulator/Keychain states. `cold_build=true` skips cache reads and writes.
- Only this build script exports `EXPO_PUBLIC_SMOKE_DIAGNOSTICS=true`. Each restore attempt writes one `[smoke]` line containing outcome, token-read/network stage, error class and optional code. No error message, token or user data is emitted. Real/EAS builds must leave the flag unset.
- Local HTTP is allowed only in the generated simulator Info.plist, targeting `http://127.0.0.1:3000`. Never distribute this build. Local Postgres, Flyway and the existing E2E fixture provision an active Strength Block account; no production database, AI or payment credentials are used.

## Assertions and isolation

Every case gets a new simulator, resetting Keychain and notification authorization, rather than just clearing app data.

| Case | Required evidence |
| --- | --- |
| Allow | Fresh notification prompt, Allow, authenticated program/dashboard navigation, quit/relaunch without another login |
| Deny | Separate fresh notification prompt, Don't Allow, the same authenticated navigation and persistence |
| Cold link | Open `forma://ref/ABCD2345` before first launch; registration displays that code |
| Warm link | Launch Welcome, then open `forma://ref/WXYZ6789`; registration displays the new code |

The custom URL scheme is an existing compatibility identifier. These flows check scheme handling and referral capture, not associated-domain delivery. Physical-device universal-link checks use `https://200days.app/ref/<CODE>`.

Prompt, login and navigation assertions remain mandatory and unchanged. No optional assertions or product retries hide failures. Startup and Maestro have bounded timeouts. Each attempted case writes `summary.txt` with PASS/FAIL, exit code and seconds; failures include the first Failed/Assertion line when one exists. Startup failures also get a summary. Simulators are shut down/deleted, and fixture teardown and artifact upload run even after failure. Hard runner cancellation may prevent cleanup, but fixtures are disposable and runner-local.

## Triage

Open the uploaded `ios-smoke-<run>-<attempt>` artifact in this order:

1. `<case>/summary.txt`: result, exit code, duration and first assertion. If there is no assertion, inspect startup/build failures.
2. `<case>/final.png`: what the app actually showed.
3. `api.log`: did the app call the API at all, or did startup fail before networking?
4. `<case>/simulator.log`: find the `[smoke]` restore line; compare `stage=token_read` with `stage=network`, the outcome and error code.
5. `<case>/maestro.log`, JUnit and the Maestro debug output: inspect the complete assertion and navigation history.

Also retain migration/build logs, entitlements, crash reports and `metrics.json`. If `vars.IOS_SMOKE_HEARTBEAT_URL` is configured, a successful run pings it with a ten-second timeout. Failure notifications remain GitHub Actions notifications; a missing heartbeat alone does not classify a failure.

The recorded 2026-11-14 run 43575365410 failed at Welcome with no app requests in the API log. Keychain entitlement failure is a likely cause, **not confirmed**. A Windows implementation session cannot run Xcode or read a new native trace. Dispatch on this branch and record the diagnostic finding before claiming native success. If the trace points elsewhere, investigate that cause rather than weakening the flows.

## Negative controls and reliability

After merge, dispatch on `main`, then `failure_injection=login` and `failure_injection=navigation`. Both controls must finish **red** for their intended login/navigation assertion. A green negative control is a test-infrastructure defect. Next run `cold_build=true`, then two normal runs on identical source to populate and hit the cache.

Record each result in [RELIABILITY.md](RELIABILITY.md). The trial requires **at least five non-injected runs over at least one week**. Let nightly runs continue for the week. Classify failures only after investigation as product, flaky or infrastructure; intentional failures are negative-control. Exclude negative controls from the non-injected reliability denominator. Capture build and total seconds from metrics; a cached build has no new build duration. Do not make this a required check as part of this change.

## Cost rule

The operating rule assumes a public repository with free standard hosted macOS compute. **If the repository becomes private, change the schedule from nightly to weekly** and record the decision here; private-repository macOS minutes are billable and count 10 times against included minutes. Review actual billing and artifact/storage charges. Optionally set `IOS_SMOKE_MACOS_RATE_USD` to the verified effective rate (including zero). Metrics round measured minutes upward and mark billing unverified; estimates exclude setup before measurement and artifact storage.

## Release sign-off

Run smoke before each EAS iOS release build. Then test the exact TestFlight release candidate on a physical iPhone using [the release sign-off runbook](../../../releases/ios/README.md). Commit the candidate JSON, with exact EAS build ID/source SHA and durable evidence, and run **Actions > iOS release readiness** (`ios-release-readiness.yml`). Simulator success cannot replace this gate or authorize notification tap-through; this smoke keeps it disabled.

## Local regression commands

```sh
node --test mobile/scripts/__tests__/ios-smoke-ci.test.mjs mobile/scripts/__tests__/ios-smoke-runner.test.mjs mobile/scripts/__tests__/validate-ios-signoff.test.mjs
cd mobile
npx tsc --noEmit
npx vitest run
node scripts/validate-coverage-manifest.mjs
node scripts/check-ios-safety.mjs
```

Script tests execute real orchestration scripts with fake Xcode/codesign/simulator/Maestro commands. They establish control flow, entitlement rejection and failure propagation, not native compatibility or a passing simulator run.
