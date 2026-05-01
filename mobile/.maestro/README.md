# Maestro E2E Smoke Tests

## Prerequisites

- Maestro installed: `brew install maestro`
- Expo dev build running: `cd mobile && expo start`
- Test credentials set: copy `maestro.env.example` to `maestro.env` and fill in real values
- The test account should have an active program named `Strength Block`

## Run

Single flow:

```sh
maestro test mobile/.maestro/01-auth-login.yaml --env-file mobile/.maestro/maestro.env
```

All flows:

```sh
maestro test mobile/.maestro/ --env-file mobile/.maestro/maestro.env
```
