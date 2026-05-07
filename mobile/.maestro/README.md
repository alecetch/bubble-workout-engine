# Maestro E2E Smoke Tests

## Prerequisites

- Maestro installed.
- Android emulator running with the Expo development build installed. Use an Android 14 / API 34 image; newer preview images can fail during Maestro driver startup on tcp:7001.
- Metro running on port 8081: `cd mobile && npx expo start --dev-client --localhost --port 8081`.
- Test credentials in `mobile/.maestro/maestro.env` (copy from `maestro.env.example`).
- The test account must have an active program named `Strength Block`.

### State preconditions per flow

| Flow | Required state |
|------|---------------|
| `01-auth-login` | Test account **logged out** on the emulator. If logged in, go to Settings → **Log Out** first. |
| `02-start-workout` | Test account **logged in** with an active "Strength Block" program. Run `01-auth-login` first, or log in manually. |

> **Why no `clearState`**: `pm clear` (Maestro's `clearState: true`) invalidates the Android instrumentation context that the Maestro gRPC driver runs within. State is managed via preconditions instead.

> **Why no `openLink`**: Sending a deep-link intent via `openLink` restarts the Expo launcher activity, terminating the Maestro gRPC driver on tcp:7001. The flows instead tap the Metro server entry directly in the dev-client launcher UI — same activity, driver stays alive.

> **Why pre-install driver APKs**: Maestro uninstalls its driver APKs at the end of every session. Its auto-reinstall on the next session fails silently on this setup. `run.ps1` reinstalls them before each run.

> **Why `run.ps1` force-stops before installing APKs**: A crashed Maestro session can leave the old instrumentation process alive. That zombie holds port 7001, causing the new session's `awaitLaunch` to time out. The force-stop kills it cleanly. The app is intentionally NOT pre-launched — Maestro's `am instrument` starts the app as part of its own session init, which is the correct path for instrumentation to attach.

> **Why `scripts/post-launch-sleep.js`**: `launchApp: stopApp: false` causes the Maestro gRPC driver to restart: the old gRPC server closes and a new one starts in the fresh app process. `extendedWaitUntil` throws immediately on `UNAVAILABLE` (does not retry connection failures). The `runScript` step runs on the host machine — no gRPC needed — and sleeps 7 s while the new instrumentation opens port 7001.

## Run

Use `run.ps1` — it clears prior Maestro driver state, reinstalls the driver APKs, and runs Maestro in one step:

```powershell
# Single flow
.\mobile\.maestro\run.ps1 01-auth-login -e TEST_EMAIL=testuser@example.com -e TEST_PASSWORD=TestPass123!

# All flows
.\mobile\.maestro\run.ps1 -e TEST_EMAIL=testuser@example.com -e TEST_PASSWORD=TestPass123!
```

Do not call `maestro test` directly — the driver APKs will be missing and the run will fail at `launchApp`.
