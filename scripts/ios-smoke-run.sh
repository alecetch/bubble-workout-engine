#!/usr/bin/env bash
set -euo pipefail
app="$GITHUB_WORKSPACE/mobile/ios-smoke-build/Build/Products/Release-iphonesimulator/Forma.app"
artifacts="$GITHUB_WORKSPACE/artifacts/ios-smoke"
simulator=""
case_name=""
collect_and_delete() {
  if [[ -n "$simulator" ]]; then
    xcrun simctl io "$simulator" screenshot "$artifacts/$case_name/final.png" || true
    gtimeout --kill-after=5s 60 xcrun simctl spawn "$simulator" log show --last 15m --style compact --predicate 'process == "Forma"' > "$artifacts/$case_name/simulator.log" 2>&1 || true
    mkdir -p "$artifacts/$case_name/crashes"
    if [[ -d "$HOME/Library/Logs/DiagnosticReports" ]]; then
      for report in "$HOME/Library/Logs/DiagnosticReports"/Forma*; do
        [[ ! -f "$report" ]] || cp "$report" "$artifacts/$case_name/crashes/" || true
      done
    fi
    xcrun simctl shutdown "$simulator" || true
    xcrun simctl delete "$simulator" || true
    simulator=""
  fi
}
trap collect_and_delete EXIT
maestro --version > "$artifacts/maestro-version.txt"
for case_name in allow deny cold-link warm-link; do
  mkdir -p "$artifacts/$case_name"
  # A NEW simulator per case resets Keychain and notification authorization too.
  simulator=$(xcrun simctl create "Forma-smoke-$case_name" "$IOS_DEVICE" "$IOS_RUNTIME")
  echo "$simulator" > "$artifacts/$case_name/simulator-udid.txt"
  xcrun simctl boot "$simulator"
  gtimeout --kill-after=10s 180 xcrun simctl bootstatus "$simulator" -b
  xcrun simctl status_bar "$simulator" override --time '9:41' --batteryState charged --batteryLevel 100
  gtimeout --kill-after=10s 120 xcrun simctl install "$simulator" "$app"
  password="$E2E_PASSWORD"
  expected_program='Strength Block'
  [[ "${FAILURE_INJECTION:-none}" != login ]] || password='DeliberatelyWrongPassword!'
  [[ "${FAILURE_INJECTION:-none}" != navigation ]] || expected_program='INJECTED MISSING PROGRAM'
  started=$(date +%s)
  result=0
  # Product failures are never retried or swallowed. Startup and each flow are bounded.
  gtimeout --kill-after=15s 300 maestro --device "$simulator" test \
    --no-ansi --format junit --output "$artifacts/$case_name/results.xml" \
    --debug-output "$artifacts/$case_name/maestro" \
    -e TEST_EMAIL="$E2E_EMAIL" -e TEST_PASSWORD="$password" \
    -e EXPECTED_PROGRAM="$expected_program" \
    "mobile/.maestro/ios/$case_name.yaml" \
    > "$artifacts/$case_name/maestro.log" 2>&1 || result=$?
  echo "$(( $(date +%s) - started ))" > "$artifacts/$case_name/seconds"
  echo "$result" > "$artifacts/$case_name/exit-code"
  cat "$artifacts/$case_name/maestro.log"
  collect_and_delete
  [[ "$result" == 0 ]] || exit "$result"
done
